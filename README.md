# 校园二手书交易平台

面向高校学生的校园二手书交易平台，支持书籍发布、搜索、求购、消息沟通、交易评价等完整功能。

## 快速启动

### Docker Compose 一键部署（推荐）

```bash
# 1. 复制环境变量配置
cp .env.example .env

# 2. 启动全部服务
docker compose up -d

# 3. 查看服务状态
docker compose ps
```

### 本地开发

```bash
# 后端
cd backend
npm install
npm run dev

# 前端（新终端）
cd frontend
npm install
npm run dev
```

## 访问地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:8011 |
| 后端 API | http://localhost:3011 |
| MinIO 控制台 | http://localhost:9008 |
| MySQL | localhost:3404 |
| Redis | localhost:6411 |

## 主要功能

### 用户系统
- 学号 + 学校邮箱注册，邮箱验证码验证
- JWT 登录认证
- 个人信息完善（姓名、院系、联系方式、头像）
- 好评率统计与风险提示

### 书籍交易
- 发布闲置书籍（书名、作者、ISBN、**课程代码、版次**、价格、新旧程度、图片等）
- 按书名/作者/ISBN搜索，支持全文索引
- 按学科分类（理工、文史、经管、艺术等）筛选
- 按价格区间、新旧程度筛选
- 按价格、发布时间排序
- 书籍状态管理（可购买/已预约/已售出）

### 教材同版匹配与交易闭环
- 发布书籍与求购单时都需填写**课程代码**与**版次**
- 求购单仅匹配**同校区、同课程代码、同版次且可购买**的书
- 求购列表与书籍列表实时显示**剩余候选数**（求购单候选书数 / 书籍对应求购数）
- 求购单详情列出候选书籍，并逐条展示**匹配原因**（校区/课程代码/版次命中情况）
- 买家选定书籍后书籍自动**预约**并生成**交易记录**（交易价格快照）
- **并发安全**：重复选择幂等返回；并发抢同一本书只有一笔成功（条件更新 + 数据库唯一索引双重保障）
- 卖家**拒绝**或买家**取消**后书籍自动释放为可购买，其他求购单可重新匹配
- 交易完成后书籍标记为已售出；刷新页面后状态始终一致

### 求购系统
- 发布求购需求（书名、课程代码、版次、期望价、新旧要求等）
- 按学科分类浏览，显示同版剩余候选数
- 求购单详情查看可购买的同版书籍并一键预约
- 卖家主动联系买家

### 消息系统
- 平台内置消息功能
- 支持文字和图片消息
- 消息阅读状态

### 评价系统
- 交易完成后互相评价
- 好评/中评/差评 + 文字评价
- 用户主页展示好评率和历史评价
- 好评率低于 60% 标记风险提示

### 个性化功能
- 书籍收藏
- 浏览历史记录
- 同院系书籍推荐

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3 + TypeScript |
| 前端 UI | Vant 4 |
| 前端构建 | Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| 后端框架 | Node.js + Express |
| 数据库 | MySQL 8.0 |
| ORM | TypeORM |
| 缓存 | Redis |
| 文件存储 | MinIO |
| 认证 | JWT + 邮箱验证码 |
| 部署 | Docker Compose |
| Web 服务器 | Nginx |

## 项目目录结构

```
校园二手书交易平台/
├── backend/                    # 后端项目
│   ├── src/
│   │   ├── config/             # 配置文件
│   │   ├── controllers/        # 控制器
│   │   ├── entities/           # 数据实体（User/Book/PurchaseRequest/Trade 等）
│   │   ├── middlewares/        # 中间件
│   │   ├── routes/             # 路由
│   │   ├── services/           # 服务层（教材匹配、交易并发控制、Redis、MinIO）
│   │   └── index.ts            # 入口文件
│   ├── seed-test.ts            # 集成测试种子数据脚本
│   ├── integration-test.sh     # 教材同版匹配闭环端到端测试
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # 前端项目
│   ├── src/
│   │   ├── api/                # API 请求封装
│   │   ├── components/         # 公共组件
│   │   ├── pages/              # 页面组件
│   │   ├── router/             # 路由配置
│   │   ├── store/              # Pinia 状态管理
│   │   ├── styles/             # 样式文件
│   │   ├── types/              # 类型定义
│   │   ├── App.vue
│   │   └── main.ts
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── database/                   # 数据库脚本
│   └── init.sql
├── docker-compose.yml
├── .env.example
└── README.md
```

