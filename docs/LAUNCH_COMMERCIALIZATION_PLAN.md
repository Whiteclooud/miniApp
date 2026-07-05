# 小程序体验版到商用上线计划

## Summary

当前项目已具备单店单员工美甲预约 V1 主体能力：顾客返图浏览、月历选期、提交预约、我的预约回查；店员规则配置、返图管理、预约审核与改判。技术主线是原生微信小程序 `apps/weapp` + NestJS/Prisma/MySQL `apps/api`。

本轮目标收敛为：

- 先发布体验版，范围只做预约闭环。
- 暂不接微信支付、订阅消息、会员、优惠券、多员工排班。
- 上线身份切到微信登录 + 服务端 session。
- 开发 mock OpenID 仅保留在 develop 环境。

## Git And Rollback

实施分支：`feat/launch-readiness`

开始实施前已建立双重回滚保护：

- 原始 HEAD：`89f2d7480ae45990e553ecc0f5910952a48b0947`
- 备份分支：`backup/pre-launch-readiness-20260705-225542`
- 原始脏工作区 stash：`stash@{0}`，消息为 `rollback snapshot before launch-readiness 20260705-225542`

如需回到开始实施前状态：

```bash
git switch main
git reset --hard 89f2d7480ae45990e553ecc0f5910952a48b0947
git stash apply stash@{0}
```

注意：`git reset --hard` 会丢弃当前分支工作区改动，仅在确认需要回滚时使用。

## P0: 体验版前必须收口

- 统一环境配置：小程序 API profile 拆成 `develop / trial / release` 三档；`develop` 可用本地或局域网，`trial / release` 固定 HTTPS 域名，并开启微信登录。
- 完成生产登录闭环：正式使用 `wx.login -> code2Session -> AuthSession`；所有顾客/店员请求优先使用 `Authorization: Bearer <token>`。
- 保留但隔离开发 OpenID header：`X-Customer-OpenId` / `X-Staff-OpenId` 只允许 develop 环境使用；体验版和正式版默认禁用。
- 修正店员权限：Bearer session 命中 staff 时，仍需用当前 `STAFF_OPEN_IDS` 白名单复核，防止店员被移除后旧 session 继续可用。
- 增加 `POST /api/v1/auth/logout`：删除当前 token 对应 session；前端清空本地 session。
- 更新文档漂移：同步 `apps/api/README.md`、`docs/ENV.md`、`docs/MYSQL_SETUP.md`，删除旧 `apps/server` / SQLite / 3000 端口作为当前主线的表述。
- 修复小程序发布配置：体验版前关闭调试型配置残留，确认真实 AppID、合法 request/uploadFile 域名、HTTPS 证书、上传 source map 策略。

## P1: 数据与安全加固

- 给预约时段加数据库级兜底：在 `Appointment` 增加 `approvedSlotKey` 可空唯一字段；`approved` 时写入 `${date}#${timeSlot}`，`pending / rejected` 为空。并发审核冲突统一返回 `409 + SLOT_OCCUPIED`。
- 上传安全收口：限制图片 MIME、后缀、单文件大小、单次数量；拒绝非图片和超限文件，补 `UPLOAD_TOO_LARGE` / `UNSUPPORTED_IMAGE_TYPE` 等错误码。
- 上传存储策略：体验版使用服务端持久化 volume；正式商用前迁到对象存储或至少配置云盘快照与备份，避免容器重建丢图。
- 后端输入校验补齐：预约日期、手机号、返图标题/标签/图片数组、规则时间段重叠等在 service 层统一校验。
- 增加 session 维护：过期 session 清理脚本或启动清理；token 只存 hash；生产环境配置 `SESSION_EXPIRES_DAYS`。

## P2: 体验版 UAT 与运营能力

- 按 `docs/UAT_GUIDE.md` 执行 8 条主链路：返图首页、全部列表、详情多图、月历预约、我的预约、店员返图管理、审核改判、顾客回查。
- 补真实体验数据：至少 3 条返图、2 组不同日期/时段规则、1 条 pending、1 条 approved、1 条 rejected，确保页面不是空态演示。
- 优化异常反馈：登录失败、无店员权限、上传失败、时段冲突、网络失败都给用户可理解文案。
- 店员入口收口：不进入常规 tab；普通顾客误入 staff 页面时只显示无权限提示和返回首页。
- 保持范围外：微信支付、订阅消息、会员、优惠券、多员工排班本轮不做。

## P3: 部署与发布

- 新增生产部署手册：包含 MySQL 8、API 容器、上传目录/对象存储、环境变量、迁移、回滚、备份。
- 建立最小 CI：执行 `npm run build:api`、`npm run check:docs`、`npm run check:weapp-contract`、Prisma schema 校验；有 MySQL service 时跑 `npm run test:api`。
- 体验版发布门槛：HTTPS API 可访问、微信合法域名配置完成、`WECHAT_APP_ID / WECHAT_APP_SECRET` 可用、店员 OpenID 已配置、UAT 全通过。
- 正式版发布门槛：体验版运行稳定、备份与恢复演练通过、图片存储不依赖临时容器目录、隐私与用户数据说明补齐。

## Public API / Interface Changes

- 新增 `POST /api/v1/auth/logout`，Header 使用 `Authorization: Bearer <token>`，成功返回 `{ "ok": true }`。
- 固化已有 `POST /api/v1/auth/wechat-login`：入参 `{ "code": "..." }`，返回 `{ token, expiresAt, user: { id, openId, role } }`。
- 固化已有 `GET /api/v1/auth/me`：Bearer token 返回当前用户。
- 现有顾客/店员接口改为 Bearer 优先；OpenID header 仅作为 `develop` 兼容路径。
- `Appointment` 数据模型新增 `approvedSlotKey?: string`，仅用于数据库唯一约束，不暴露给小程序页面。

## Test Plan

- 静态/契约：`npm run build:api`、`npm run check:docs`、`npm run check:weapp-contract` 必须全部通过。
- API smoke：启动 MySQL + API 后执行 `npm run test:api`，覆盖 availability、booking rules、gallery、create appointment、review 改判。
- 新增测试：微信登录失败、session 过期、logout、非 staff Bearer 访问 staff 接口、并发审核同一时段、上传非法文件/超大文件。
- 页面 UAT：在微信开发者工具和真机体验版各跑一次 UAT 8 条链路，并回填 `docs/UAT_RESULTS.md`。
- 发布验证：Network 面板确认不再访问旧接口，不再依赖 mock OpenID，不再请求局域网 API。

## Assumptions

- 第一版体验版只做预约闭环，不接支付和订阅消息。
- 体验版按真机可访问处理，因此 API 需要 HTTPS 公网域名，不能依赖 `127.0.0.1` 或局域网地址。
- 当前单店单员工模型保持不变；多员工、多门店、排班、报表作为后续版本。
- 当前未提交的 auth/session 相关改动视为继续完善的基础，不回退。
