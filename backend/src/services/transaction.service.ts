import { EntityManager, IsNull, Not } from 'typeorm';
import { ds } from './db';
import { Book } from '../entities/Book';
import { PurchaseRequest } from '../entities/PurchaseRequest';
import { Transaction } from '../entities/Transaction';
import { matchingService } from './matching.service';
import { keyedLock } from './lock';

export class BusinessError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

// 统一的资源锁命名与加锁顺序（字典序 book < request < transaction，多锁场景不会死锁）
const bookLock = (id: string) => `book:${id}`;
const requestLock = (id: string) => `request:${id}`;
const transactionLock = (id: string) => `transaction:${id}`;

/**
 * 教材同版交易闭环服务。
 *
 * 状态机：
 *   买家选定 ──► pending（书预约、求购单 matched）
 *     ├─ 卖家接受 ──► accepted
 *     │    └─ 买卖任一方确认完成 ──► completed（书售出、求购单 closed）
 *     ├─ 卖家拒绝 ──► rejected（书释放 available、求购单 active 可重新匹配）
 *     └─ 买家取消 ──► cancelled（同上释放）
 *
 * 并发安全（三道防线）：
 *   1. 进程内键控互斥锁：对同一本书/求购单/交易的写操作在应用层串行化；
 *   2. 条件 UPDATE（WHERE status = ...），affected=0 即抢占失败；
 *   3. transactions(activeBookId/activeRequestId) 数据库唯一索引兜底，
 *      同一本书 / 同一张求购单不可能同时存在两笔进行中的交易。
 *   重复选择（同一买家重复点击）直接幂等返回，不重复生成交易记录。
 */
export class TransactionService {
  /** 买家在求购单的候选书中选定一本：预约书籍并生成交易记录 */
  async selectBook(
    purchaseRequestId: string,
    bookId: string,
    buyerId: string,
  ): Promise<{ transaction: Transaction; duplicated: boolean }> {
    const dataSource = ds();

    return keyedLock.withLocks([bookLock(bookId), requestLock(purchaseRequestId)], async () => {
      const bookRepo = dataSource.getRepository(Book);
      const requestRepo = dataSource.getRepository(PurchaseRequest);
      const txRepo = dataSource.getRepository(Transaction);

      const request = await requestRepo.findOne({ where: { id: purchaseRequestId } });
      if (!request) throw new BusinessError(404, '求购单不存在');
      if (request.requesterId !== buyerId) throw new BusinessError(403, '只能为自己的求购单选择书籍');

      // 幂等：已经有进行中的交易时直接返回，重复选择不会重复下单
      const existing = await txRepo.findOne({
        where: { purchaseRequestId, activeRequestId: Not(IsNull()) },
      });
      if (existing) {
        if (existing.bookId === bookId) {
          return { transaction: existing, duplicated: true };
        }
        throw new BusinessError(409, '该求购单已有进行中的预约，请先取消后再选择其他书籍');
      }
      if (request.status === 'closed') {
        throw new BusinessError(409, '求购单已关闭，无法选择书籍');
      }
      if (request.status !== 'active') {
        throw new BusinessError(409, '求购单当前状态不可选择书籍');
      }

      const book = await bookRepo.findOne({ where: { id: bookId } });
      if (!book) throw new BusinessError(404, '书籍不存在');
      if (book.sellerId === buyerId) throw new BusinessError(400, '不能预约自己发布的书籍');

      // 选定前再次校验同校区/同课程代码/同版次/可购买
      if (!matchingService.isCandidate(book, request)) {
        throw new BusinessError(409, '该书与求购单不匹配（需同校区、同课程代码、同版次且可购买）');
      }

      const matchReason = matchingService.buildMatchReasons(book, request);

      try {
        const transaction = await dataSource.transaction(async (manager: EntityManager) => {
          // 1. 原子抢占：仅当书仍 available 时才能预约成功
          const reserveResult = await manager
            .createQueryBuilder()
            .update(Book)
            .set({ status: 'reserved' as const })
            .where('id = :id AND status = :available', { id: book.id, available: 'available' })
            .execute();

          if (!reserveResult.affected || reserveResult.affected === 0) {
            throw new BusinessError(409, '手慢了，该书刚被其他同学预约或已售出');
          }

          // 2. 求购单置为 matched（同样条件更新，防止并发下重复占用）
          const matchResult = await manager
            .createQueryBuilder()
            .update(PurchaseRequest)
            .set({ status: 'matched' as const })
            .where('id = :id AND status = :active', { id: request.id, active: 'active' })
            .execute();

          if (!matchResult.affected || matchResult.affected === 0) {
            throw new BusinessError(409, '该求购单已在其他预约中');
          }

          // 3. 生成交易记录（唯一索引 activeBookId/activeRequestId 兜底）
          const tx = manager.create(Transaction, {
            bookId: book.id,
            purchaseRequestId: request.id,
            buyerId,
            sellerId: book.sellerId,
            priceSnapshot: book.price,
            matchReason,
            status: 'pending' as const,
            activeBookId: book.id,
            activeRequestId: request.id,
          });
          return manager.save(tx);
        });

        return { transaction, duplicated: false };
      } catch (error) {
        if (error instanceof BusinessError) throw error;
        // 唯一索引冲突等：统一映射为冲突
        throw new BusinessError(409, '预约失败，该书可能已被其他同学抢先预约');
      }
    });
  }

