import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './User';
import { Book } from './Book';
import { PurchaseRequest } from './PurchaseRequest';

/**
 * pending   买家已选定书籍、书籍已预约，等待卖家确认
 * accepted  卖家同意，等待线下面交/邮寄完成
 * rejected  卖家拒绝，书籍已释放回可购买
 * cancelled 买家取消预约，书籍已释放回可购买
 * completed 交易完成，书籍已售出
 */
export type TransactionStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';

// 仍在占用书籍/求购单的状态
export const ACTIVE_TRANSACTION_STATUSES: TransactionStatus[] = ['pending', 'accepted'];
// 已终结、不再占用任何资源的状态
export const TERMINAL_TRANSACTION_STATUSES: TransactionStatus[] = ['rejected', 'cancelled', 'completed'];

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ---- 交易三方快照 ----

  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  book: Book;

  @Column()
  @Index('idx_tx_book')
  bookId: string;

  @ManyToOne(() => PurchaseRequest, { onDelete: 'CASCADE' })
  purchaseRequest: PurchaseRequest;

  @Column()
  @Index('idx_tx_request')
  purchaseRequestId: string;

  @ManyToOne(() => User)
  buyer: User;

  @Column()
  @Index('idx_tx_buyer')
  buyerId: string;

  @ManyToOne(() => User)
  seller: User;

  @Column()
  @Index('idx_tx_seller')
  sellerId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  priceSnapshot: number;

  // 选定时的匹配原因快照（同校区/同课程代码/同版次/价格新旧满足情况），避免后续数据变动影响展示
  @Column({ type: 'simple-json', nullable: true })
  matchReason: string[];

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  @Index('idx_tx_status')
  status: TransactionStatus;

  /**
   * 占用标记：仅在 pending/accepted 期间分别等于 bookId / purchaseRequestId，终结后置 NULL。
   * 利用唯一索引在数据库层面保证「同一本书」「同一张求购单」最多只存在一笔进行中的交易，
   * 与业务层的条件更新（乐观抢占）一起构成双保险，杜绝并发抢同一本书成功多次。
   */
  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_tx_active_book', { unique: true })
  activeBookId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_tx_active_request', { unique: true })
  activeRequestId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
