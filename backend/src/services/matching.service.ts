import { AppDataSource } from '../config/database';
import { PurchaseRequest } from '../entities/PurchaseRequest';
import { Book } from '../entities/Book';

/** 教材同版匹配的三项硬性条件 */
export interface MatchKey {
  campus: string;
  courseCode: string;
  edition: string;
}

export interface MatchReason {
  /** 是否满足同校区、同课程代码、同版次三项条件 */
  matched: boolean;
  campus: boolean;
  courseCode: boolean;
  edition: boolean;
  /** 供详情页直接展示的人类可读原因 */
  summary: string;
}

/**
 * 规范化匹配键：
 * - 课程代码忽略大小写并去除首尾空白（如 "cs101" 与 " CS101 " 视为同一门课）
 * - 版次去除首尾空白（中文版次保留原大小写语义）
 * - 校区去除首尾空白
 */
export const normalizeCourseCode = (value: string): string => (value || '').trim().toUpperCase();
export const normalizeText = (value: string): string => (value || '').trim();

export const buildMatchKey = (source: { campus: string; courseCode: string; edition: string }): MatchKey => ({
  campus: normalizeText(source.campus),
  courseCode: normalizeCourseCode(source.courseCode),
  edition: normalizeText(source.edition),
});

export const matchKeyOf = (source: { campus: string; courseCode: string; edition: string }): string =>
  `${normalizeText(source.campus)}|${normalizeCourseCode(source.courseCode)}|${normalizeText(source.edition)}`;

/**
 * 生成匹配原因。matched 为 true 时说明该书是该求购单的合法候选。
 */
export const buildMatchReason = (
  request: { campus: string; courseCode: string; edition: string },
  book: { campus: string; courseCode: string; edition: string },
): MatchReason => {
  const campus = normalizeText(request.campus) === normalizeText(book.campus);
  const courseCode = normalizeCourseCode(request.courseCode) === normalizeCourseCode(book.courseCode);
  const edition = normalizeText(request.edition) === normalizeText(book.edition);
  const matched = campus && courseCode && edition;

  const parts: string[] = [];
  parts.push(campus ? `同校区（${book.campus}）` : `校区不一致（求购${request.campus} / 书籍${book.campus}）`);
  parts.push(
    courseCode
      ? `同课程代码（${book.courseCode}）`
      : `课程代码不一致（求购${request.courseCode} / 书籍${book.courseCode}）`,
  );
  parts.push(edition ? `同版次（${book.edition}）` : `版次不一致（求购${request.edition} / 书籍${book.edition}）`);

  return {
    matched,
    campus,
    courseCode,
    edition,
    summary: matched
      ? `满足教材同版匹配：${parts.join('、')}`
      : `不满足同版匹配：${parts.join('、')}`,
  };
};

/**
 * 查询某个求购单可购买的同版候选书籍：
 * 仅匹配同校区、同课程代码、同版次且状态为 available 的书（排除求购者自己发布的书）。
 *
 * 期望价/新旧程度属于软偏好，不参与硬性匹配，保证与 countCandidatesForRequests 的
 * 候选数完全一致（列表候选数 == 详情候选书数量）；前端对高于期望价的书给出提示即可。
 */
export const findMatchedBooks = async (
  request: PurchaseRequest,
  options: { limit?: number } = {},
): Promise<Book[]> => {
  const books = await AppDataSource.getRepository(Book)
    .createQueryBuilder('book')
    .leftJoinAndSelect('book.seller', 'seller')
    .where('book.status = :status', { status: 'available' })
    .andWhere('TRIM(UPPER(book.courseCode)) = :courseCode', {
      courseCode: normalizeCourseCode(request.courseCode),
    })
    .andWhere('TRIM(book.edition) = :edition', { edition: normalizeText(request.edition) })
    .andWhere('TRIM(book.campus) = :campus', { campus: normalizeText(request.campus) })
    .andWhere('book.sellerId != :requesterId', { requesterId: request.requesterId })
    .orderBy('book.createdAt', 'DESC')
    .limit(options.limit ?? 50)
    .getMany();

  return books;
};

