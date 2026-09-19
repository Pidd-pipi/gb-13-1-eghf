import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { User } from './User';
import { Favorite } from './Favorite';
import { Message } from './Message';

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

  @Column({ type: 'varchar', length: 32 })
  condition: BookCondition;

  @Column('simple-array')
  images: string[];

  @Column({ type: 'varchar', length: 32 })
  tradeMethod: TradeMethod;

  @Column()
  campus: string;

  // 教材同版匹配字段：课程代码 + 版次（同一课程不同版次教材内容不同，不互相匹配）
  @Column()
  @Index('idx_book_course_code')
  courseCode: string;

  @Column()
  edition: string;

  @Column({ type: 'varchar', length: 32 })
  @Index('idx_book_category')
  category: SubjectCategory;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 32, default: 'available' })
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

  @CreateDateColumn()
  @Index('idx_book_created')
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
