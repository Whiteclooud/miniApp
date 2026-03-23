# API Parallel Runbook

## 目标

本文件用于说明 `apps/server` 与 `apps/api` 在 Phase 0/1 的并行运行方式，以及本地 MySQL / Docker 环境、切换策略与回滚路径。

如需单独查看 MySQL 版本、Docker 启动方式、本机直装步骤与最小验收清单，优先参考：`docs/MYSQL_SETUP.md`。

如需查看前端后续切到 `apps/api` 前的最小门槛、验证顺序与回滚触发条件，参考：`docs/API_CUTOVER_CHECKLIST.md`。

当前原则：
- `apps/server` 继续作为已通过 UAT 的稳定基线
- `apps/api` 只作为新后端并行演进骨架，不直接替代旧服务
- 在完整业务路由迁移前，前端默认仍指向 `apps/server`

---

## 1. 当前并行关系

### 旧基线：`apps/server`
- 技术栈：Node.js + SQLite
- 默认端口：`3000`
- 启动命令：`npm run dev:server`
- 作用：当前回滚基线 / 当前业务可运行基线

### 新骨架：`apps/api`
- 技术栈：NestJS + Prisma + MySQL
- 默认端口：`3100`
- 启动命令：`npm run dev:api`
- 当前已落库能力：Nest skeleton + `/health` + Prisma v1 schema + `gallery` / `staff booking-rules` / `my appointments` / `staff appointments list` / `staff appointment detail` / `staff appointment review`

---

## 2. 本地 MySQL / Docker 方案

### Compose 文件
- 路径：`infra/compose/api-mysql.compose.yml`
- 当前只启动 MySQL，不强制把 `apps/api` 也塞进容器，避免在业务路由尚未迁完时增加额外复杂度。

### 启动步骤
在仓库根目录执行：

```bash
docker compose -f infra/compose/api-mysql.compose.yml up -d
```

### 当前端口约定
- MySQL 映射端口：`3307`
- `apps/api` 默认访问：`mysql://miniapp:miniapp@127.0.0.1:3307/miniapp_api`

---

## 3. `apps/api` 本地运行步骤

### 3.1 准备环境变量

复制：

```bash
cp apps/api/.env.example apps/api/.env
```

默认推荐值：

```env
PORT=3100
DATABASE_URL="mysql://miniapp:miniapp@127.0.0.1:3307/miniapp_api"
```

### 3.2 安装与生成

```bash
cd apps/api
npm install
npm run prisma:generate
```

### 3.3 应用 migration

```bash
npm run prisma:migrate:deploy
```

### 3.4 启动新 API

```bash
npm run start:dev
```

### 3.5 最小验证

按下面顺序做最小 smoke test：

1. `GET http://127.0.0.1:3100/health`
   - 预期：返回 `ok=true` 与 `service=miniapp-api`
2. `GET /api/v1/gallery`
   - 预期：返回 `{ items: [...] }`，仅包含冻结契约字段
3. `GET /api/v1/staff/booking-rules`（带 `X-Staff-OpenId: staff-openid-demo`）
   - 预期：返回 `{ item: { advanceOpenDays, closedDates, dailySlots, updatedAt } }`
4. `GET /api/v1/my/appointments`（带 `X-Customer-OpenId`）
   - 预期：返回 `{ items: [...] }`
5. `GET /api/v1/staff/appointments?status=pending`（带 `X-Staff-OpenId: staff-openid-demo`）
   - 预期：返回 `{ items: [...] }`
6. `GET /api/v1/staff/appointments/:id`（带 `X-Staff-OpenId: staff-openid-demo`）
   - 预期：命中返回 `{ item }`，未命中返回 `404 + APPOINTMENT_NOT_FOUND`
7. `POST` / `PATCH /api/v1/staff/appointments/:id/review`（带 `X-Staff-OpenId: staff-openid-demo`）
   - 预期：支持 `approved/rejected` 审核、重复审核拦截与 `SLOT_OCCUPIED` 冲突返回

### 3.6 当前已完成的本机验证（2026-03-22）

architect 已在当前主仓完成以下验证：

1. `npm run prisma:migrate:deploy`
   - 结果：`No pending migrations to apply`
2. 启动 `apps/api`
   - 端口：`3100`
3. 已将并行阶段 smoke 固化为仓库脚本：

```bash
cd apps/api
npm run smoke:parallel
```

