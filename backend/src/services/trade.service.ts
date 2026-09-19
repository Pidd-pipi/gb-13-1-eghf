import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Book } from '../entities/Book';
import { PurchaseRequest } from '../entities/PurchaseRequest';
import { Trade, TradeStatus } from '../entities/Trade';
import { normalizeCourseCode, normalizeText } from './matching.service';

export class TradeError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'TradeError';
  }
}

const serializeTrade = (trade: Trade, extras: Record<string, unknown> = {}) => ({
  id: trade.id,
  purchaseRequestId: trade.purchaseRequestId,
  bookId: trade.bookId,
  buyerId: trade.buyerId,
  sellerId: trade.sellerId,
  price: trade.price,
  status: trade.status,
  cancelledBy: trade.cancelledBy,
  createdAt: trade.createdAt,
  updatedAt: trade.updatedAt,
  ...extras,
});

/**
 * 买家在求购单详情中选定一本书：
 * 仅当书与求购单【同校区、同课程代码、同版次】且书为 available 时才能预约。
 *
 * 并发安全：在一个事务内通过
 *   UPDATE books SET status='reserved' WHERE id=? AND status='available'
 * 做条件抢占。MySQL InnoDB 会对命中的行加排他行锁，两个并发请求中只有一个能
 * 影响 1 行；另一个影响 0 行而失败。trades 表上的 pendingBookId 唯一索引则提供
 * 数据库级兜底，确保同一本书任意时刻至多一条进行中(pending)交易。
 */
export const selectBookForRequest = async (
  buyerId: string,
  purchaseRequestId: string,
  bookId: string,
) => {
  return AppDataSource.transaction(async (manager: EntityManager) => {
    const request = await manager.findOne(PurchaseRequest, { where: { id: purchaseRequestId } });
    if (!request) {
      throw new TradeError(404, '求购单不存在');
    }
    if (request.requesterId !== buyerId) {
      throw new TradeError(403, '只能为自己的求购单选择书籍');
    }
    if (request.status !== 'active') {
      throw new TradeError(409, '求购单已关闭，无法选择书籍');
    }

    const book = await manager.findOne(Book, {
      where: { id: bookId },
      relations: ['seller'],
    });
    if (!book) {
      throw new TradeError(404, '书籍不存在');
    }
    if (book.sellerId === buyerId) {
      throw new TradeError(400, '不能预约自己发布的书');
    }

    // 同版匹配三项硬性条件
    if (normalizeText(book.campus) !== normalizeText(request.campus)) {
      throw new TradeError(400, '该书与求购单不在同一校区');
    }
    if (normalizeCourseCode(book.courseCode) !== normalizeCourseCode(request.courseCode)) {
      throw new TradeError(400, '该书课程代码与求购单不一致');
    }
    if (normalizeText(book.edition) !== normalizeText(request.edition)) {
      throw new TradeError(400, '该书版次与求购单不一致');
    }

    // 1) 重复选择幂等：同一求购单 + 同一本书 + 同一买家，且交易仍在进行中 -> 直接返回原交易
    const sameSelection = await manager.findOne(Trade, {
      where: { purchaseRequestId, bookId, buyerId, status: 'pending' as TradeStatus },
    });
    if (sameSelection) {
      return {
        alreadySelected: true,
        trade: serializeTrade(sameSelection, {
          book: { id: book.id, title: book.title, status: book.status },
          seller: book.seller ? { id: book.seller.id, name: book.seller.name } : undefined,
        }),
      };
    }

    // 2) 一个求购单同一时刻只能选定一本书：已选别的书需先取消或等待结束
    const requestPendingOther = await manager.findOne(Trade, {
      where: { purchaseRequestId, buyerId, status: 'pending' as TradeStatus },
    });
    if (requestPendingOther) {
      throw new TradeError(409, '该求购单已选定其他书籍，请先取消当前交易再重新选择');
    }

    // 3) 原子条件抢占：只有当前 status='available' 才能改为 'reserved'
    const updateResult = await manager
      .createQueryBuilder()
      .update(Book)
      .set({ status: 'reserved' })
      .where('id = :id AND status = :status', { id: bookId, status: 'available' })
      .execute();

    if (!updateResult.affected || updateResult.affected === 0) {
      // 区分是被别人抢走，还是已售出
      const latest = await manager.findOne(Book, { where: { id: bookId } });
      if (latest?.status === 'sold') {
        throw new TradeError(409, '该书已售出，无法预约');
      }
      throw new TradeError(409, '手慢一步，该书已被其他求购单预约');
    }

    const trade = manager.create(Trade, {
      purchaseRequestId,
      bookId,
      buyerId,
      sellerId: book.sellerId,
      price: book.price,
      status: 'pending' as TradeStatus,
      cancelledBy: null,
    });

    try {
      await manager.save(trade);
    } catch (err: any) {
      // 命中 pendingBookId 唯一索引：极端并发下另一笔进行中交易已抢先。
      // 回滚本事务刚做的预约，避免书被悬空锁定。
      await manager
        .createQueryBuilder()
        .update(Book)
        .set({ status: 'available' })
        .where('id = :id AND status = :status', { id: bookId, status: 'reserved' })
        .execute();
      throw new TradeError(409, '该书已有进行中的交易，无法重复预约');
    }

    return {
      alreadySelected: false,
      trade: serializeTrade(trade, {
        book: { id: book.id, title: book.title, status: 'reserved' as const },
        seller: book.seller ? { id: book.seller.id, name: book.seller.name } : undefined,
      }),
    };
  });
};

