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
export type TradeStatus = 'pending' | 'completed' | 'cancelled' | 'rejected';

export interface MatchReason {
  matched: boolean;
  campus: boolean;
  courseCode: boolean;
  edition: boolean;
  summary: string;
}

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
  courseCode: string;
  edition: string;
  category: SubjectCategory;
  description?: string;
  status: BookStatus;
  sellerId: string;
  seller?: User;
  /** 同校区/同课程代码/同版次的活跃求购单数 */
  matchedRequestCount?: number;
  matchReason?: MatchReason;
  createdAt: string;
  updatedAt: string;
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
  status: 'active' | 'closed';
  requesterId: string;
  requester?: User;
  /** 剩余可购买的同版候选书数 */
  candidateCount?: number;
  /** 详情页：候选书籍（仅求购者本人可见） */
  candidateBooks?: Book[];
  /** 详情页：当前进行中的交易概要 */
  pendingTrade?: { id: string; bookId: string; status: TradeStatus } | null;
  /** 我的求购单列表：进行中的交易 */
  pendingTrades?: Array<{ id: string; bookId: string }>;
  matchReason?: MatchReason;
  createdAt: string;
}

export interface Trade {
  id: string;
  purchaseRequestId: string;
  bookId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  status: TradeStatus;
  cancelledBy?: 'buyer' | 'seller' | null;
  role?: 'buyer' | 'seller';
  book?: Book;
  purchaseRequest?: PurchaseRequest;
  message?: string;
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

export const tradeStatusMap: Record<TradeStatus, string> = {
  pending: '待交易',
  completed: '已完成',
  cancelled: '买家已取消',
  rejected: '卖家已拒绝',
};

export const tradeStatusTagType: Record<TradeStatus, 'primary' | 'success' | 'default' | 'danger'> = {
  pending: 'primary',
  completed: 'success',
  cancelled: 'default',
  rejected: 'danger',
};
