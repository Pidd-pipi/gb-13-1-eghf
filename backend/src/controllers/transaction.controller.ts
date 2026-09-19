import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { transactionService } from '../services/transaction.service';
import { businessErrorHandler } from '../utils/asyncHandler';

/** 买家从求购单详情中选定一本候选书：预约 + 生成交易记录 */
export const selectBook = async (req: AuthenticatedRequest, res: Response) => {
  const { purchaseRequestId, bookId } = req.body;

  if (!purchaseRequestId || !bookId) {
    return res.status(400).json({ message: '缺少求购单或书籍信息' });
  }

  try {
    const { transaction, duplicated } = await transactionService.selectBook(
      purchaseRequestId,
      bookId,
      req.userId!,
    );
    res.status(duplicated ? 200 : 201).json({
      message: duplicated ? '该书籍已在您的预约中，请勿重复选择' : '预约成功，等待卖家确认',
      duplicated,
      transaction,
    });
  } catch (error) {
    return businessErrorHandler(res, error, '预约失败');
  }
};

export const acceptTransaction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const transaction = await transactionService.accept(req.params.id, req.userId!);
    res.json({ message: '已接受预约，等待完成交易', transaction });
  } catch (error) {
    return businessErrorHandler(res, error, '操作失败');
  }
};

export const rejectTransaction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const transaction = await transactionService.reject(req.params.id, req.userId!);
    res.json({ message: '已拒绝预约，书籍重新开放购买', transaction });
  } catch (error) {
    return businessErrorHandler(res, error, '操作失败');
  }
};

export const cancelTransaction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const transaction = await transactionService.cancel(req.params.id, req.userId!);
    res.json({ message: '已取消预约，书籍重新开放匹配', transaction });
  } catch (error) {
    return businessErrorHandler(res, error, '操作失败');
  }
};

export const completeTransaction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const transaction = await transactionService.complete(req.params.id, req.userId!);
    res.json({ message: '交易完成', transaction });
  } catch (error) {
    return businessErrorHandler(res, error, '操作失败');
  }
};

export const getMyTransactions = async (req: AuthenticatedRequest, res: Response) => {
  const role = (req.query.role as 'buyer' | 'seller' | 'all') || 'all';
  try {
    const transactions = await transactionService.listByUser(req.userId!, role);
    res.json(transactions);
  } catch (error) {
    return businessErrorHandler(res, error, '查询失败');
  }
};
