# apps/api

这是 MiniApp 项目的新后端并行骨架，目标技术栈为 **NestJS + Prisma + MySQL**。

## 当前定位

- `apps/server`：当前已通过 UAT 的旧运行基线，继续保留，作为回滚入口。
- `apps/api`：新后端并行骨架，只承载 Phase 0/1 首轮落地，不直接承接现网流量。

当前原则：
1. 不改动 `apps/server/**`
2. 不回改当前冻结 API 契约
3. 新旧后端并行存在，后续通过端口 / env / 启动脚本切换

## 当前已落地内容

- NestJS 基础启动结构
- `GET /health` 健康检查模块
- Prisma module / service
- Prisma v1 schema
- MySQL 初始 migration 基线

## Prisma v1 模型覆盖

### users
- `openId`
- `role`
- `displayName`
- `phone`
- `status`
- `createdAt`
- `updatedAt`

### appointments
- `customerOpenId`
- `customerName`
- `phone`
- `date`
- `timeSlot`
- `note`
- `status`
- `createdAt`
- `reviewedAt`
- `reviewedByOpenId`
- `reviewNote`

### booking_rules
- `advanceOpenDays`
- `closedDatesJson`
- `dailySlotsJson`
- `updatedAt`

### gallery_items
- `title`
- `imageUrl`
- `imageUrlsJson`
- `tagsJson`
- `sortOrder`
- `status`

## 字段映射说明

- 旧 `apps/server` 中的 `customer_open_id` -> 新模型 `customerOpenId`
- 旧 `date` / `time_slot` -> 新模型 `date` / `timeSlot`
- 旧 `closed_dates_json` / `daily_slots_json` -> 新模型 `closedDatesJson` / `dailySlotsJson`
- 旧 `image_urls_json` / `tags_json` -> 新模型 `imageUrlsJson` / `tagsJson`

## 当前残余风险

1. 当前只落了 `/health` 与 Prisma 基线，冻结契约主业务路由尚未迁入 NestJS。
2. `approved-only` 时段唯一约束当前仍保留在旧服务语义中；新服务需在后续 phase 里补 service-level 校验与数据库约束方案。
3. `closedDates` / `dailySlots` / `imageUrls` / `tags` 当前仍采用 JSON 字符串落库，后续若查询复杂度提升再考虑拆表。
4. 本轮默认目标库为 MySQL，但未在本次提交里补 Docker / compose；该部分由 `DEV-001` 继续推进。

## 下一步建议

1. 安装 `apps/api` 依赖并执行 `prisma generate` / `prisma migrate deploy`
2. 以 `health -> gallery -> booking-rules -> appointments -> staff` 顺序迁主路由
3. 在不破坏旧基线的前提下，为新旧服务补兼容断言与切换手册
