# apps/api

MiniApp 当前唯一后端基线，技术栈为 **NestJS + Prisma + MySQL**。

## 当前定位

- `apps/api` 承接当前小程序所有后端接口。
- 旧 `apps/server` / SQLite 不再作为当前联调、验收或发布主线。
- 前端默认通过 `apps/weapp` 调用 `apps/api`。

## 核心能力

- 健康检查：`GET /health`
- 微信登录与会话：`POST /api/v1/auth/wechat-login`、`GET /api/v1/auth/me`、`POST /api/v1/auth/logout`
- 返图库：`GET /api/v1/gallery`
- 店员返图上传与管理：`POST /api/v1/staff/uploads/images`、`GET/POST/PATCH /api/v1/staff/gallery`
- 可预约时段：`GET /api/v1/availability`
- 顾客预约：`POST /api/v1/appointments`、`GET /api/v1/my/appointments`
- 店员规则：`GET/PUT /api/v1/staff/booking-rules`
- 店员预约：`GET /api/v1/staff/appointments`、`GET /api/v1/staff/appointments/:id`
- 店员审核：`POST/PATCH /api/v1/staff/appointments/:id/review`

## 本地启动

### 1. 准备 MySQL

```bash
docker compose -f ../../infra/compose/api-mysql.compose.yml up -d
```

仓库根目录也可以执行：

```bash
docker compose -f infra/compose/api-mysql.compose.yml up -d
```

### 2. 准备环境变量

`apps/api/.env` 至少需要：

```env
PORT=3100
DATABASE_URL="mysql://miniapp:miniapp@127.0.0.1:3307/miniapp_api"
STAFF_OPEN_IDS="staff-openid-demo"
ALLOW_OPENID_HEADER_AUTH=1
ALLOW_DEMO_STAFF_OPENID=1
```

体验版 / 正式版还需要：

```env
NODE_ENV=production
WECHAT_APP_ID="小程序 AppID"
WECHAT_APP_SECRET="小程序 AppSecret"
STAFF_OPEN_IDS="真实店员 openid"
PUBLIC_BASE_URL="https://你的 API 域名"
ALLOW_OPENID_HEADER_AUTH=0
ALLOW_DEMO_STAFF_OPENID=0
```

### 3. 生成 Prisma Client 与迁移

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

### 4. 启动

```bash
npm run start:dev
```

默认监听：`http://127.0.0.1:3100`

## 验证

```bash
npm run build
npm run test
```

`npm run test` 会执行运行级 smoke，要求 MySQL 与 API 服务可访问。

仓库根目录可执行：

```bash
npm run build:api
npm run test:api
```

## 数据模型重点

- `AuthSession`：只保存 session token hash，不保存明文 token。
- `Appointment.approvedSlotKey`：仅在 `approved` 预约上写入 `${date}#${timeSlot}`，通过数据库唯一约束兜底单员工同一时段最多通过一单。
- `GalleryItem`：支持封面、多图、标签、说明、发布时间与状态。
- `BookingRule`：承载开放天数、闭店日期和每日时段。

## 上传策略

当前体验版默认使用 API 服务本地 `uploads/gallery` 目录，并通过 `/api/v1/staff/uploads/images/:filename` 访问。

正式商用前建议迁到对象存储，或至少确保该目录挂载持久化云盘并纳入备份策略。
