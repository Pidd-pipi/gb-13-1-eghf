import { Request, Response } from 'express';
import { ILike, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ds } from '../services/db';
import { Book, BookStatus, SubjectCategory, BookCondition } from '../entities/Book';
import { User } from '../entities/User';
import { Favorite } from '../entities/Favorite';
import { BrowsingHistory } from '../entities/BrowsingHistory';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { minioService } from '../services/minio.service';
import { matchingService } from '../services/matching.service';

export const createBook = async (req: AuthenticatedRequest, res: Response) => {
  const {
    title,
    author,
    isbn,
    originalPrice,
    price,
    condition,
    tradeMethod,
    campus,
    courseCode,
    edition,
    category,
    description,
  } = req.body;

  if (!courseCode || !String(courseCode).trim()) {
    return res.status(400).json({ message: '请填写课程代码（如 CS101）' });
  }
  if (!edition || !String(edition).trim()) {
    return res.status(400).json({ message: '请填写版次（如 第3版）' });
  }

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ message: '请上传至少一张图片' });
  }
  if (files.length > 5) {
    return res.status(400).json({ message: '最多上传5张图片' });
  }

  try {
    const imageUrls: string[] = [];
    for (const file of files) {
      const objectName = `books/${req.userId}-${Date.now()}-${file.originalname}`;
      const url = await minioService.uploadFile(file.buffer, objectName, file.mimetype);
      imageUrls.push(url);
    }

    const bookRepository = ds().getRepository(Book);
    const book = bookRepository.create({
      title,
      author,
      isbn,
      originalPrice: parseFloat(originalPrice),
      price: parseFloat(price),
      condition,
      images: imageUrls,
      tradeMethod,
      campus,
      courseCode: String(courseCode).trim().toUpperCase(),
      edition: String(edition).trim(),
      category,
      description,
      sellerId: req.userId!,
      status: 'available' as BookStatus,
    });

    await bookRepository.save(book);
    res.status(201).json({ message: '发布成功', book });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '发布失败' });
  }
};

export const getBooks = async (req: Request, res: Response) => {
  const {
    keyword,
    category,
    campus,
    courseCode,
    edition,
    minPrice,
    maxPrice,
    condition,
    sort = 'createdAt',
    order = 'DESC',
    page = 1,
    limit = 20,
  } = req.query;

  const bookRepository = ds().getRepository(Book);
  const where: any = { status: 'available' };

  if (keyword) {
    where.title = ILike(`%${keyword}%`);
  }
  if (category) {
    where.category = category as SubjectCategory;
  }
  if (campus) {
    where.campus = campus as string;
  }
  // 课程代码统一大写后精确匹配
  if (courseCode) {
    where.courseCode = String(courseCode).trim().toUpperCase();
  }
  if (edition) {
    where.edition = String(edition).trim();
  }
  if (condition) {
    where.condition = condition as BookCondition;
  }
  if (minPrice || maxPrice) {
    if (minPrice && maxPrice) {
      where.price = Between(parseFloat(minPrice as string), parseFloat(maxPrice as string));
    } else if (minPrice) {
      where.price = MoreThanOrEqual(parseFloat(minPrice as string));
    } else {
      where.price = LessThanOrEqual(parseFloat(maxPrice as string));
    }
  }

  const allowedSort = ['createdAt', 'price'];
  const sortField = allowedSort.includes(sort as string) ? (sort as string) : 'createdAt';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

  const [books, total] = await bookRepository.findAndCount({
    where,
    relations: ['seller'],
    order: { [sortField]: sortOrder as 'ASC' | 'DESC' },
    skip: (parseInt(page as string) - 1) * parseInt(limit as string),
    take: parseInt(limit as string),
    select: {
      seller: {
        id: true,
        name: true,
        avatarUrl: true,
        department: true,
        positiveRatingRate: true,
      },
    },
  });

  // 每本书还能匹配多少张求购单（卖家视角的剩余候选数）
  const matchCounts = await matchingService.countMatchingRequestsBatch(books);
  const booksWithCount = books.map((book) => ({
    ...book,
    matchingRequestCount: matchCounts[book.id] ?? 0,
  }));

  res.json({
    books: booksWithCount,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  });
};

