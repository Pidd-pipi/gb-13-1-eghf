export interface User {
  id: string;
  email: string;
  studentId: string;
  name?: string;
  department?: string;
  contactInfo?: string;
  avatarUrl?: string;
  positiveRatingRate: number;
  totalReviews: number;
  createdAt: string;
}

export type BookCondition = 'new' | 'like_new' | 'good' | 'fair';
export type BookStatus = 'available' | 'reserved' | 'sold';
export type TradeMethod = 'meetup' | 'shipping';
export type SubjectCategory = 'science' | 'humanities' | 'business' | 'arts' | 'other';

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  originalPrice: number;
  price: number;
  condition: BookCondition;
  images: string[];
  tradeMethod: TradeMethod;
  campus: string;
  /** 课程代码，如 CS101 */
  courseCode: string;
  /** 版次，如 第3版 */
  edition: string;
  category: SubjectCategory;
  description?: string;
  status: BookStatus;
  sellerId: string;
  seller?: User;
  /** 同校区+同课程代码+同版次的在求购单数（列表/我的发布） */
  matchingRequestCount?: number;
  /** 详情页：匹配到的求购单及匹配原因 */
  matchingRequests?: BookMatchingRequest[];
  createdAt: string;
  updatedAt: string;
}

export interface BookMatchingRequest {
  id: string;
  bookTitle: string;
  expectedPrice?: number | null;
  conditions?: string[] | null;
  requesterName: string;
  reasons: string[];
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  bookId?: string;
  content: string;
  imageUrls?: string[];
  isRead: boolean;
  createdAt: string;
}

export type PurchaseRequestStatus = 'active' | 'matched' | 'closed';

export interface PurchaseRequest {
  id: string;
  bookTitle: string;
  author?: string | null;
  isbn?: string | null;
  expectedPrice?: number | null;
  conditions?: string[] | null;
  description?: string | null;
  category: SubjectCategory;
  campus: string;
  courseCode: string;
  edition: string;
  status: PurchaseRequestStatus;
  requesterId: string;
  requester?: User;
  /** 剩余候选书数量（同校区+同课程代码+同版次且可购买） */
  candidateCount?: number;
  /** 详情页：候选书及匹配原因 */
  candidates?: CandidateBook[];
  createdAt: string;
}

export interface CandidateBook {
  id: string;
  title: string;
  author: string;
  price: number;
  condition: BookCondition;
  images: string[];
  campus: string;
  courseCode: string;
  edition: string;
  sellerName: string;
  reasons: string[];
}

export type TransactionStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';

export interface Transaction {
  id: string;
  bookId: string;
  purchaseRequestId: string;
  buyerId: string;
  sellerId: string;
  priceSnapshot: number;
  matchReason?: string[] | null;
  status: TransactionStatus;
  book?: Book;
  purchaseRequest?: PurchaseRequest;
  buyer?: User;
  seller?: User;
  createdAt: string;
  updatedAt: string;
}

export type ReviewType = 'positive' | 'neutral' | 'negative';

export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  bookId?: string;
  type: ReviewType;
  content?: string;
  reviewer?: User;
  createdAt: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export const conditionMap: Record<BookCondition, string> = {
  new: '全新',
  like_new: '九成新',
  good: '七成新',
  fair: '五成新',
};

export const statusMap: Record<BookStatus, string> = {
  available: '可购买',
  reserved: '已预约',
  sold: '已售出',
};

export const purchaseStatusMap: Record<PurchaseRequestStatus, string> = {
  active: '求购中',
  matched: '已预约',
  closed: '已关闭',
};

export const transactionStatusMap: Record<TransactionStatus, string> = {
  pending: '待卖家确认',
  accepted: '卖家已接受',
  rejected: '卖家已拒绝',
  cancelled: '买家已取消',
  completed: '交易完成',
};

export const tradeMethodMap: Record<TradeMethod, string> = {
  meetup: '面交',
  shipping: '邮寄',
};

export const categoryMap: Record<SubjectCategory, string> = {
  science: '理工',
  humanities: '文史',
  business: '经管',
  arts: '艺术',
  other: '其他',
};
