import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { User } from './User';

export type SubjectCategory = 'science' | 'humanities' | 'business' | 'arts' | 'other';
// active: 求购中可匹配；matched: 已选定书籍并预约（等待卖家处理）；closed: 买家主动关闭/已成交
export type RequestStatus = 'active' | 'matched' | 'closed';

@Entity('purchase_requests')
export class PurchaseRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bookTitle: string;

  @Column({ nullable: true })
  author: string;

  @Column({ nullable: true })
  isbn: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  expectedPrice: number;

  @Column({ type: 'simple-array', nullable: true })
  conditions: string[];

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 32 })
  @Index('idx_request_category')
  category: SubjectCategory;

  @Column()
  campus: string;

  // 教材同版匹配字段：课程代码 + 版次
  @Column()
  @Index('idx_request_course_code')
  courseCode: string;

  @Column()
  edition: string;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: RequestStatus;

  @ManyToOne(() => User, user => user.purchaseRequests)
  requester: User;

  @Column()
  @Index('idx_request_requester')
  requesterId: string;

  @CreateDateColumn()
  @Index('idx_request_created')
  createdAt: Date;
}
