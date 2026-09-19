import request from './request';
import type { Trade, TradeStatus } from '@/types';

export interface TradeListParams {
  role?: 'buyer' | 'seller';
  status?: TradeStatus;
}

export const getMyTrades = (params: TradeListParams = {}) => {
  return request.get<{ trades: Trade[] }>('/my/trades', { params });
};

/** 按书查询当前用户相关交易（买家或卖家） */
export const getTradesByBook = (bookId: string) => {
  return request.get<{ trades: Trade[] }>('/my/trades', { params: { bookId } });
};

export const getTradeById = (id: string) => {
  return request.get<Trade>(`/trades/${id}`);
};

/** 买家取消交易，释放书籍 */
export const cancelTrade = (id: string) => {
  return request.post<Trade>(`/trades/${id}/cancel`);
};

/** 卖家拒绝交易，释放书籍 */
export const rejectTrade = (id: string) => {
  return request.post<Trade>(`/trades/${id}/reject`);
};

/** 完成交易，书置为已售出 */
export const completeTrade = (id: string) => {
  return request.post<Trade>(`/trades/${id}/complete`);
};
