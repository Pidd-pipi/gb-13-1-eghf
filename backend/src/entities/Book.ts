import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { User } from './User';
import { Favorite } from './Favorite';
import { Message } from './Message';
import { Trade } from './Trade';

export type BookCondition = 'new' | 'like_new' | 'good' | 'fair';
export type BookStatus = 'available' | 'reserved' | 'sold';
export type TradeMethod = 'meetup' | 'shipping';
export type SubjectCategory = 'science' | 'humanities' | 'business' | 'arts' | 'other';

@Entity('books')
export class Book {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index('idx_book_title')
  title: string;

  @Column()
  @Index('idx_book_author')
  author: string;

  @Column({ nullable: true })
  @Index('idx_book_isbn')
  isbn: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  originalPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  @Index('idx_book_price')
  price: number;

  @Column({ type: 'enum', enum: ['new', 'like_new', 'good', 'fair'] })
  condition: BookCondition;

  @Column('simple-array')
  images: string[];

  @Column({ type: 'enum', enum: ['meetup', 'shipping'] })
  tradeMethod: TradeMethod;

  @Column()
  campus: string;

  @Column()
  @Index('idx_book_course')
  courseCode: string;

  @Column()
  @Index('idx_book_edition')
  edition: string;

  @Column({ type: 'enum', enum: ['science', 'humanities', 'business', 'arts', 'other'] })
  @Index('idx_book_category')
  category: SubjectCategory;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ['available', 'reserved', 'sold'], default: 'available' })
  @Index('idx_book_status')
  status: BookStatus;

  @ManyToOne(() => User, user => user.books)
  seller: User;

  @Column()
  sellerId: string;

  @OneToMany(() => Favorite, favorite => favorite.book)
  favorites: Favorite[];

  @OneToMany(() => Message, message => message.book)
  messages: Message[];

  @OneToMany(() => Trade, trade => trade.book)
  trades: Trade[];

  @CreateDateColumn()
  @Index('idx_book_created')
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** 非持久化：同校区/同课程代码/同版次的活跃求购单数（列表接口动态计算） */
  matchedRequestCount?: number;

  /** 非持久化：与指定求购单的匹配原因（详情接口动态计算） */
  matchReason?: unknown;
}
