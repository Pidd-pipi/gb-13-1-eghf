import 'reflect-metadata';
import assert from 'assert';
import express from 'express';
import jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import initSqlJs from 'sql.js';
import { entities, Book, PurchaseRequest, User } from '../src/entities';
import { setDataSourceOverride } from '../src/services/db';
import { config } from '../src/config';
import apiRoutes from '../src/routes';

let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const token = (userId: string) => jwt.sign({ userId }, config.jwt.secret, { expiresIn: '1h' });

async function main() {
  // 内存数据库
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

  // 造数据：卖家甲 b1/b2（同校区同课程同版次），买家 X、Y 各一张求购单
  const userRepo = dataSource.getRepository(User);
  const mkUser = async (id: string) => {
    const u = new User();
    u.id = id;
    u.studentId = `S-${id}`;
    u.email = `${id}@e.com`;
    u.password = 'x';
    u.name = id;
    await userRepo.save(u);
  };
  await Promise.all([mkUser('u-a'), mkUser('u-x'), mkUser('u-y')]);

  const bookRepo = dataSource.getRepository(Book);
  for (const [id, price] of [
    ['b1', 20],
    ['b2', 25],
  ] as const) {
    const b = new Book();
    b.id = id;
    b.title = '线性代数';
    b.author = '同济';
    b.isbn = null as any;
    b.originalPrice = 40;
    b.price = price as any;
    b.condition = 'like_new';
    b.images = ['http://img/x.jpg'];
    b.tradeMethod = 'meetup';
    b.campus = '西校区';
    b.courseCode = 'MA202';
    b.edition = '第4版';
    b.category = 'science';
    b.description = null as any;
    b.status = 'available';
    b.sellerId = 'u-a';
    await bookRepo.save(b);
  }

  const prRepo = dataSource.getRepository(PurchaseRequest);
  for (const [id, buyer] of [
    ['r1', 'u-x'],
    ['r2', 'u-y'],
  ] as const) {
    const r = new PurchaseRequest();
    r.id = id;
    r.bookTitle = '线性代数';
    r.author = null as any;
    r.isbn = null as any;
    r.expectedPrice = null as any;
    r.conditions = null as any;
    r.description = null as any;
    r.category = 'science';
    r.campus = '西校区';
    r.courseCode = 'MA202';
    r.edition = '第4版';
    r.status = 'active';
    r.requesterId = buyer;
    await prRepo.save(r);
  }

  // 启动真实 Express（不依赖 MySQL/Redis/MinIO，服务层已注入内存库）
  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api`;

  const call = async (method: string, path: string, userId?: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, json };
  };

  // ---------- 列表剩余候选数 ----------
  await test('GET /purchase-requests 每张求购单带 candidateCount=2', async () => {
    const { status, json } = await call('GET', '/purchase-requests', 'u-x');
    assert.strictEqual(status, 200);
    assert.strictEqual(json.requests.length, 2);
    for (const r of json.requests) assert.strictEqual(r.candidateCount, 2);
  });

  await test('GET /books 每本书带 matchingRequestCount=2', async () => {
    const { status, json } = await call('GET', '/books', 'u-a');
    assert.strictEqual(status, 200);
    assert.strictEqual(json.books.length, 2);
    for (const b of json.books) assert.strictEqual(b.matchingRequestCount, 2);
  });

  // ---------- 详情页匹配原因 ----------
  await test('GET /purchase-requests/:id 返回候选书与逐条匹配原因', async () => {
    const { status, json } = await call('GET', '/purchase-requests/r1', 'u-x');
    assert.strictEqual(status, 200);
    assert.strictEqual(json.candidateCount, 2);
    assert.deepStrictEqual(
      json.candidates.map((c: any) => c.id),
      ['b1', 'b2'],
    );
    const reasons = json.candidates[0].reasons.join('|');
    assert.match(reasons, /西校区/);
    assert.match(reasons, /MA202/);
    assert.match(reasons, /第4版/);
  });

  await test('GET /books/:id 返回匹配求购单与原因（刷新后一致的来源）', async () => {
    const { status, json } = await call('GET', '/books/b1', 'u-x');
    assert.strictEqual(status, 200);
    assert.strictEqual(json.matchingRequestCount, 2);
    assert.ok(json.matchingRequests.some((r: any) => r.id === 'r1'));
  });

  // ---------- 选定 / 幂等 ----------
  await test('POST /transactions/select-book 201，书预约、求购单 matched', async () => {
    const { status, json } = await call('POST', '/transactions/select-book', 'u-x', {
      purchaseRequestId: 'r1',
      bookId: 'b1',
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(json.duplicated, false);
    assert.strictEqual(json.transaction.status, 'pending');
  });

  await test('重复 POST 同一选择：200 + duplicated=true，不新增交易', async () => {
    const { status, json } = await call('POST', '/transactions/select-book', 'u-x', {
      purchaseRequestId: 'r1',
      bookId: 'b1',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.duplicated, true);
  });

  await test('预约后刷新：求购单 candidateCount 归 0；b1 退出他人候选池', async () => {
    const list = await call('GET', '/purchase-requests', 'u-x');
    const r1 = list.json.requests.find((r: any) => r.id === 'r1');
    // r1 已 matched，公共列表不再出现
    assert.strictEqual(r1, undefined);
    const mine = await call('GET', '/my/purchase-requests', 'u-x');
    const myR1 = mine.json.find((r: any) => r.id === 'r1');
    assert.strictEqual(myR1.status, 'matched');
    assert.strictEqual(myR1.candidateCount, 0);
    const detail = await call('GET', '/purchase-requests/r1', 'u-x');
    assert.deepStrictEqual(detail.json.candidates, []);
  });

  await test('未登录请求被 401 拦截', async () => {
    const { status } = await call('POST', '/transactions/select-book', undefined, {
      purchaseRequestId: 'r2',
      bookId: 'b2',
    });
    assert.strictEqual(status, 401);
  });

  // ---------- HTTP 并发抢同一本书 ----------
  await test('两个买家并发 POST 抢 b2：恰好一个 201，另一个 409', async () => {
    // X 的 r1 已占用 b1，再为其建一张求购单，与 Y 的 r2 同时抢 b2
    const pr = dataSource.getRepository(PurchaseRequest);
    const extra = new PurchaseRequest();
    extra.id = 'r3';
    extra.bookTitle = '线性代数';
    extra.author = null as any;
    extra.isbn = null as any;
    extra.expectedPrice = null as any;
    extra.conditions = null as any;
    extra.description = null as any;
    extra.category = 'science';
    extra.campus = '西校区';
    extra.courseCode = 'MA202';
    extra.edition = '第4版';
    extra.status = 'active';
    extra.requesterId = 'u-x';
    await pr.save(extra);

    const parallel = await Promise.all([
      call('POST', '/transactions/select-book', 'u-x', { purchaseRequestId: 'r3', bookId: 'b2' }),
      call('POST', '/transactions/select-book', 'u-y', { purchaseRequestId: 'r2', bookId: 'b2' }),
    ]);
    const created = parallel.filter((r) => r.status === 201);
    const conflicts = parallel.filter((r) => r.status === 409);
    assert.strictEqual(created.length, 1, `期望 1 个 201，实际 ${created.length}`);
    assert.strictEqual(conflicts.length, 1, `期望 1 个 409，实际 ${conflicts.length}`);
  });

  // ---------- 拒绝释放，重新匹配 ----------
  await test('卖家拒绝后：b2 重新出现在候选列表，相关求购单恢复 active', async () => {
    const { json: txList } = await call('GET', '/my/transactions?role=seller', 'u-a');
    const txOnB2 = txList.find((t: any) => t.bookId === 'b2' && t.status === 'pending');
    assert.ok(txOnB2, '应存在 b2 的 pending 交易');
    const rejectRes = await call('PUT', `/transactions/${txOnB2.id}/reject`, 'u-a');
    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.json.transaction.status, 'rejected');

    const detail = await call('GET', '/purchase-requests/r2', 'u-y');
    assert.deepStrictEqual(
      detail.json.candidates.map((c: any) => c.id),
      ['b2'],
    );
    assert.strictEqual(detail.json.status, 'active');
  });

  await test('买家取消自己在 b1 的预约：b1 释放，r1 可重新匹配', async () => {
    const { json: txList } = await call('GET', '/my/transactions?role=buyer', 'u-x');
    const txOnB1 = txList.find((t: any) => t.bookId === 'b1' && t.status === 'pending');
    const cancelRes = await call('PUT', `/transactions/${txOnB1.id}/cancel`, 'u-x');
    assert.strictEqual(cancelRes.status, 200);
    const detail = await call('GET', '/purchase-requests/r1', 'u-x');
    assert.deepStrictEqual(
      detail.json.candidates.map((c: any) => c.id),
      ['b1', 'b2'],
    );
  });

  await test('完整成交：接受 → 完成，书籍 sold、求购单 closed', async () => {
    const select = await call('POST', '/transactions/select-book', 'u-y', {
      purchaseRequestId: 'r2',
      bookId: 'b1',
    });
    assert.strictEqual(select.status, 201);
    const txId = select.json.transaction.id;
    assert.strictEqual((await call('PUT', `/transactions/${txId}/accept`, 'u-a')).status, 200);
    const complete = await call('PUT', `/transactions/${txId}/complete`, 'u-a');
    assert.strictEqual(complete.status, 200);
    assert.strictEqual(complete.json.transaction.status, 'completed');

    const book = await dataSource.getRepository(Book).findOneByOrFail({ id: 'b1' });
    assert.strictEqual(book.status, 'sold');
    const req = await dataSource.getRepository(PurchaseRequest).findOneByOrFail({ id: 'r2' });
    assert.strictEqual(req.status, 'closed');
  });

  server.close();
  console.log(`\n全部 ${passed} 个 API 测试通过 ✅`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('\n❌ API 测试失败：');
    console.error(error);
    process.exit(1);
  },
);
