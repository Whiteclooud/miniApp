# API Parallel Runbook

## 目标

本文件用于说明 `apps/server` 与 `apps/api` 在 Phase 0/1 的并行运行方式，以及本地 MySQL / Docker 环境、切换策略与回滚路径。

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
- 当前仅保证：Nest skeleton + `/health` + Prisma v1 schema

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

- 访问：`GET http://127.0.0.1:3100/health`
- 预期：返回 `ok=true` 与 `service=miniapp-api`

---

## 4. 当前切换策略

### 现在允许的切换方式

当前阶段只允许：
1. **旧服务继续承接前端默认流量**
2. **新服务只做独立验证**（如 `/health`、后续迁入模块的接口验收）

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
2. 当前 `apps/api` 还只有 `/health` 和 Prisma 基线，业务路由兼容性尚未验证。
3. 若本机已占用 `3307` 或 `3100`，需要手动调整 env / compose 端口。
4. 当前迁移脚本仍是空白阶段，旧 SQLite 数据尚未导入 MySQL。

---

## 7. 下一步建议

1. 在本机完成 `docker compose up -d` + `prisma migrate deploy` + `/health` 运行验证
2. 继续迁 `gallery -> booking-rules -> appointments -> staff` 模块
3. 在路由迁移过程中补兼容断言与切换检查表
4. 待主链路迁完后，再决定是否增加 `apps/api` 容器化运行服务与更完整的切换脚本