  /** 卖家接受预约 */
  async accept(transactionId: string, sellerId: string): Promise<Transaction> {
    return this.withTransactionLocks(transactionId, async (manager, tx) => {
      this.assertParticipant(tx, sellerId, 'seller');
      if (tx.status !== 'pending') {
        throw new BusinessError(409, '只有待确认的预约才能被接受');
      }
      tx.status = 'accepted';
      return manager.save(tx);
    });
  }

  /** 卖家拒绝预约：释放书籍与求购单，供其他求购单/候选重新匹配 */
  async reject(transactionId: string, sellerId: string): Promise<Transaction> {
    return this.withTransactionLocks(transactionId, async (manager, tx) => {
      this.assertParticipant(tx, sellerId, 'seller');
      if (tx.status !== 'pending') {
        throw new BusinessError(409, '只有待确认的预约才能被拒绝');
      }
      return this.release(manager, tx, 'rejected');
    });
  }

  /** 买家取消预约：释放书籍与求购单 */
  async cancel(transactionId: string, userId: string): Promise<Transaction> {
    return this.withTransactionLocks(transactionId, async (manager, tx) => {
      this.assertParticipant(tx, userId, 'buyer');
      if (tx.status !== 'pending' && tx.status !== 'accepted') {
        throw new BusinessError(409, '当前预约状态不可取消');
      }
      return this.release(manager, tx, 'cancelled');
    });
  }

  /** 买卖双方任一方确认交易完成：书售出，求购单关闭 */
  async complete(transactionId: string, userId: string): Promise<Transaction> {
    return this.withTransactionLocks(transactionId, async (manager, tx) => {
      if (tx.sellerId !== userId && tx.buyerId !== userId) {
        throw new BusinessError(403, '只有交易双方可以确认完成');
      }
      if (tx.status !== 'accepted') {
        throw new BusinessError(409, '只有卖家已接受的预约才能确认完成');
      }

      const bookResult = await manager
        .createQueryBuilder()
        .update(Book)
        .set({ status: 'sold' as const })
        .where('id = :id AND status = :reserved', { id: tx.bookId, reserved: 'reserved' })
        .execute();
      if (!bookResult.affected) throw new BusinessError(409, '书籍状态异常，无法完成交易');

      await manager
        .createQueryBuilder()
        .update(PurchaseRequest)
        .set({ status: 'closed' as const })
        .where('id = :id', { id: tx.purchaseRequestId })
        .execute();

      tx.status = 'completed';
      tx.activeBookId = null;
      tx.activeRequestId = null;
      return manager.save(tx);
    });
  }

