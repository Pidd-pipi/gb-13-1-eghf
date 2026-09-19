import { Not } from 'typeorm';
import { ds } from './db';
import { Book } from '../entities/Book';
import { PurchaseRequest } from '../entities/PurchaseRequest';
import { Transaction } from '../entities/Transaction';

export interface MatchReasonOptions {
  expectedPrice?: number | null;
  acceptableConditions?: string[] | null;
}

export interface CandidateCountMap {
  [purchaseRequestId: string]: number;
}

/**
 * 教材同版匹配服务。
 *
 * 硬性匹配规则（必须全部满足，缺一不可）：
 *   1. 同校区 campus
 *   2. 同课程代码 courseCode
 *   3. 同版次 edition
 *   4. 书籍当前可购买 status = available
 *   5. 排除求购者自己发布的书
 * 期望价格、新旧程度仅作为提示信息，不参与过滤。
 */
export class MatchingService {
  /** 查询某张求购单当前可匹配的全部候选书（按价格升序） */
  async findCandidates(request: PurchaseRequest, limit?: number): Promise<Book[]> {
    const repo = ds().getRepository(Book);
    const qb = repo
      .createQueryBuilder('book')
      .innerJoinAndSelect('book.seller', 'seller')
      .where('book.status = :status', { status: 'available' })
      .andWhere('book.campus = :campus', { campus: request.campus })
      .andWhere('book.courseCode = :courseCode', { courseCode: request.courseCode })
      .andWhere('book.edition = :edition', { edition: request.edition })
      .andWhere('book.sellerId != :requesterId', { requesterId: request.requesterId })
      .orderBy('book.price', 'ASC')
      .addOrderBy('book.createdAt', 'DESC');
    if (limit) {
      qb.take(limit);
    }
    return qb.getMany();
  }

  /** 单张求购单剩余候选数 */
  async countCandidates(request: PurchaseRequest): Promise<number> {
    return ds().getRepository(Book).count({
      where: {
        status: 'available',
        campus: request.campus,
        courseCode: request.courseCode,
        edition: request.edition,
        sellerId: Not(request.requesterId),
      },
    });
  }

  /**
   * 批量计算多张求购单的剩余候选数。
   * 先按 (campus, courseCode, edition) 分组统计可购买书籍，再在内存中排除自售书，
   * 避免求购列表 N+1 查询。
   */
  async countCandidatesBatch(requests: PurchaseRequest[]): Promise<CandidateCountMap> {
    const result: CandidateCountMap = {};
    const activeOrMatched = requests.filter((r) => r.status === 'active' || r.status === 'matched');
    if (activeOrMatched.length === 0) {
      for (const r of requests) result[r.id] = 0;
      return result;
    }

    const groups = new Map<string, PurchaseRequest[]>();
    for (const r of activeOrMatched) {
      const key = `${r.campus}||${r.courseCode}||${r.edition}`;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }

    const bookRepo = ds().getRepository(Book);
    for (const [key, list] of groups) {
      const [campus, courseCode, edition] = key.split('||');
      const books = await bookRepo.find({
        where: { status: 'available', campus, courseCode, edition },
        select: ['id', 'sellerId'],
      });
      for (const r of list) {
        // 已匹配（书籍预约中）的求购单不再对外展示候选
        result[r.id] = r.status === 'matched' ? 0 : books.filter((b) => b.sellerId !== r.requesterId).length;
      }
    }

    for (const r of requests) {
      if (!(r.id in result)) result[r.id] = 0;
    }
    return result;
  }

  /**
   * 查询某本书能满足的、仍在求购中的求购单（卖家视角）。
   * 规则与求购单候选书完全对称：同校区、同课程代码、同版次、求购单 active。
   */
  async findMatchingRequestsForBook(book: Book, limit?: number): Promise<PurchaseRequest[]> {
    const repo = ds().getRepository(PurchaseRequest);
    const qb = repo
      .createQueryBuilder('pr')
      .innerJoinAndSelect('pr.requester', 'requester')
      .where('pr.status = :status', { status: 'active' })
      .andWhere('pr.campus = :campus', { campus: book.campus })
      .andWhere('pr.courseCode = :courseCode', { courseCode: book.courseCode })
      .andWhere('pr.edition = :edition', { edition: book.edition })
      .andWhere('pr.requesterId != :sellerId', { sellerId: book.sellerId })
      .orderBy('pr.createdAt', 'DESC');
    if (limit) {
      qb.take(limit);
    }
    return qb.getMany();
  }

  /** 批量统计书籍列表对应的匹配求购单数 */
  async countMatchingRequestsBatch(books: Book[]): Promise<{ [bookId: string]: number }> {
    const result: { [bookId: string]: number } = {};
    const availableBooks = books.filter((b) => b.status === 'available');
    if (availableBooks.length === 0) {
      for (const b of books) result[b.id] = 0;
      return result;
    }

    const groups = new Map<string, Book[]>();
    for (const b of availableBooks) {
      const key = `${b.campus}||${b.courseCode}||${b.edition}`;
      const list = groups.get(key) ?? [];
      list.push(b);
      groups.set(key, list);
    }

    const prRepo = ds().getRepository(PurchaseRequest);
    for (const [key, list] of groups) {
      const [campus, courseCode, edition] = key.split('||');
      const requests = await prRepo.find({
        where: { status: 'active', campus, courseCode, edition },
        select: ['id', 'requesterId'],
      });
      for (const b of list) {
        result[b.id] = requests.filter((r) => r.requesterId !== b.sellerId).length;
      }
    }
    for (const b of books) {
      if (!(b.id in result)) result[b.id] = 0;
    }
    return result;
  }

  /** 判断一本书是否是某张求购单的合法候选（选定前再次校验，防止脏数据） */
  isCandidate(
    book: Book,
    request: PurchaseRequest,
  ): boolean {
    return (
      book.status === 'available' &&
      book.campus === request.campus &&
      book.courseCode === request.courseCode &&
      book.edition === request.edition &&
      book.sellerId !== request.requesterId
    );
  }

  /**
   * 生成人类可读的匹配原因。
   * 前三项为硬性命中；价格/新旧满足情况仅作补充说明。
   */
  buildMatchReasons(book: Book, request: PurchaseRequest): string[] {
    const reasons = [
      `同校区：双方均位于「${book.campus}」`,
      `同课程代码：${book.courseCode}`,
      `同版次：${book.edition}`,
    ];

    const expectedPrice = (request as PurchaseRequest & { expectedPrice?: number | string | null }).expectedPrice;
    const expected = typeof expectedPrice === 'string' ? parseFloat(expectedPrice) : expectedPrice;
    const price = typeof book.price === 'string' ? parseFloat(book.price) : book.price;
    if (expected != null && !Number.isNaN(expected)) {
      reasons.push(
        price <= expected
          ? `价格符合预期：售价 ¥${Number(price).toFixed(2)} ≤ 期望 ¥${Number(expected).toFixed(2)}`
          : `高于期望价格：售价 ¥${Number(price).toFixed(2)} > 期望 ¥${Number(expected).toFixed(2)}`,
      );
    }

    if (request.conditions && request.conditions.length > 0) {
      reasons.push(
        request.conditions.includes(book.condition)
          ? '新旧程度符合求购要求'
          : `新旧程度为「${book.condition}」，不在期望范围内（${request.conditions.join('、')}）`,
      );
    }
    return reasons;
  }
}

export const matchingService = new MatchingService();