/** 加载交易并校验当前用户是买家或卖家 */
const loadTradeForParty = async (manager: EntityManager, tradeId: string, userId: string) => {
  const trade = await manager.findOne(Trade, { where: { id: tradeId } });
  if (!trade) {
    throw new TradeError(404, '交易记录不存在');
  }
  if (trade.buyerId !== userId && trade.sellerId !== userId) {
    throw new TradeError(403, '无权操作该交易');
  }
  return trade;
};

/** 释放书籍：交易结束（取消/拒绝）后把书恢复为 available，重新可被其他求购单匹配 */
const releaseBook = async (manager: EntityManager, bookId: string) => {
  await manager
    .createQueryBuilder()
    .update(Book)
    .set({ status: 'available' })
    .where('id = :id AND status = :status', { id: bookId, status: 'reserved' })
    .execute();
};

/**
 * 买家取消：仅进行中(pending)交易可取消，释放书籍，其他求购单可重新匹配。
 */
export const cancelTradeByBuyer = async (userId: string, tradeId: string) =>
  AppDataSource.transaction(async (manager) => {
    const trade = await loadTradeForParty(manager, tradeId, userId);
    if (trade.buyerId !== userId) {
      throw new TradeError(403, '只有买家可以取消交易');
    }
    if (trade.status !== 'pending') {
      throw new TradeError(409, `当前交易状态为${trade.status}，无法取消`);
    }
    trade.status = 'cancelled';
    trade.cancelledBy = 'buyer';
    await manager.save(trade);
    await releaseBook(manager, trade.bookId);
    return serializeTrade(trade, { message: '已取消，书籍已释放供其他求购单匹配' });
  });

/**
 * 卖家拒绝：仅进行中(pending)交易可拒绝，释放书籍，其他求购单可重新匹配。
 */
export const rejectTradeBySeller = async (userId: string, tradeId: string) =>
  AppDataSource.transaction(async (manager) => {
    const trade = await loadTradeForParty(manager, tradeId, userId);
    if (trade.sellerId !== userId) {
      throw new TradeError(403, '只有卖家可以拒绝交易');
    }
    if (trade.status !== 'pending') {
      throw new TradeError(409, `当前交易状态为${trade.status}，无法拒绝`);
    }
    trade.status = 'rejected';
    trade.cancelledBy = 'seller';
    await manager.save(trade);
    await releaseBook(manager, trade.bookId);
    return serializeTrade(trade, { message: '已拒绝，书籍已释放供其他求购单匹配' });
  });

/**
 * 完成交易（买卖双方任一方确认）：书置为 sold，不再释放。
 */
