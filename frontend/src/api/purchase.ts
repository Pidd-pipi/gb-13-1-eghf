import request from './request';
import type { PurchaseRequest, SubjectCategory } from '@/types';

export const createPurchaseRequest = (data: {
  bookTitle: string;
  author?: string;
  isbn?: string;
  expectedPrice?: number;
  conditions?: string[];
  description?: string;
  category: SubjectCategory;
  campus: string;
  courseCode: string;
  edition: string;
}) => {
  return request.post<{ request: PurchaseRequest }>('/purchase-requests', data);
};

export const getPurchaseRequests = (params: {
  category?: SubjectCategory;
  campus?: string;
  courseCode?: string;
  edition?: string;
  page?: number;
  limit?: number;
}) => {
  return request.get<{ requests: PurchaseRequest[]; pagination: any }>('/purchase-requests', { params });
};

export const getMyPurchaseRequests = () => {
  return request.get<PurchaseRequest[]>('/my/purchase-requests');
};

export const getPurchaseRequestById = (id: string) => {
  return request.get<PurchaseRequest>(`/purchase-requests/${id}`);
};

export const closePurchaseRequest = (id: string) => {
  return request.put(`/purchase-requests/${id}/close`);
};