export const getBookById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as AuthenticatedRequest).userId;

  const bookRepository = ds().getRepository(Book);
  const book = await bookRepository.findOne({
    where: { id },
    relations: ['seller'],
    select: {
      seller: {
        id: true,
        name: true,
        avatarUrl: true,
        department: true,
        contactInfo: true,
        positiveRatingRate: true,
        totalReviews: true,
      },
    },
  });

  if (!book) {
    return res.status(404).json({ message: '书籍不存在' });
  }

  if (userId && userId !== book.sellerId) {
    const historyRepository = ds().getRepository(BrowsingHistory);
    const history = historyRepository.create({
      userId,
      bookId: book.id,
    });
    await historyRepository.save(history);
  }

  // 详情页展示匹配信息：剩余匹配求购数 + 每条求购单与本书的匹配原因
  const matchingRequests = await matchingService.findMatchingRequestsForBook(book);
  const matchDetails = matchingRequests.map((pr) => ({
    id: pr.id,
    bookTitle: pr.bookTitle,
    expectedPrice: pr.expectedPrice,
    conditions: pr.conditions,
    requesterName: pr.requester?.name || pr.requester?.department || '匿名同学',
    reasons: matchingService.buildMatchReasons(book, pr),
  }));

  res.json({
    ...book,
    matchingRequestCount: matchDetails.length,
    matchingRequests: matchDetails,
  });
};

export const updateBookStatus = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['available', 'reserved', 'sold'].includes(status)) {
    return res.status(400).json({ message: '非法的书籍状态' });
  }

  const bookRepository = ds().getRepository(Book);
  const book = await bookRepository.findOne({ where: { id } });

  if (!book) {
    return res.status(404).json({ message: '书籍不存在' });
  }

  if (book.sellerId !== req.userId) {
    return res.status(403).json({ message: '无权限操作' });
  }

  // 已预约的书处于交易闭环中，不能手动改状态，防止绕过匹配/交易流程
  if (book.status === 'reserved' && status !== 'reserved') {
    return res.status(409).json({ message: '书籍已被预约，请在交易记录中接受、拒绝或等待买家取消' });
  }
  if (book.status === 'sold') {
    return res.status(409).json({ message: '已售出的书籍状态不可变更' });
  }

  book.status = status;
  await bookRepository.save(book);

  res.json({ message: '状态更新成功', book });
};

export const deleteBook = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const bookRepository = ds().getRepository(Book);
  const book = await bookRepository.findOne({ where: { id } });

  if (!book) {
    return res.status(404).json({ message: '书籍不存在' });
  }

  if (book.sellerId !== req.userId) {
    return res.status(403).json({ message: '无权限操作' });
  }

  if (book.status === 'reserved') {
    return res.status(409).json({ message: '书籍已被预约，无法删除' });
  }
  if (book.status === 'sold') {
    return res.status(409).json({ message: '书籍已售出，无法删除' });
  }

  await bookRepository.delete({ id });
  res.json({ message: '删除成功' });
};

export const getMyBooks = async (req: AuthenticatedRequest, res: Response) => {
  const bookRepository = ds().getRepository(Book);
  const books = await bookRepository.find({
    where: { sellerId: req.userId },
    order: { createdAt: 'DESC' },
  });

  // 我发布的书同样展示剩余候选（匹配求购单）数量
  const matchCounts = await matchingService.countMatchingRequestsBatch(books);
  res.json(
    books.map((book) => ({
      ...book,
      matchingRequestCount: matchCounts[book.id] ?? 0,
    })),
  );
};

export const getRecommendBooks = async (req: AuthenticatedRequest, res: Response) => {
  const userRepository = ds().getRepository(User);
  const user = await userRepository.findOne({ where: { id: req.userId } });

  const bookRepository = ds().getRepository(Book);
  let books: Book[];

  if (user?.department) {
    books = await bookRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.seller', 'seller')
      .where('book.status = :status', { status: 'available' })
      .andWhere('book.sellerId != :userId', { userId: req.userId })
      .andWhere('seller.department = :department', { department: user.department })
      .orderBy('book.createdAt', 'DESC')
      .take(10)
      .getMany();
  } else {
    books = await bookRepository.find({
      where: { status: 'available' },
      relations: ['seller'],
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  res.json(books);
};
