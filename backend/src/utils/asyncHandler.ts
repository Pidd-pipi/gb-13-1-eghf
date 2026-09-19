import { Response } from 'express';
import { BusinessError } from '../services/transaction.service';

/** 将业务错误统一转换为对应 HTTP 状态码，其余错误回退 500 */
export const businessErrorHandler = (res: Response, error: unknown, fallbackMessage = '服务器内部错误') => {
  if (error instanceof BusinessError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: fallbackMessage });
};
