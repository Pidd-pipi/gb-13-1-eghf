import 'reflect-metadata';
import assert from 'assert';
import { DataSource } from 'typeorm';
import initSqlJs from 'sql.js';
import { entities, Book, PurchaseRequest, Transaction, User } from '../src/entities';
import { setDataSourceOverride, ds } from '../src/services/db';
import { matchingService } from '../src/services/matching.service';
import { transactionService, BusinessError } from '../src/services/transaction.service';

let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const expectError = async (fn: () => Promise<unknown>, statusCode?: number) => {
  try {
    await fn();
  } catch (error) {
    if (statusCode !== undefined && error instanceof BusinessError) {
      assert.strictEqual(error.statusCode, statusCode, `期望状态码 ${statusCode}，实际 ${error.statusCode}`);
    }
    return error;
  }
  throw new assert.AssertionError({ message: '预期函数抛出错误，但它成功了' });
};

async function setupDataSource(): Promise<DataSource> {
  const SQL = await initSqlJs();
  const dataSource = new DataSource({
    type: 'sqljs',
    driver: SQL,
    autoSave: false,
    synchronize: true,
    entities,
  } as any);
  await dataSource.initialize();
  setDataSourceOverride(dataSource);
  return dataSource;
}

async function seed() {
  const userRepo = ds().getRepository(User);
  const mkUser = (id: string, name: string) => {
    const u = new User();
    u.id = id;
    u.studentId = `S-${id}`;
    u.email = `${id}@example.com`;
    u.password = 'x';
    u.name = name;
    return userRepo.save(u);
  };
  const [A, X, Y, Z] = await Promise.all([
    mkUser('u-a', '卖家甲'),
    mkUser('u-x', '买家X'),
    mkUser('u-y', '买家Y'),
    mkUser('u-z', '买家Z'),
  ]);

  const bookRepo = ds().getRepository(Book);
  const mkBook = (id: string, sellerId: string, campus: string, courseCode: string, edition: string, price: number) => {
    const b = new Book();
    b.id = id;
    b.title = '高等数学';
    b.author = '同济大学';
    b.isbn = null as any;
    b.originalPrice = 50;
    b.price = price as any;
    b.condition = 'new';
    b.images = ['http://img/a.jpg'];
    b.tradeMethod = 'meetup';
    b.campus = campus;
    b.courseCode = courseCode;
    b.edition = edition;
    b.category = 'science';
    b.description = null as any;
    b.status = 'available';
    b.sellerId = sellerId;
    return bookRepo.save(b);
  };
  // b1/b2：主校区 CS101 第3版（卖家甲）；b3 版次不同；b4 校区不同；b5 课程不同
  await Promise.all([
    mkBook('b1', 'u-a', '主校区', 'CS101', '第3版', 20),
    mkBook('b2', 'u-a', '主校区', 'CS101', '第3版', 25),
    mkBook('b3', 'u-a', '主校区', 'CS101', '第2版', 18),
    mkBook('b4', 'u-a', '东校区', 'CS101', '第3版', 19),
    mkBook('b5', 'u-a', '主校区', 'MATH101', '第3版', 21),
  ]);

  const prRepo = ds().getRepository(PurchaseRequest);
  const mkRequest = (id: string, requesterId: string, campus: string, courseCode: string, edition: string, expectedPrice?: number) => {
    const r = new PurchaseRequest();
    r.id = id;
    r.bookTitle = '高等数学';
    r.author = '同济大学';
    r.isbn = null as any;
    r.expectedPrice = (expectedPrice ?? null) as any;
    r.conditions = expectedPrice ? ['new', 'like_new'] : (null as any);
    r.description = null as any;
    r.category = 'science';
    r.campus = campus;
    r.courseCode = courseCode;
    r.edition = edition;
    r.status = 'active';
    r.requesterId = requesterId;
    return prRepo.save(r);
  };
  // r1：X 求 主校区 CS101 第3版，期望 22；r2：Y 同样需求无期望价；r3：卖家甲自己求（排除自售）
  await Promise.all([
    mkRequest('r1', 'u-x', '主校区', 'CS101', '第3版', 22),
    mkRequest('r2', 'u-y', '主校区', 'CS101', '第3版'),
    mkRequest('r3', 'u-a', '主校区', 'CS101', '第3版'),
  ]);

  const get = { A, X, Y, Z };
  return get;
}

