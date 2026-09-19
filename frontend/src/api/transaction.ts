import request from './request';
import type { Transaction } from '@/types';

/** 买家从求购单详情中选定一本候选书：预约 + 生成交易记录 */
export const selectBook = (purchaseRequestId: string, bookId: string) => {
  return request.post<{ duplicated: boolean; transaction: Transaction }>('/transactions/select-book', {
    purchaseRequestId,
    bookId,
  });
};

export const getMyTransactions = (role: 'all' | 'buyer' | 'seller' = 'all') => {
  return request.get<Transaction[]>('/my/transactions', { params: { role } });
};

export const acceptTransaction = (id: string) => {
  return request.put<{ transaction: Transaction }>(`/transactions/${id}/accept`);
};

export const rejectTransaction = (id: string) => {
  return request.put<{ transaction: Transaction }>(`/transactions/${id}/reject`);
};

export const cancelTransaction = (id: string) => {
  return request.put<{ transaction: Transaction }>(`/transactions/${id}/cancel`);
};

export const completeTransaction = (id: string) => {
  return request.put<{ transaction: Transaction }>(`/transactions/${id}/complete`);
};