interface GroupedSource {
  campus: string;
  courseCode: string;
  edition: string;
  ownerId: string;
}

/**
 * 批量统计：对每个来源三元组，计算对端可参与匹配的数量，并扣除来源 owner 自己产生的对端记录。
 *
 * 仅用一条 GROUP BY SQL，在数据库侧按规范化的（校区, 课程代码大写, 版次, owner）分组，
 * 随后在内存中用总数减去该来源 owner 自己的数量，避免 N+1 查询。
 *
 * - side='request'：对端为 available 的书，owner 是书的卖家，用于"求购单剩余候选书数"
 * - side='book'：对端为 active 的求购单，owner 是求购者，用于"书籍对应的求购单数"
 */
const countOppositeForSources = async (
  sources: GroupedSource[],
  side: 'book' | 'request',
): Promise<number[]> => {
  if (sources.length === 0) return [];

  const alias = side === 'book' ? 'book' : 'request';
  const targetEntity = side === 'book' ? Book : PurchaseRequest;
  const statusValue = side === 'book' ? 'available' : 'active';
  const ownerCol = side === 'book' ? 'book.sellerId' : 'request.requesterId';

  const rows = await AppDataSource.getRepository(targetEntity)
    .createQueryBuilder(alias)
    .select(`TRIM(${alias}.campus)`, 'campus')
    .addSelect(`TRIM(UPPER(${alias}.courseCode))`, 'courseCode')
    .addSelect(`TRIM(${alias}.edition)`, 'edition')
    .addSelect(`${ownerCol}`, 'ownerId')
    .addSelect('COUNT(*)', 'cnt')
    .where(`${alias}.status = :status`, { status: statusValue })
    .groupBy(`TRIM(${alias}.campus)`)
    .addGroupBy(`TRIM(UPPER(${alias}.courseCode))`)
    .addGroupBy(`TRIM(${alias}.edition)`)
    .addGroupBy(ownerCol)
    .getRawMany<{ campus: string; courseCode: string; edition: string; ownerId: string; cnt: string }>();

  const totalByKey = new Map<string, number>();
  const selfByKeyOwner = new Map<string, number>();
  rows.forEach((r) => {
    const key = `${r.campus}|${(r.courseCode || '').toUpperCase()}|${r.edition}`;
    const cnt = Number(r.cnt) || 0;
    totalByKey.set(key, (totalByKey.get(key) ?? 0) + cnt);
    selfByKeyOwner.set(`${key}|${r.ownerId}`, cnt);
  });

  return sources.map((s) => {
    const key = matchKeyOf(s);
    const total = totalByKey.get(key) ?? 0;
    const self = selfByKeyOwner.get(`${key}|${s.ownerId}`) ?? 0;
    return Math.max(0, total - self);
  });
};

/** 批量为求购单附加剩余可购买候选书数量（排除自己发布的书） */
export const countCandidatesForRequests = async (
  requests: PurchaseRequest[],
): Promise<Record<string, number>> => {
  const counts = await countOppositeForSources(
    requests.map((r) => ({
      campus: r.campus,
      courseCode: r.courseCode,
      edition: r.edition,
      ownerId: r.requesterId,
    })),
    'book',
  );
  const result: Record<string, number> = {};
  requests.forEach((r, i) => (result[r.id] = counts[i]));
  return result;
};

/** 批量为书籍附加对应的活跃求购单数量（排除卖家自己发的求购单） */
export const countRequestsForBooks = async (books: Book[]): Promise<Record<string, number>> => {
  const counts = await countOppositeForSources(
    books.map((b) => ({
      campus: b.campus,
      courseCode: b.courseCode,
      edition: b.edition,
      ownerId: b.sellerId,
    })),
    'request',
  );
  const result: Record<string, number> = {};
  books.forEach((b, i) => (result[b.id] = counts[i]));
  return result;
};