export const completeTrade = async (userId: string, tradeId: string) =>
  AppDataSource.transaction(async (manager) => {
    const trade = await loadTradeForParty(manager, tradeId, userId);
    if (trade.status !== 'pending') {
      throw new TradeError(409, `当前交易状态为${trade.status}，无法完成`);
    }
    trade.status = 'completed';
    await manager.save(trade);
    await manager
      .createQueryBuilder()
      .update(Book)
      .set({ status: 'sold' })
      .where('id = :id', { id: trade.bookId })
      .execute();
    return serializeTrade(trade, { message: '交易已完成' });
  });

export interface TradeListFilters {
  role?: 'buyer' | 'seller';
  status?: TradeStatus;
  bookId?: string;
}

/** 查询当前用户相关的交易（作为买家或卖家） */
export const listMyTrades = async (userId: string, filters: TradeListFilters = {}) => {
  // 使用 QueryBuilder 显式处理“买家 OR 卖家”与其他 AND 条件，
  // 避免 find({where:[...]}) 在 OR 数组下丢失第二个对象的列。
  const qb = AppDataSource.getRepository(Trade)
    .createQueryBuilder('trade')
    .where('(trade.buyerId = :userId OR trade.sellerId = :userId)', { userId })
    .orderBy('trade.createdAt', 'DESC');

  if (filters.role === 'buyer') {
    qb.andWhere('trade.buyerId = :userId');
  } else if (filters.role === 'seller') {
    qb.andWhere('trade.sellerId = :userId');
  }
  if (filters.status) {
    qb.andWhere('trade.status = :status', { status: filters.status });
  }
  if (filters.bookId) {
    qb.andWhere('trade.bookId = :bookId', { bookId: filters.bookId });
  }

  const trades = await qb.getMany();

  // 批量带上书与求购单概要，避免 N+1
  const bookIds = Array.from(new Set(trades.map((t) => t.bookId)));
  const requestIds = Array.from(new Set(trades.map((t) => t.purchaseRequestId)));
  let books: Book[] = [];
  let requests: PurchaseRequest[] = [];
  if (bookIds.length) {
    books = await AppDataSource.getRepository(Book).find({
      where: { id: In(bookIds) },
      relations: ['seller'],
    });
  }
  if (requestIds.length) {
    requests = await AppDataSource.getRepository(PurchaseRequest).find({
      where: { id: In(requestIds) },
    });
  }
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const requestMap = new Map(requests.map((r) => [r.id, r]));

  return trades.map((trade) =>
    serializeTrade(trade, {
      role: trade.buyerId === userId ? ('buyer' as const) : ('seller' as const),
      book: bookMap.get(trade.bookId)
        ? {
            id: trade.bookId,
            title: bookMap.get(trade.bookId)!.title,
            price: bookMap.get(trade.bookId)!.price,
            images: bookMap.get(trade.bookId)!.images,
            status: bookMap.get(trade.bookId)!.status,
            courseCode: bookMap.get(trade.bookId)!.courseCode,
            edition: bookMap.get(trade.bookId)!.edition,
            campus: bookMap.get(trade.bookId)!.campus,
          }
        : undefined,
      purchaseRequest: requestMap.get(trade.purchaseRequestId)
        ? {
            id: trade.purchaseRequestId,
            bookTitle: requestMap.get(trade.purchaseRequestId)!.bookTitle,
            courseCode: requestMap.get(trade.purchaseRequestId)!.courseCode,
            edition: requestMap.get(trade.purchaseRequestId)!.edition,
            campus: requestMap.get(trade.purchaseRequestId)!.campus,
          }
        : undefined,
    }),
  );
};

/** 查询单条交易详情（仅买卖双方） */
export const getTradeById = async (userId: string, tradeId: string) => {
  const trade = await AppDataSource.getRepository(Trade).findOne({ where: { id: tradeId } });
  if (!trade) {
    throw new TradeError(404, '交易记录不存在');
  }
  if (trade.buyerId !== userId && trade.sellerId !== userId) {
    throw new TradeError(403, '无权查看该交易');
  }
  const book = await AppDataSource.getRepository(Book).findOne({
    where: { id: trade.bookId },
    relations: ['seller'],
  });
  const purchaseRequest = await AppDataSource.getRepository(PurchaseRequest).findOne({
    where: { id: trade.purchaseRequestId },
    relations: ['requester'],
  });
  return serializeTrade(trade, {
    role: trade.buyerId === userId ? 'buyer' : 'seller',
    book,
    purchaseRequest,
  });
};