4. 当前 `smoke:parallel` 已升级为统一闭环 smoke，覆盖：
   - `GET /health`
   - `GET /api/v1/gallery`
   - `GET /api/v1/staff/booking-rules`
   - `GET /api/v1/availability?date=...`
   - `POST /api/v1/appointments` 的未授权 / happy-path / approved 冲突
   - `GET /api/v1/my/appointments` 回查 pending 申请
   - `POST /api/v1/staff/appointments/:id/review` happy-path
   - `PATCH /api/v1/staff/appointments/:id/review` 重复审核拦截
   - `GET /api/v1/availability?date=...` 对 approved / pending 的差异占位结果
5. 当前已新增顾客创建预约专项 smoke：

```bash
cd apps/api
npm run smoke:create-appointment
```

6. `smoke:create-appointment` 已覆盖：
   - `401 + CUSTOMER_UNAUTHORIZED`
   - `400 + INVALID_SLOT`
   - `400 + DATE_OUT_OF_RANGE`
   - `appointmentDate` happy-path -> `201 pending`
   - 历史 `date` 字段兼容 -> `201 pending`
   - body 中伪造 `customerOpenId` 被 header 覆盖
   - 同 slot 两条 `pending` 可连续创建
   - 同 slot 已有 `approved` 后创建返回 `409 + SLOT_OCCUPIED`
7. 当前已新增 availability 专项 smoke：

```bash
cd apps/api
npm run smoke:availability
```

8. `smoke:availability` 已覆盖：
   - 默认 `date` 缺省时回落 Asia/Shanghai 当天
   - `400 + INVALID_DATE`
   - `AVAILABLE`
   - `DATE_CLOSED`
   - `DATE_OUT_OF_RANGE`
   - `SLOT_OCCUPIED`
   - `pending` 不占位、`approved` 才占位

当前结论：
- `apps/api` 已从“仅骨架可构建”推进到“本机可连库、可起服务、availability + create appointment + staff review 已具备统一闭环 smoke 验证能力”。
- 当前主仓已具备“可约时段 -> 创建预约 -> 我的预约回查 -> 店员审核 -> 时段再次校验”的运行级闭环验证能力，但在前端尚未切到 `apps/api` 前，仍不应直接视为切流完成。

---

## 4. 当前切换策略

### 现在允许的切换方式

当前阶段只允许：
1. **旧服务继续承接前端默认流量**
2. **新服务只做独立验证**（如 `/health`、已迁入读写模块的接口 smoke test）

### 当前不做的事
- 不让前端默认直接切到 `apps/api`
- 不做双写
- 不做灰度流量切换
- 不让 `apps/api` 与 `apps/server` 共用同一数据库文件

### 后续切换前置条件
在考虑把前端或测试流量切到 `apps/api` 前，至少满足：
- `gallery`
- `booking-rules`
- `appointments`
- `staff review`
这些冻结契约主路由都已迁入 NestJS，并完成兼容验证。

---

## 5. 回滚策略

若 `apps/api` 验证失败：

### 回滚动作
1. 停掉 `apps/api`
2. 保持前端继续使用 `apps/server`
3. 必要时停掉 compose 中的 MySQL

### 旧基线恢复方式

```bash
npm run dev:server
```

### 回滚原则
- `apps/server` 不依赖 `apps/api` 的 MySQL 数据
- `apps/api` 的失败不应影响当前 SQLite 基线
- 文档、脚本、端口都要保持新旧服务分离

---

## 6. 当前残余风险

1. 当前 compose 只覆盖 MySQL，未把 `apps/api` 整体容器化运行验证也落一遍。
2. 当前虽已有统一闭环 smoke，但仍属于本机脚本级验证，尚未接入 CI / 持续流水线。
3. 若本机已占用 `3307` 或 `3100`，需要手动调整 env / compose 端口。
4. 当前迁移脚本仍是空白阶段，旧 SQLite 数据尚未导入 MySQL。

---

## 7. 下一步建议

1. 在路由迁移过程中继续补兼容断言与切换检查表（当前清单见 `docs/API_CUTOVER_CHECKLIST.md`）
2. 结合前端接入节奏，按 `docs/API_CUTOVER_CHECKLIST.md` 执行 `apps/api` 切流前的最小联调
3. 按 `docs/API_CUTOVER_CHECKLIST.md` 准备前端切流前的最小联调清单与回滚步骤
4. 评估是否把当前闭环 smoke 接入更稳定的 CI / 持续验证入口
5. 待主链路迁完后，再决定是否增加 `apps/api` 容器化运行服务与更完整的切换脚本