  /**
   * 在「交易 + 其占用的书 + 其占用的求购单」三把锁内执行一次数据库事务。
   * 先无锁预览交易拿到资源 id，再按统一顺序加锁并在锁内重读最新状态。
   */
  private async withTransactionLocks<T>(
    transactionId: string,
    fn: (manager: EntityManager, tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const dataSource = ds();

    const preview = await dataSource.getRepository(Transaction).findOne({ where: { id: transactionId } });
    if (!preview) throw new BusinessError(404, '交易记录不存在');

    return keyedLock.withLocks(
      [bookLock(preview.bookId), requestLock(preview.purchaseRequestId), transactionLock(transactionId)],
      () =>
        dataSource.transaction(async (manager) => {
          const tx = await this.lockTransaction(manager, transactionId);
          return fn(manager, tx);
        }),
    );
  }

  /** 释放预约：书恢复 available、求购单恢复 active、交易终结并清空占用标记 */
  private async release(
    manager: EntityManager,
    tx: Transaction,
    terminalStatus: 'rejected' | 'cancelled',
  ): Promise<Transaction> {
    const bookResult = await manager
      .createQueryBuilder()
      .update(Book)
      .set({ status: 'available' as const })
      .where('id = :id AND status = :reserved', { id: tx.bookId, reserved: 'reserved' })
      .execute();
    if (!bookResult.affected) {
      throw new BusinessError(409, '书籍状态异常，无法释放');
    }

    await manager
      .createQueryBuilder()
      .update(PurchaseRequest)
      .set({ status: 'active' as const })
      .where('id = :id AND status = :matched', { id: tx.purchaseRequestId, matched: 'matched' })
      .execute();

    tx.status = terminalStatus;
    tx.activeBookId = null;
    tx.activeRequestId = null;
    return manager.save(tx);
  }

  /** 行锁读取交易；SQLite 不支持 SELECT ... FOR UPDATE，退化为普通读取（条件更新仍保证正确性） */
  private async lockTransaction(manager: EntityManager, transactionId: string): Promise<Transaction> {
    const qb = manager.getRepository(Transaction).createQueryBuilder('tx').where('tx.id = :id', { id: transactionId });
    if (manager.connection.options.type === 'mysql' || manager.connection.options.type === 'mariadb') {
      qb.setLock('pessimistic_write');
    }
    const tx = await qb.getOne();
    if (!tx) throw new BusinessError(404, '交易记录不存在');
    return tx;
  }

  private assertParticipant(tx: Transaction, userId: string, role: 'buyer' | 'seller') {
    if (role === 'seller' && tx.sellerId !== userId) {
      throw new BusinessError(403, '只有卖家可以执行此操作');
    }
    if (role === 'buyer' && tx.buyerId !== userId) {
      throw new BusinessError(403, '只有买家可以执行此操作');
    }
  }

  async getById(transactionId: string): Promise<Transaction | null> {
    return ds().getRepository(Transaction).findOne({ where: { id: transactionId } });
  }

  /** 交易列表（买家/卖家视角），附带书籍与求购单概要 */
  async listByUser(userId: string, role: 'buyer' | 'seller' | 'all' = 'all'): Promise<Transaction[]> {
    const repo = ds().getRepository(Transaction);
    if (role === 'buyer') {
      return repo.find({
        where: { buyerId: userId },
        relations: ['book', 'purchaseRequest', 'buyer', 'seller'],
        order: { createdAt: 'DESC' },
      });
    }
    if (role === 'seller') {
      return repo.find({
        where: { sellerId: userId },
        relations: ['book', 'purchaseRequest', 'buyer', 'seller'],
        order: { createdAt: 'DESC' },
      });
    }
    return repo.find({
      where: [{ buyerId: userId }, { sellerId: userId }],
      relations: ['book', 'purchaseRequest', 'buyer', 'seller'],
      order: { createdAt: 'DESC' },
    });
  }
}

export const transactionService = new TransactionService();