const reload = {
  book: (id: string) => ds().getRepository(Book).findOneByOrFail({ id }),
  request: (id: string) => ds().getRepository(PurchaseRequest).findOneByOrFail({ id }),
};

async function main() {
  await setupDataSource();
  await seed();

  // ---------- 一、匹配规则 ----------
  await test('候选书只匹配同校区+同课程代码+同版次且可购买，按价格升序', async () => {
    const r1 = await reload.request('r1');
    const candidates = await matchingService.findCandidates(r1);
    assert.deepStrictEqual(
      candidates.map((b) => b.id),
      ['b1', 'b2'],
    );
  });

  await test('剩余候选数：r1/r2 为 2；卖家自己发的求购单排除自售，为 0', async () => {
    const [r1, r2, r3] = await Promise.all([reload.request('r1'), reload.request('r2'), reload.request('r3')]);
    assert.strictEqual(await matchingService.countCandidates(r1), 2);
    assert.strictEqual(await matchingService.countCandidates(r2), 2);
    assert.strictEqual(await matchingService.countCandidates(r3), 0);
    const batch = await matchingService.countCandidatesBatch([r1, r2, r3]);
    assert.deepStrictEqual(batch, { r1: 2, r2: 2, r3: 0 });
  });

  await test('书籍视角：b1 能匹配 r1、r2 两张 active 求购单（不能匹配自己的 r3）', async () => {
    const b1 = await reload.book('b1');
    const requests = await matchingService.findMatchingRequestsForBook(b1);
    assert.deepStrictEqual(
      requests.map((r) => r.id).sort(),
      ['r1', 'r2'],
    );
    const counts = await matchingService.countMatchingRequestsBatch([b1]);
    assert.strictEqual(counts.b1, 2);
  });

  await test('匹配原因包含同校区/同课程/同版次，且价格与新旧要求被标注', async () => {
    const r1 = await reload.request('r1');
    const b1 = await reload.book('b1');
    const b2 = await reload.book('b2');
    const reasons1 = matchingService.buildMatchReasons(b1, r1).join('|');
    assert.match(reasons1, /同校区/);
    assert.match(reasons1, /CS101/);
    assert.match(reasons1, /第3版/);
    assert.match(reasons1, /价格符合预期/);
    assert.match(reasons1, /新旧程度符合/);
    const reasons2 = matchingService.buildMatchReasons(b2, r1).join('|');
    assert.match(reasons2, /高于期望价格/);
  });

  // ---------- 二、选定与幂等 ----------
  await test('买家选定 b1：书籍预约、求购单 matched、生成 pending 交易记录', async () => {
    const { transaction } = await transactionService.selectBook('r1', 'b1', 'u-x');
    assert.strictEqual(transaction.status, 'pending');
    assert.strictEqual(transaction.sellerId, 'u-a');
    assert.strictEqual(transaction.activeBookId, 'b1');
    assert.strictEqual(transaction.activeRequestId, 'r1');
    assert.ok(Array.isArray(transaction.matchReason) && transaction.matchReason.length >= 3);
    assert.strictEqual((await reload.book('b1')).status, 'reserved');
    assert.strictEqual((await reload.request('r1')).status, 'matched');
  });

  await test('重复选择同一本书：幂等返回 duplicated=true，不产生第二条交易', async () => {
    const before = await ds().getRepository(Transaction).count();
    const result = await transactionService.selectBook('r1', 'b1', 'u-x');
    assert.strictEqual(result.duplicated, true);
    assert.strictEqual(result.transaction.status, 'pending');
    const after = await ds().getRepository(Transaction).count();
    assert.strictEqual(after, before);
  });

  await test('已有进行中预约时改选其他书：409', async () => {
    await expectError(() => transactionService.selectBook('r1', 'b2', 'u-x'), 409);
  });

  await test('选择不匹配的书（版次不同 b3）：409，书籍状态不变', async () => {
    await expectError(() => transactionService.selectBook('r2', 'b3', 'u-y'), 409);
    assert.strictEqual((await reload.book('b3')).status, 'available');
  });

  await test('不能为他人的求购单选书；不能选自己的书', async () => {
    await expectError(() => transactionService.selectBook('r2', 'b2', 'u-z'), 403);
    await expectError(() => transactionService.selectBook('r3', 'b5', 'u-a'), 400); // 自己的书
  });

  // ---------- 三、并发抢占 ----------
  await test('并发抢同一本书只能成功一次（Y/Z 同时抢 b2）', async () => {
    // r2 是 Y 的；再为 Z 建一张同条件求购单
    const zReq = new PurchaseRequest();
    zReq.id = 'r4';
    zReq.bookTitle = '高等数学';
    zReq.author = null as any;
    zReq.isbn = null as any;
    zReq.expectedPrice = null as any;
    zReq.conditions = null as any;
    zReq.description = null as any;
    zReq.category = 'science';
    zReq.campus = '主校区';
    zReq.courseCode = 'CS101';
    zReq.edition = '第3版';
    zReq.status = 'active';
    zReq.requesterId = 'u-z';
    await ds().getRepository(PurchaseRequest).save(zReq);

    const attempts = await Promise.allSettled([
      transactionService.selectBook('r2', 'b2', 'u-y'),
      transactionService.selectBook('r4', 'b2', 'u-z'),
    ]);
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled' && !a.value.duplicated);
    const rejected = attempts.filter((a) => a.status === 'rejected');
    assert.strictEqual(fulfilled.length, 1, `应恰好 1 个成功，实际 ${fulfilled.length}`);
    assert.strictEqual(rejected.length, 1, `应恰好 1 个失败，实际 ${rejected.length}`);
    assert.strictEqual((await reload.book('b2')).status, 'reserved');
    const activeTxOnB2 = await ds().getRepository(Transaction).count({ where: { activeBookId: 'b2' } });
    assert.strictEqual(activeTxOnB2, 1);
  });

  await test('数据库唯一索引兜底：同一本书无法存在两笔进行中的交易', async () => {
    const tx = ds().getRepository(Transaction).create({
      bookId: 'b2',
      purchaseRequestId: 'r-fake',
      buyerId: 'u-x',
      sellerId: 'u-a',
      priceSnapshot: 25 as any,
      status: 'pending',
      activeBookId: 'b2',
      activeRequestId: 'r-fake',
    });
    await expectError(() => ds().getRepository(Transaction).save(tx));
  });

  // ---------- 四、释放与重新匹配 ----------
  await test('买家取消：交易 cancelled，b1 释放回 available，r1 恢复 active', async () => {
    const tx = await ds().getRepository(Transaction).findOneByOrFail({ purchaseRequestId: 'r1', status: 'pending' });
    const cancelled = await transactionService.cancel(tx.id, 'u-x');
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.activeBookId, null);
    assert.strictEqual(cancelled.activeRequestId, null);
    assert.strictEqual((await reload.book('b1')).status, 'available');
    assert.strictEqual((await reload.request('r1')).status, 'active');
  });

  await test('释放后其他求购单可重新匹配：b2 被预约时 r1 候选只剩 b1；b2 拒绝后恢复', async () => {
    let r1 = await reload.request('r1');
    let candidates = await matchingService.findCandidates(r1);
    assert.deepStrictEqual(candidates.map((b) => b.id), ['b1']); // b2 仍被 Y/Z 之一预约

    // 找到占用 b2 的交易，由卖家甲拒绝
    const txB2 = await ds().getRepository(Transaction).findOneByOrFail({ activeBookId: 'b2' });
    const rejected = await transactionService.reject(txB2.id, 'u-a');
    assert.strictEqual(rejected.status, 'rejected');
    assert.strictEqual((await reload.book('b2')).status, 'available');
    const ownerRequest = await reload.request(txB2.purchaseRequestId);
    assert.strictEqual(ownerRequest.status, 'active');

    r1 = await reload.request('r1');
    candidates = await matchingService.findCandidates(r1);
    assert.deepStrictEqual(candidates.map((b) => b.id), ['b1', 'b2']);
  });

  await test('权限：卖家不能取消买家预约，买家不能拒绝，无关用户不能操作', async () => {
    const { transaction } = await transactionService.selectBook('r1', 'b1', 'u-x');
    await expectError(() => transactionService.cancel(transaction.id, 'u-a'), 403);
    await expectError(() => transactionService.reject(transaction.id, 'u-x'), 403);
    await expectError(() => transactionService.accept(transaction.id, 'u-z'), 403);
  });

  // ---------- 五、完整成交闭环 ----------
  await test('卖家接受 → 双方可确认完成：b1 售出、r1 关闭、交易 completed', async () => {
    const tx = await ds().getRepository(Transaction).findOneByOrFail({ purchaseRequestId: 'r1', status: 'pending' });
    const accepted = await transactionService.accept(tx.id, 'u-a');
    assert.strictEqual(accepted.status, 'accepted');
    // 接受后不能再拒绝（业务上已进入履约阶段）
    await expectError(() => transactionService.reject(tx.id, 'u-a'), 409);

    const completed = await transactionService.complete(tx.id, 'u-x'); // 买家确认完成
    assert.strictEqual(completed.status, 'completed');
    assert.strictEqual(completed.activeBookId, null);
    assert.strictEqual((await reload.book('b1')).status, 'sold');
    assert.strictEqual((await reload.request('r1')).status, 'closed');
  });

  await test('已售出书退出候选池；已关闭求购单不再匹配', async () => {
    const r2 = await reload.request('r2');
    const candidates = await matchingService.findCandidates(r2);
    assert.deepStrictEqual(candidates.map((b) => b.id), ['b2']);
    const b2 = await reload.book('b2');
    const reqs = await matchingService.findMatchingRequestsForBook(b2);
    // r1 已 closed、r3 是卖家自己，只剩 r2 / r4（均 active）
    assert.deepStrictEqual(reqs.map((r) => r.id).sort(), ['r2', 'r4']);
  });

  await test('终态交易不能重复流转；matched 状态的求购单不能直接关闭', async () => {
    const tx = await ds().getRepository(Transaction).findOneByOrFail({ status: 'completed' });
    await expectError(() => transactionService.cancel(tx.id, 'u-x'), 409);
    await expectError(() => transactionService.complete(tx.id, 'u-x'), 409);

    // Y 选定 b2 后求购单 matched，直接关闭应被拒绝
    const { transaction: yTx } = await transactionService.selectBook('r2', 'b2', 'u-y');
    assert.strictEqual(yTx.status, 'pending');
  });

  await test('刷新后状态一致：重新查询所有实体，状态落库无误', async () => {
    const books = await ds().getRepository(Book).find({ order: { id: 'ASC' } });
    const status = Object.fromEntries(books.map((b) => [b.id, b.status]));
    assert.deepStrictEqual(status, {
      b1: 'sold',
      b2: 'reserved',
      b3: 'available',
      b4: 'available',
      b5: 'available',
    });
    const requests = await ds().getRepository(PurchaseRequest).find({ order: { id: 'ASC' } });
    const rStatus = Object.fromEntries(requests.map((r) => [r.id, r.status]));
    assert.deepStrictEqual(rStatus, {
      r1: 'closed',
      r2: 'matched',
      r3: 'active',
      r4: 'active',
    });
  });

  console.log(`\n全部 ${passed} 个测试通过 ✅`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('\n❌ 测试失败：');
    console.error(error);
    process.exit(1);
  },
);
