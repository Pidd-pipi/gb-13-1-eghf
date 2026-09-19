import { Request, Response } from 'express';
import { ILike, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Book, BookStatus, SubjectCategory, BookCondition } from '../entities/Book';
import { PurchaseRequest } from '../entities/PurchaseRequest';
import { Trade } from '../entities/Trade';
import { User } from '../entities/User';
import { BrowsingHistory } from '../entities/BrowsingHistory';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { minioService } from '../services/minio.service';
import {
  countRequestsForBooks,
  buildMatchReason,
  normalizeCourseCode,
  normalizeText,
} from '../services/matching.service';

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

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ message: '请上传至少一张图片' });
  }
  if (files.length > 5) {
    return res.status(400).json({ message: '最多上传5张图片' });
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
    const imageUrls: string[] = [];
    for (const file of files) {
      const objectName = `books/${req.userId}-${Date.now()}-${file.originalname}`;
      const url = await minioService.uploadFile(file.buffer, objectName, file.mimetype);
      imageUrls.push(url);
    }

    const bookRepository = AppDataSource.getRepository(Book);
    const book = bookRepository.create({
      title,
      author,
      isbn,
      originalPrice: parseFloat(originalPrice),
      price: parseFloat(price),
      condition,
      images: imageUrls,
      tradeMethod,
      campus: String(campus).trim(),
      courseCode: normalizeCourseCode(String(courseCode)),
      edition: normalizeText(String(edition)),
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
    minPrice,
    maxPrice,
    condition,
    sort = 'createdAt',
    order = 'DESC',
    page = 1,
    limit = 20,
  } = req.query;

  const bookRepository = AppDataSource.getRepository(Book);
  const where: any = { status: 'available' };

  if (keyword) {
    where.title = ILike(`%${keyword}%`);
  }
  if (category) {
    where.category = category as SubjectCategory;
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

  const [books, total] = await bookRepository.findAndCount({
    where,
    relations: ['seller'],
    order: { [sort as string]: order as 'ASC' | 'DESC' },
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

  // 每本书对应的同校区/同课程代码/同版次活跃求购单数
  const requestCounts = await countRequestsForBooks(books);
  books.forEach((b) => (b.matchedRequestCount = requestCounts[b.id] ?? 0));

  res.json({
    books,
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
  const { requestId } = req.query as { requestId?: string };

  const bookRepository = AppDataSource.getRepository(Book);
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

  // 该书对应的活跃求购单数
  const requestCounts = await countRequestsForBooks([book]);
  book.matchedRequestCount = requestCounts[book.id] ?? 0;

  // 从求购单跳转过来时，附上"为什么匹配"的原因
  if (requestId) {
    const purchaseRequest = await AppDataSource.getRepository(PurchaseRequest).findOne({
      where: { id: requestId },
    });
    if (purchaseRequest) {
      book.matchReason = buildMatchReason(purchaseRequest, book);
    }
  }

  if (userId && userId !== book.sellerId) {
    const historyRepository = AppDataSource.getRepository(BrowsingHistory);
    const history = historyRepository.create({
      userId,
      bookId: book.id,
    });
    await historyRepository.save(history);
  }

  res.json(book);
};

export const updateBookStatus = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['available', 'reserved', 'sold'].includes(status)) {
    return res.status(400).json({ message: '非法的书籍状态' });
  }

  const bookRepository = AppDataSource.getRepository(Book);
  const book = await bookRepository.findOne({ where: { id } });

  if (!book) {
    return res.status(404).json({ message: '书籍不存在' });
  }

  if (book.sellerId !== req.userId) {
    return res.status(403).json({ message: '无权限操作' });
  }

  // 该书存在进行中(pending)交易时，状态必须跟随交易流转，避免与预约状态不一致
  if (book.status === 'reserved' || status === 'available') {
    const pendingTrade = await AppDataSource.getRepository(Trade).findOne({
      where: { bookId: id, status: 'pending' },
    });
    if (pendingTrade) {
      return res.status(409).json({
        message: '该书有进行中的交易，请在交易中拒绝或完成后再修改状态',
      });
    }
  }

  book.status = status;
  await bookRepository.save(book);

  res.json({ message: '状态更新成功', book });
};

export const deleteBook = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const bookRepository = AppDataSource.getRepository(Book);
  const book = await bookRepository.findOne({ where: { id } });

  if (!book) {
    return res.status(404).json({ message: '书籍不存在' });
  }

  if (book.sellerId !== req.userId) {
    return res.status(403).json({ message: '无权限操作' });
  }

  await bookRepository.delete({ id });
  res.json({ message: '删除成功' });
};

export const getMyBooks = async (req: AuthenticatedRequest, res: Response) => {
  const bookRepository = AppDataSource.getRepository(Book);
  const books = await bookRepository.find({
    where: { sellerId: req.userId },
    order: { createdAt: 'DESC' },
  });

  res.json(books);
};

export const getRecommendBooks = async (req: AuthenticatedRequest, res: Response) => {
  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({ where: { id: req.userId } });

  const bookRepository = AppDataSource.getRepository(Book);
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

  const requestCounts = await countRequestsForBooks(books);
  books.forEach((b) => (b.matchedRequestCount = requestCounts[b.id] ?? 0));

  res.json(books);
};
