import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from './User';
import { Book } from './Book';
import { PurchaseRequest } from './PurchaseRequest';

export type TradeStatus = 'pending' | 'completed' | 'cancelled' | 'rejected';
export type CancelRole = 'buyer' | 'seller';

@Entity('trades')
export class Trade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 求购单：买家凭此选定教材 */
  @ManyToOne(() => PurchaseRequest, (request) => request.trades)
  purchaseRequest: PurchaseRequest;

  @Column()
  @Index('idx_trade_request')
  purchaseRequestId: string;

  /** 被预约的书 */
  @ManyToOne(() => Book, (book) => book.trades)
  book: Book;

  @Column()
  @Index('idx_trade_book')
  bookId: string;

  @ManyToOne(() => User)
  buyer: User;

  @Column()
  @Index('idx_trade_buyer')
  buyerId: string;

  @ManyToOne(() => User)
  seller: User;

  @Column()
  @Index('idx_trade_seller')
  sellerId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'enum', enum: ['pending', 'completed', 'cancelled', 'rejected'], default: 'pending' })
  @Index('idx_trade_status')
  status: TradeStatus;

  /** 取消操作的发起方，便于前端区分提示文案 */
  @Column({ type: 'enum', enum: ['buyer', 'seller'], nullable: true })
  cancelledBy: CancelRole | null;

  /**
   * 数据库级并发兜底：该虚拟生成列仅在交易进行中（pending）时取 bookId，
   * 唯一约束保证同一本书在任意时刻至多存在一条进行中的交易。
   * 交易完成/取消/拒绝后该列为 NULL，MySQL 唯一索引允许多个 NULL，书可被重新匹配。
   */
  @Column({
    type: 'varchar',
    nullable: true,
    generatedType: 'VIRTUAL',
    asExpression: "CASE WHEN `status` = 'pending' THEN `bookId` ELSE NULL END",
  })
  @Index('idx_trade_pending_book', { unique: true })
  pendingBookId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
