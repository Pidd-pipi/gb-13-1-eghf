import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { PurchaseRequest, SubjectCategory } from '../entities/PurchaseRequest';
import { Trade } from '../entities/Trade';
import { Book } from '../entities/Book';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  countCandidatesForRequests,
  findMatchedBooks,
  buildMatchReason,
  normalizeCourseCode,
  normalizeText,
} from '../services/matching.service';

export const createPurchaseRequest = async (req: AuthenticatedRequest, res: Response) => {
  const {
    bookTitle,
    author,
    isbn,
    expectedPrice,
    conditions,
    description,
    category,
    campus,
    courseCode,
    edition,
  } = req.body;

  if (!bookTitle || !String(bookTitle).trim()) {
    return res.status(400).json({ message: '请填写书名' });
  }
  if (!courseCode || !String(courseCode).trim()) {
    return res.status(400).json({ message: '请填写课程代码' });
  }
  if (!edition || !String(edition).trim()) {
    return res.status(400).json({ message: '请填写版次' });
  }
  if (!campus || !String(campus).trim()) {
    return res.status(400).json({ message: '请选择校区' });
  }

  try {
    const requestRepository = AppDataSource.getRepository(PurchaseRequest);
    const request = requestRepository.create({
      bookTitle: String(bookTitle).trim(),
      author: author ? String(author).trim() : null,
      isbn: isbn ? String(isbn).trim() : null,
      expectedPrice: expectedPrice ? parseFloat(expectedPrice) : null,
      conditions,
      description,
      category,
      campus: normalizeText(String(campus)),
      courseCode: normalizeCourseCode(String(courseCode)),
      edition: normalizeText(String(edition)),
      requesterId: req.userId!,
    });

    await requestRepository.save(request);
    res.status(201).json({ message: '求购信息发布成功', request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '求购信息发布失败' });
  }
};

/** 为求购单列表附加剩余候选数 */
const attachCandidateCounts = async (requests: PurchaseRequest[]) => {
  const counts = await countCandidatesForRequests(requests);
  requests.forEach((r) => (r.candidateCount = counts[r.id] ?? 0));
};

export const getPurchaseRequests = async (req: Request, res: Response) => {
  const { category, campus, page = 1, limit = 20 } = req.query;

  const where: any = { status: 'active' };
  if (category) {
    where.category = category as SubjectCategory;
  }
  if (campus) {
    where.campus = campus;
  }

  const requestRepository = AppDataSource.getRepository(PurchaseRequest);
  const [requests, total] = await requestRepository.findAndCount({
    where,
    relations: ['requester'],
    order: { createdAt: 'DESC' },
    skip: (parseInt(page as string) - 1) * parseInt(limit as string),
    take: parseInt(limit as string),
    select: {
      requester: {
        id: true,
        name: true,
        department: true,
        avatarUrl: true,
        contactInfo: true,
      },
    },
  });

  // 求购列表显示每条求购单的剩余候选书数
  await attachCandidateCounts(requests);

  res.json({
    requests,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  });
};

export const getMyPurchaseRequests = async (req: AuthenticatedRequest, res: Response) => {
  const requestRepository = AppDataSource.getRepository(PurchaseRequest);
  const requests = await requestRepository.find({
    where: { requesterId: req.userId },
    order: { createdAt: 'DESC' },
  });

  await attachCandidateCounts(requests);

  // 附带每条求购单当前是否已有进行中(pending)交易及交易 id（仅统计当前用户作为买家的交易）
  const pendingTrades = await AppDataSource.getRepository(Trade)
    .createQueryBuilder('trade')
    .select(['trade.id AS id', 'trade.purchaseRequestId AS purchaseRequestId', 'trade.bookId AS bookId'])
    .where('trade.buyerId = :buyerId', { buyerId: req.userId })
    .andWhere('trade.status = :status', { status: 'pending' })
    .getRawMany<{ id: string; purchaseRequestId: string; bookId: string }>();
  const pendingByRequest = new Map<string, { id: string; bookId: string }[]>();
  pendingTrades.forEach((t) => {
    const list = pendingByRequest.get(t.purchaseRequestId) ?? [];
    list.push({ id: t.id, bookId: t.bookId });
    pendingByRequest.set(t.purchaseRequestId, list);
  });
  requests.forEach((r) => {
    r.pendingTrades = pendingByRequest.get(r.id) ?? [];
  });

  res.json(requests);
};

export const closePurchaseRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const requestRepository = AppDataSource.getRepository(PurchaseRequest);
  const request = await requestRepository.findOne({ where: { id } });

  if (!request) {
    return res.status(404).json({ message: '求购信息不存在' });
  }

  if (request.requesterId !== req.userId) {
    return res.status(403).json({ message: '无权限操作' });
  }

  // 存在进行中交易时不允许直接关闭，避免预约中的书失去上下文
  const pendingTrade = await AppDataSource.getRepository(Trade).findOne({
    where: { purchaseRequestId: id, status: 'pending' },
  });
  if (pendingTrade) {
    return res.status(409).json({ message: '该求购单已有进行中的交易，请先取消或等待交易结束' });
  }

  request.status = 'closed';
  await requestRepository.save(request);

  res.json({ message: '求购信息已关闭' });
};

/** GET /purchase-requests/:id —— 求购单详情：求购信息 + 剩余候选数 + 候选书籍 */
export const getPurchaseRequestById = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const requestRepository = AppDataSource.getRepository(PurchaseRequest);
  const request = await requestRepository.findOne({
    where: { id },
    relations: ['requester'],
    select: {
      requester: {
        id: true,
        name: true,
        department: true,
        avatarUrl: true,
        contactInfo: true,
        positiveRatingRate: true,
      },
    },
  });

  if (!request) {
    return res.status(404).json({ message: '求购信息不存在' });
  }

  // 仅求购者本人可见候选书列表（含联系方式），其他用户只返回求购信息
  const isOwner = request.requesterId === req.userId;

  const counts = await countCandidatesForRequests([request]);
  request.candidateCount = counts[request.id] ?? 0;

  if (isOwner) {
    const candidateBooks = await findMatchedBooks(request);

    // 当前求购单是否已有进行中交易（用于前端禁用"选择"按钮，刷新后状态一致）
    const pendingTrade = await AppDataSource.getRepository(Trade).findOne({
      where: { purchaseRequestId: id, buyerId: req.userId, status: 'pending' },
    });

    request.candidateBooks = candidateBooks;
    request.pendingTrade = pendingTrade
      ? { id: pendingTrade.id, bookId: pendingTrade.bookId, status: pendingTrade.status }
      : null;

    return res.json(request);
  }

  // 卖家视角：给出该卖家自己的某本书与这条求购单的匹配原因（query: bookId）
  const { bookId } = req.query as { bookId?: string };
  if (bookId) {
    const book = await AppDataSource.getRepository(Book).findOne({
      where: { id: bookId },
    });
    if (book) {
      request.matchReason = buildMatchReason(request, book);
    }
  }

  return res.json(request);
};