## 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| MYSQL_ROOT_PASSWORD | MySQL root 密码 | root_password_123 |
| MYSQL_DATABASE | 数据库名 | campus_bookstore |
| MYSQL_USER | 数据库用户名 | campus_user |
| MYSQL_PASSWORD | 数据库密码 | campus_password_123 |
| REDIS_PASSWORD | Redis 密码 | redis_password_123 |
| MINIO_ROOT_USER | MinIO 管理员账号 | minioadmin |
| MINIO_ROOT_PASSWORD | MinIO 管理员密码 | minioadmin123 |
| MINIO_BUCKET | 存储桶名称 | books |
| JWT_SECRET | JWT 密钥 | 请修改 |
| JWT_EXPIRES_IN | JWT 过期时间 | 7d |
| SMTP_HOST | SMTP 服务器地址 | smtp.example.com |
| SMTP_PORT | SMTP 端口 | 587 |
| SMTP_USER | SMTP 用户名 | your_email@example.com |
| SMTP_PASSWORD | SMTP 密码 | your_email_password |
| SMTP_FROM | 发件人邮箱 | noreply@campus-bookstore.com |

## Docker 部署说明

### 端口映射

```yaml
frontend: 8011 → 80
backend:  3011 → 3000
mysql:    3404 → 3306
redis:    6411 → 6379
minio:    9007 → 9000 (API)
          9008 → 9001 (控制台)
```

### 数据持久化

- MySQL 数据：`campus_bookstore_mysql_data` 命名卷
- Redis 数据：`campus_bookstore_redis_data` 命名卷
- MinIO 文件：`campus_bookstore_minio_data` 命名卷

### 服务依赖

- backend 服务依赖 mysql、redis、minio 的 healthcheck 通过后才启动
- frontend 服务反向代理 backend 服务（通过 Docker 内部网络）

### 常用命令

```bash
# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f backend
docker compose logs -f frontend

# 停止服务
docker compose down

# 停止服务并删除数据卷（慎用）
docker compose down -v

# 重新构建镜像
docker compose build --no-cache
docker compose up -d
```

## 教材同版匹配关键接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/books` | 发布书籍（必填 `courseCode`、`edition`） |
| POST | `/api/purchase-requests` | 发布求购（必填 `courseCode`、`edition`） |
| GET | `/api/purchase-requests` | 求购列表，每条带 `candidateCount` 剩余候选数 |
| GET | `/api/purchase-requests/:id` | 求购详情：候选书 `candidateBooks`、进行中交易 `pendingTrade` |
| POST | `/api/purchase-requests/:id/select` | 买家选定一本书 → 预约并生成交易（body: `bookId`） |
| GET | `/api/books/:id?requestId=` | 书籍详情，附 `matchReason` 匹配原因与 `matchedRequestCount` |
| GET | `/api/my/trades?role=buyer|seller` | 我的交易列表 |
| POST | `/api/trades/:id/reject` | 卖家拒绝，释放书籍 |
| POST | `/api/trades/:id/cancel` | 买家取消，释放书籍 |
| POST | `/api/trades/:id/complete` | 完成交易，书籍置为已售出 |

### 并发一致性如何保证

- 选定书籍在单个数据库事务内执行条件更新 `UPDATE books SET status='reserved' WHERE id=? AND status='available'`，InnoDB 行锁保证并发下仅一个请求影响 1 行。
- `trades` 表上有一个仅对进行中(pending)交易生效的虚拟生成列唯一索引 `pendingBookId`，作为数据库级兜底，确保同一本书任意时刻至多一笔进行中交易。
- 交易结束（拒绝/取消）后该唯一值变为 NULL（MySQL 唯一索引允许多个 NULL），书籍恢复 `available`，可被其他求购单重新匹配；历史交易记录保留可追溯。

### 端到端集成测试

后端内置了一个针对“教材同版匹配闭环”的端到端脚本（候选数、匹配原因、硬性匹配校验、并发抢占、幂等、拒绝/取消释放、重新匹配、完成售出、刷新一致性等 90 项断言）：

```bash
# 1) 准备一个可连通的 MySQL，并配置好后端环境变量（MYSQL_HOST 等）
# 2) 初始化种子数据（买家/卖家/同版与不同版书籍与求购单）
cd backend
npx ts-node --transpile-only seed-test.ts

# 3) 启动后端
npm run dev

# 4) 另开终端运行测试
./integration-test.sh
```

## 常见问题

### 1. MinIO 上传失败

确保 MinIO 桶已创建且权限正确。首次启动时会自动创建桶并设置公开读取权限。

### 2. 邮箱验证码收不到

检查 SMTP 配置是否正确。开发环境可查看后端日志，验证码会通过 mock 方式显示在控制台。

### 3. 数据库连接失败

等待 MySQL 健康检查通过（约 30-60 秒）。查看状态：

```bash
docker compose ps
```

### 4. 前端无法访问后端 API

确保所有服务都在 `campus_bookstore_network` 网络中，且 nginx.conf 中的 `proxy_pass` 指向正确的服务名。

## License

MIT License
