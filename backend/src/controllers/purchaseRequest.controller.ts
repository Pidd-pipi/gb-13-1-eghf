import { Request, Response } from 'express';
import { ds } from '../services/db';
import { PurchaseRequest, SubjectCategory } from '../entities/PurchaseRequest';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { matchingService } from '../services/matching.service';

/** 列表附带每张求购单的剩余候选书数量 */
const attachCandidateCount = async (requests: PurchaseRequest[]) => {
  const counts = await matchingService.countCandidatesBatch(requests);
  return requests.map((request) => ({
    ...request,
    candidateCount: counts[request.id] ?? 0,
  }));
};

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
    return res.status(400).json({ message: '请填写需要的书名' });
  }
  if (!campus) {
    return res.status(400).json({ message: '请选择校区' });
  }
  if (!courseCode || !String(courseCode).trim()) {
    return res.status(400).json({ message: '请填写课程代码（如 CS101）' });
  }
  if (!edition || !String(edition).trim()) {
    return res.status(400).json({ message: '请填写版次（如 第3版）' });
  }

  try {
    const requestRepository = ds().getRepository(PurchaseRequest);
    const request = new PurchaseRequest();
    request.bookTitle = String(bookTitle).trim();
    request.author = author || null;
    request.isbn = isbn || null;
    request.expectedPrice =
      expectedPrice !== undefined && expectedPrice !== '' ? parseFloat(expectedPrice) : (null as any);
    request.conditions = Array.isArray(conditions) && conditions.length > 0 ? conditions : (null as any);
    request.description = description || null;
    request.category = (category || 'other') as SubjectCategory;
    request.campus = campus;
    request.courseCode = String(courseCode).trim().toUpperCase();
    request.edition = String(edition).trim();
    request.requesterId = req.userId!;
    request.status = 'active';

    await requestRepository.save(request);
    const candidateCount = await matchingService.countCandidates(request);
    res.status(201).json({ message: '求购信息发布成功', request: { ...request, candidateCount } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '求购信息发布失败' });
  }
};

export const getPurchaseRequests = async (req: Request, res: Response) => {
  const { category, campus, courseCode, edition, page = 1, limit = 20 } = req.query;

  const where: any = { status: 'active' };
  if (category) where.category = category as SubjectCategory;
  if (campus) where.campus = campus as string;
  if (courseCode) where.courseCode = String(courseCode).trim().toUpperCase();
  if (edition) where.edition = String(edition).trim();

  const requestRepository = ds().getRepository(PurchaseRequest);
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

  const requestsWithCount = await attachCandidateCount(requests);

  res.json({
    requests: requestsWithCount,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  });
};

export const getMyPurchaseRequests = async (req: AuthenticatedRequest, res: Response) => {
  const requestRepository = ds().getRepository(PurchaseRequest);
  const requests = await requestRepository.find({
    where: { requesterId: req.userId },
    order: { createdAt: 'DESC' },
  });

  res.json(await attachCandidateCount(requests));
};

/** 求购单详情：含剩余候选数与逐本候选书的匹配原因 */
export const getPurchaseRequestById = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const requestRepository = ds().getRepository(PurchaseRequest);
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
      },
    },
  });

  if (!request) {
    return res.status(404).json({ message: '求购信息不存在' });
  }

  const candidates = request.status === 'active' ? await matchingService.findCandidates(request) : [];
  const candidateDetails = candidates.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    price: book.price,
    condition: book.condition,
    images: book.images,
    campus: book.campus,
    courseCode: book.courseCode,
    edition: book.edition,
    sellerName: book.seller?.name || book.seller?.department || '匿名同学',
    reasons: matchingService.buildMatchReasons(book, request),
  }));

  res.json({
    ...request,
    candidateCount: candidateDetails.length,
    candidates: candidateDetails,
  });
};

export const closePurchaseRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const requestRepository = ds().getRepository(PurchaseRequest);
  const request = await requestRepository.findOne({ where: { id } });

  if (!request) {
    return res.status(404).json({ message: '求购信息不存在' });
  }

  if (request.requesterId !== req.userId) {
    return res.status(403).json({ message: '无权限操作' });
  }

  if (request.status === 'matched') {
    return res.status(409).json({ message: '已有书籍被预约，请先在交易记录中取消预约' });
  }

  request.status = 'closed';
  await requestRepository.save(request);

  res.json({ message: '求购信息已关闭' });
};
