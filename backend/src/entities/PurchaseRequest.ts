import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index, OneToMany } from 'typeorm';
import { User } from './User';
import { Trade } from './Trade';
import type { Book } from './Book';

export type SubjectCategory = 'science' | 'humanities' | 'business' | 'arts' | 'other';
export type RequestStatus = 'active' | 'closed';

@Entity('purchase_requests')
export class PurchaseRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bookTitle: string;

  @Column({ type: 'varchar', nullable: true })
  author: string | null;

  @Column({ type: 'varchar', nullable: true })
  isbn: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  expectedPrice: number | null;

  @Column({ type: 'simple-array', nullable: true })
  conditions: string[] | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ['science', 'humanities', 'business', 'arts', 'other'] })
  @Index('idx_request_category')
  category: SubjectCategory;

  @Column()
  campus: string;

  @Column()
  @Index('idx_request_course')
  courseCode: string;

  @Column()
  @Index('idx_request_edition')
  edition: string;

  @Column({ type: 'enum', enum: ['active', 'closed'], default: 'active' })
  @Index('idx_request_status')
  status: RequestStatus;

  @ManyToOne(() => User, user => user.purchaseRequests)
  requester: User;

  @Column()
  @Index('idx_request_requester')
  requesterId: string;

  @OneToMany(() => Trade, trade => trade.purchaseRequest)
  trades: Trade[];

  @CreateDateColumn()
  @Index('idx_request_created')
  createdAt: Date;

  /** 非持久化：剩余可购买的同版候选书数（列表/详情接口动态计算） */
  candidateCount?: number;

  /** 非持久化：候选书籍（仅求购者本人在详情接口可见） */
  candidateBooks?: Book[];

  /** 非持久化：当前求购单进行中的交易概要 */
  pendingTrade?: { id: string; bookId: string; status: string } | null;

  /** 非持久化：我的求购单列表中进行中的交易 */
  pendingTrades?: Array<{ id: string; bookId: string }>;

  /** 非持久化：与指定书籍的匹配原因（详情接口动态计算） */
  matchReason?: unknown;
}
