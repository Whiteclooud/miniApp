# ENV

## 当前主线

- 前端：`apps/weapp`
- 后端：`apps/api`
- 数据库：MySQL 8
- 本地默认 API：`http://127.0.0.1:3100`
- 本地默认 MySQL：`127.0.0.1:3307/miniapp_api`

旧 `apps/server` / SQLite 已不再作为当前开发、联调或验收主线。

## 小程序侧配置

体验版 / 正式版发布前需要确认：

- 微信小程序真实 `AppID`
- 合法 request 域名
- 合法 uploadFile / downloadFile 域名
- HTTPS 证书有效
- 微信登录可用，服务端配置了 `WECHAT_APP_ID` 与 `WECHAT_APP_SECRET`
- `apps/weapp/utils/api-profile.js` 中 `trial / release` 的 HTTPS API 域名已替换为真实域名

### develop

- 默认 API：`http://127.0.0.1:3100`
- `enableWechatAuth=false`
- `allowHeaderAuthFallback=true`
- 可继续使用 `customer-openid-demo` / `staff-openid-demo` 做本地联调

微信开发者工具中联调本地接口时，需要勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。

### trial / release

- 必须使用 HTTPS API 域名
- `enableWechatAuth=true`
- `allowHeaderAuthFallback=false`
- 不允许依赖 `X-Customer-OpenId` / `X-Staff-OpenId` mock header
- 所有顾客 / 店员接口优先使用 `Authorization: Bearer <token>`

## 服务端环境变量

### 必填

```env
PORT=3100
DATABASE_URL="mysql://miniapp:miniapp@127.0.0.1:3307/miniapp_api"
WECHAT_APP_ID="小程序 AppID"
WECHAT_APP_SECRET="小程序 AppSecret"
SYSTEM_ADMIN_OPEN_IDS="系统管理员 OpenID，多个用英文逗号分隔"
OWNER_OPEN_IDS="首位店主 OpenID，多个用英文逗号分隔"
PUBLIC_BASE_URL="https://你的 API 域名"
```

### 可选

```env
NODE_ENV=development
SESSION_EXPIRES_DAYS=30
ALLOW_OPENID_HEADER_AUTH=1
ALLOW_DEMO_STAFF_OPENID=1
STAFF_OPEN_IDS="旧版店员 OpenID，仅用于兼容迁移为店主"
UPLOAD_MAX_FILES=6
UPLOAD_MAX_FILE_SIZE_BYTES=5242880
```

变量说明：

- `NODE_ENV=production` 时，OpenID header fallback 和 demo staff 默认关闭。
- `ALLOW_OPENID_HEADER_AUTH=1` 仅建议用于本地 develop；体验版 / 正式版不要开启。
- `ALLOW_DEMO_STAFF_OPENID=1` 仅建议用于本地 UAT。
- `SYSTEM_ADMIN_OPEN_IDS` 只用于可信的系统管理员首次引导，客户端不能申请该角色。
- `OWNER_OPEN_IDS` 只用于首位店主引导；后续店员通过店主创建的一次性邀请加入。
- `STAFF_OPEN_IDS` 是旧部署兼容项，登录时按店主迁入数据库，不再作为运行时权限源。
- `PUBLIC_BASE_URL` 用于生成上传图片 URL，体验版 / 正式版必须是 HTTPS 域名。
- `UPLOAD_MAX_FILE_SIZE_BYTES` 默认 5MB。

## 本地启动

### 1. 启动 MySQL

```bash
docker compose -f infra/compose/api-mysql.compose.yml up -d
```

### 2. 生成 Prisma Client 并应用迁移

```bash
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run prisma:migrate:deploy
```

### 3. 启动 API

```bash
npm run dev:api
```

### 4. 验证

```bash
npm run build:api
npm run check:docs
npm run check:weapp-contract
npm run test:api
```

`npm run test:api` 需要 MySQL 与 API 服务可访问。

## 发布前提醒

- 单台服务器的 Docker Compose 部署和 HTTPS 反向代理步骤见 `docs/DEPLOYMENT_RUNBOOK.md`。
- 生产镜像基于 `node:22-alpine` 并安装 Prisma 所需的 OpenSSL；部署前应先在服务器执行一次完整的 migration、健康检查和图片访问验证。

- 体验版前必须确认 `trial / release` 不再请求局域网或 `127.0.0.1`。
- 生产密钥只放环境变量，不写入仓库。
- 上传图片目录需要持久化；正式商用前建议迁到对象存储或至少挂载云盘并配置备份。
- 首次发布前必须配置 `SYSTEM_ADMIN_OPEN_IDS` 和至少一位 `OWNER_OPEN_IDS`。
- 执行 `prisma:migrate:deploy` 后，确认旧 `STAFF` 用户已迁入 `staff_members` 且角色为 `OWNER`。
- 店主创建店员邀请、店员兑换、移除后即时失权、最后一位店主保护必须完成真机 UAT。
