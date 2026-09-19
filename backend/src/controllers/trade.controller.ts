import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  selectBookForRequest,
  cancelTradeByBuyer,
  rejectTradeBySeller,
  completeTrade,
  listMyTrades,
  getTradeById,
  TradeError,
} from '../services/trade.service';
import { TradeStatus } from '../entities/Trade';

const handleError = (error: unknown, res: Response) => {
  if (error instanceof TradeError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: '交易操作失败' });
};

/** POST /purchase-requests/:id/select  body: { bookId } */
export const selectBook = async (req: AuthenticatedRequest, res: Response) => {
  const { id: purchaseRequestId } = req.params;
  const { bookId } = req.body;
  if (!bookId) {
    return res.status(400).json({ message: '缺少 bookId' });
  }
  try {
    const result = await selectBookForRequest(req.userId!, purchaseRequestId, bookId);
    return res.status(result.alreadySelected ? 200 : 201).json({
      message: result.alreadySelected ? '你已预约该书，请勿重复选择' : '预约成功，已生成交易记录',
      alreadySelected: result.alreadySelected,
      trade: result.trade,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/** POST /trades/:id/cancel 买家取消 */
export const cancelTrade = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await cancelTradeByBuyer(req.userId!, req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res);
  }
};

/** POST /trades/:id/reject 卖家拒绝 */
export const rejectTrade = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await rejectTradeBySeller(req.userId!, req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res);
  }
};

/** POST /trades/:id/complete 完成交易 */
export const completeTradeController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await completeTrade(req.userId!, req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res);
  }
};

/** GET /my/trades?role=&status= */
export const getMyTrades = async (req: AuthenticatedRequest, res: Response) => {
  const { role, status, bookId } = req.query;
  if (role && role !== 'buyer' && role !== 'seller') {
    return res.status(400).json({ message: 'role 只能是 buyer 或 seller' });
  }
  if (status && !['pending', 'completed', 'cancelled', 'rejected'].includes(status as string)) {
    return res.status(400).json({ message: '非法的交易状态' });
  }
  try {
    const trades = await listMyTrades(req.userId!, {
      role: role as 'buyer' | 'seller' | undefined,
      status: status as TradeStatus | undefined,
      bookId: bookId as string | undefined,
    });
    return res.json({ trades });
  } catch (error) {
    return handleError(error, res);
  }
};

/** GET /trades/:id */
export const getTrade = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trade = await getTradeById(req.userId!, req.params.id);
    return res.json(trade);
  } catch (error) {
    return handleError(error, res);
  }
};
