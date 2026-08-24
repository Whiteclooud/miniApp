# apps/api

MiniApp 当前唯一后端基线，技术栈为 **NestJS + Prisma + MySQL**。

## 当前定位

- `apps/api` 承接当前小程序所有后端接口。
- 旧 `apps/server` / SQLite 不再作为当前联调、验收或发布主线。
- 前端默认通过 `apps/weapp` 调用 `apps/api`。

## 核心能力

- 健康检查：`GET /health`
- 微信登录与会话：`POST /api/v1/auth/wechat-login`、`GET /api/v1/auth/me`、`POST /api/v1/auth/logout`
- 返图库：`GET /api/v1/gallery`、`GET /api/v1/gallery/:id`
- 顾客“我的灵感”：`GET/POST /api/v1/my/inspirations`、`GET/PATCH/DELETE /api/v1/my/inspirations/:id`
- 店员返图上传与管理：`POST /api/v1/staff/uploads/images`、`GET/POST/PATCH/DELETE /api/v1/staff/gallery`
- 顾客预约参考图：`POST /api/v1/uploads/images`、`GET/DELETE /api/v1/uploads/images/:filename`
- 可预约时段：`GET /api/v1/availability`
- 顾客预约：`POST /api/v1/appointments`、`GET /api/v1/my/appointments`
- 店员规则：`GET/PUT /api/v1/staff/booking-rules`
- 店员预约工作台：`GET /api/v1/staff/appointments`、`GET /api/v1/staff/appointments/:id`
- 店员审核 / 改期：`POST/PATCH /api/v1/staff/appointments/:id/review`、`PATCH /api/v1/staff/appointments/:id/reschedule`
- 店员操作日志：`GET /api/v1/staff/appointments/:id/audit-logs`
- 成员与邀请：`GET/DELETE /api/v1/staff/members`、`GET/POST/DELETE /api/v1/staff/invitations`、`POST /api/v1/staff/invitations/redeem`

## 本地启动

启动微信开发者工具前，先保持 API 进程运行；若控制台出现
`net::ERR_CONNECTION_REFUSED`，优先检查 `http://127.0.0.1:3100/health`
是否可访问。

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
SYSTEM_ADMIN_OPEN_IDS="系统管理员 OpenID"
OWNER_OPEN_IDS="首位店主 OpenID"
PUBLIC_BASE_URL="https://你的 API 域名"
ALLOW_OPENID_HEADER_AUTH=0
ALLOW_DEMO_STAFF_OPENID=0
```

### 3. 生成 Prisma Client 与迁移

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

需要初始化 Figma 返图样例时执行（固定 ID 幂等 upsert，不删除已有返图）：

```bash
npm run seed:gallery
```

### 4. 启动

```bash
npm run start:dev
```

默认监听：`http://127.0.0.1:3100`

## 体验版部署

单台云服务器的 Docker Compose 部署文件为
`infra/compose/api-production.compose.yml`，完整步骤见仓库根目录的
`docs/DEPLOYMENT_RUNBOOK.md`。生产容器通过环境变量读取配置，不把 `.env` 打入镜像；
MySQL 只加入 Docker 内网，上传目录必须挂载持久化卷。

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
- Bearer 会话按当前用户的 `roles/permissions` 动态授权；所有 ACTIVE 用户都可使用顾客资源，`staff`、`owner`、`system_admin` 在此基础上叠加店员权限。
- `staff_members` 保存店员/店主成员关系，`staff_invitations` 保存一次性邀请码哈希；成员移除后旧 session 立即失去店员权限。
- `Appointment.approvedSlotKey`：仅在 `approved` 预约上写入 `${date}#${timeSlot}`，通过数据库唯一约束兜底单员工同一时段最多通过一单。
- `Appointment.referenceImageUrlsJson`：保存最多 6 个预约参考图 URL；API 统一映射为 `referenceImageUrls: string[]`。
- `GalleryItem`：支持封面、多图、标签、说明、发布时间与状态。
- `CustomerInspiration`：按顾客 OpenID 保存公共返图关系，可维护个人备注；同一顾客与返图唯一，顾客不直接修改 `GalleryItem`。
- `BookingRule`：承载开放天数、闭店日期、每日时段、每周营业日、当天截止、最小提前小时和特殊日期时段覆盖。

## 上传策略

当前体验版默认使用 API 服务本地 `uploads/gallery` 目录。店员返图通过 `/api/v1/staff/uploads/images/:filename` 访问，顾客预约参考图通过 `/api/v1/uploads/images/:filename` 访问。

Bearer session 每次访问都会复核用户状态与当前角色。账号整体停用后，旧 token 不再获得顾客或店员业务权限；仅停用 `staff_members` 成员关系时，旧 token 会立即失去店员权限，但仍保留顾客能力。已提供 Bearer token 时不会回退到 `X-Customer-OpenId` / `X-Staff-OpenId`；这两个 header 仅在 develop 且未提供 Bearer 时作为兼容兜底。

顾客上传文件带有当前 OpenID 的单向散列归属前缀，`DELETE /api/v1/uploads/images/:filename` 只允许本人删除；店员返图库图片不会被该接口删除。

正式商用前应迁到对象存储，或至少把容器 `/app/uploads` 挂载到持久化云盘并纳入备份策略。仅使用容器可写层会导致容器重建后预约记录中的图片 URL 失效。部署完成后还需执行 `npm run seed:gallery`，把仓库内 Figma 样例写入数据库和当前持久化上传目录。
