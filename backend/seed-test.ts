/* eslint-disable */
// 集成测试种子脚本：创建买家/卖家、同版与不同版的书与求购单
import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppDataSource } from './src/config/database';
import { User } from './src/entities/User';
import { Book } from './src/entities/Book';
import { PurchaseRequest } from './src/entities/PurchaseRequest';

const run = async () => {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const bookRepo = AppDataSource.getRepository(Book);
  const reqRepo = AppDataSource.getRepository(PurchaseRequest);

  await AppDataSource.query('SET FOREIGN_KEY_CHECKS=0');
  await reqRepo.query('DELETE FROM trades');
  await bookRepo.query('DELETE FROM books');
  await reqRepo.query('DELETE FROM purchase_requests');
  await userRepo.query('DELETE FROM users');
  await AppDataSource.query('SET FOREIGN_KEY_CHECKS=1');

  const mkUser = async (studentId: string, name: string) =>
    userRepo.save(
      userRepo.create({
        studentId,
        email: `${studentId}@stu.edu`,
        password: await bcrypt.hash('pass123', 10),
        name,
        isVerified: true,
      } as User),
    );

  const buyer = await mkUser('20210001', '买家小明');
  const buyer2 = await mkUser('20210002', '买家小红');
  const seller = await mkUser('20220001', '卖家老王');
  const seller2 = await mkUser('20220002', '卖家老李');

  const mkBook = async (b: Partial<Book> & { title: string; sellerId: string }) =>
    bookRepo.save(
      bookRepo.create({
        author: b.author ?? '张三',
        isbn: b.isbn ?? null,
        originalPrice: b.originalPrice ?? 50,
        price: b.price ?? 25,
        condition: b.condition ?? 'good',
        images: b.images ?? ['http://example.com/a.jpg'],
        tradeMethod: b.tradeMethod ?? 'meetup',
        campus: b.campus ?? '主校区',
        courseCode: b.courseCode ?? 'CS101',
        edition: b.edition ?? '第2版',
        category: b.category ?? 'science',
        description: b.description ?? '测试教材',
        status: b.status ?? 'available',
        ...b,
      } as Book),
    );

  // 卖家老王：2 本同版候选
  const bookA = await mkBook({ title: '高等数学（上）', sellerId: seller.id, price: 20 });
  const bookB = await mkBook({ title: '高等数学（上）另一本', sellerId: seller.id, price: 28 });
  // 卖家老李：1 本同版候选
  const bookC = await mkBook({ title: '高等数学（上）老李本', sellerId: seller2.id, price: 30 });
  // 价格超过期望价(期望25)
  const bookPricy = await mkBook({ title: '高等数学（上）贵本', sellerId: seller2.id, price: 99 });
  // 版次不同
  const bookEdition = await mkBook({ title: '高等数学 第3版', sellerId: seller2.id, edition: '第3版', price: 22 });
  // 校区不同
  const bookCampus = await mkBook({ title: '高等数学 东校区', sellerId: seller2.id, campus: '东校区', price: 22 });
  // 课程代码不同
  const bookCourse = await mkBook({ title: '其他课程', sellerId: seller2.id, courseCode: 'CS202', price: 22 });
  // 买家自己发的书（不应作为候选）
  const ownBook = await mkBook({ title: '我自己的高代', sellerId: buyer.id, price: 10 });
  // 已售出的书（不应作为候选）
  const soldBook = await mkBook({ title: '已售出教材', sellerId: seller.id, status: 'sold', price: 15 });

  const mkReq = async (r: Partial<PurchaseRequest> & { bookTitle: string; requesterId: string }) =>
    reqRepo.save(
      reqRepo.create({
        campus: r.campus ?? '主校区',
        courseCode: r.courseCode ?? 'CS101',
        edition: r.edition ?? '第2版',
        category: r.category ?? 'science',
        conditions: r.conditions ?? null,
        expectedPrice: r.expectedPrice ?? null,
        author: r.author ?? null,
        isbn: r.isbn ?? null,
        description: r.description ?? null,
        status: r.status ?? 'active',
        ...r,
      } as PurchaseRequest),
    );

  // 买家小明求购 CS101 第2版 主校区，期望价 25
  const reqMain = await mkReq({ bookTitle: '高等数学（上）', requesterId: buyer.id, expectedPrice: 25 });
  // 买家小红同样求购（验证释放后可被她抢到）
  const reqSecond = await mkReq({ bookTitle: '高等数学（上）', requesterId: buyer2.id, expectedPrice: 40 });
  // 无价格上限的求购（验证贵本书也算候选）
  const reqNoPrice = await mkReq({ bookTitle: '高代 无价格限制', requesterId: buyer2.id });
  // 版次不同的求购
  const reqOtherEdition = await mkReq({ bookTitle: '高代 第3版', requesterId: buyer2.id, edition: '第3版' });

  const tokenOf = (id: string) => jwt.sign({ userId: id }, process.env.JWT_SECRET || 'integration_test_secret', { expiresIn: '7d' });

  const out = {
    buyer: { id: buyer.id, token: tokenOf(buyer.id) },
    buyer2: { id: buyer2.id, token: tokenOf(buyer2.id) },
    seller: { id: seller.id, token: tokenOf(seller.id) },
    seller2: { id: seller2.id, token: tokenOf(seller2.id) },
    bookA: bookA.id, bookB: bookB.id, bookC: bookC.id,
    bookPricy: bookPricy.id, bookEdition: bookEdition.id, bookCampus: bookCampus.id,
    bookCourse: bookCourse.id, ownBook: ownBook.id, soldBook: soldBook.id,
    reqMain: reqMain.id, reqSecond: reqSecond.id, reqNoPrice: reqNoPrice.id, reqOtherEdition: reqOtherEdition.id,
  };
  console.log(JSON.stringify(out, null, 2));
  await AppDataSource.destroy();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
