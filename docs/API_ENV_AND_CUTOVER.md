# apps/api 环境与切换手册

## 目的

本手册承接 `DEV-001`，用于说明：

1. 如何在本地为新后端 `apps/api` 准备 MySQL 环境
2. 如何让 `apps/server` 与 `apps/api` 并行存在
3. 后续如何切换、如何回滚

当前原则：
- **旧 `apps/server` 仍是已通过 UAT 的运行基线**
- **新 `apps/api` 只在 Phase 0/1 作为并行骨架验证**
- 在未完成主业务路由迁移和回归验证前，**不切流、不替代旧服务**

---

## 一、目录与职责

- 旧服务：`apps/server`
- 新服务：`apps/api`
- MySQL compose：`infra/compose/api-mysql.compose.yml`
- 新服务环境样例：`apps/api/.env.example`

职责分工：
- `apps/server`：继续承接当前 V1 冻结契约的可运行基线
- `apps/api`：承接 NestJS + Prisma + MySQL 增量重构主线

---

## 二、本地 MySQL 启动方式

### 1. 启动数据库

在仓库根目录执行：

```bash
docker compose -f infra/compose/api-mysql.compose.yml up -d
```

### 2. 默认连接信息

- Host: `127.0.0.1`
- Port: `3307`
- Database: `miniapp_api`
- Root user: `root`
- Root password: `root`
- App user: `miniapp`
- App password: `miniapp`

### 3. 推荐的 `DATABASE_URL`

在 `apps/api/.env` 中使用：

```env
PORT=3100
DATABASE_URL="mysql://miniapp:miniapp@127.0.0.1:3307/miniapp_api"
```

> 注意：`apps/api/.env.example` 当前已经对齐 app 用户默认连接；日常开发优先保持这套默认值，除非你的本机端口不是 `3307`。

---

## 三、新后端本地验证顺序

在 `apps/api` 目录中按下面顺序执行：

### 1. 安装依赖

```bash
npm install
```

### 2. 生成 Prisma Client

```bash
npm run prisma:generate
```

### 3. 执行数据库 migration

```bash
npm run prisma:migrate:deploy
```

### 4. 启动新服务

```bash
npm run start:dev
```

### 5. 验证健康检查

访问：

```text
GET http://127.0.0.1:3100/health
```

期望返回：

```json
{
  "ok": true,
  "service": "miniapp-api",
  "timestamp": "..."
}
```

---

## 四、新旧服务并行策略

### 当前并行方式

- 旧服务：`apps/server` 使用 `3000`
- 新服务：`apps/api` 使用 `3100`
- 前端当前仍默认连接旧服务，不改动现有联调入口

### 为什么先并行不切换

因为当前 `apps/api` 只完成了：
- NestJS 基础骨架
- `/health`
- Prisma schema / migration 基线

尚未完成：
- `gallery`
- `booking-rules`
- `appointments`
- `staff`
- 与旧契约一致的回归断言

因此当前不能让前端直连 `apps/api`。

---

## 五、切换前必须满足的条件

在考虑把前端或联调环境切到 `apps/api` 前，至少满足：

1. `apps/api` 已迁完冻结契约主路由
2. 新服务通过最小兼容回归
3. 新旧服务关键接口返回结构已对齐
4. 已有清晰的回滚方式
5. 前端仅通过配置切换 base URL，而不是代码内散落改地址

---

## 六、推荐切换步骤

### Phase A：内部验证

- 保持前端继续连 `apps/server`
- 只对 `apps/api` 单独做 curl / Postman / 自测
- 先验证 `/health`、再验证 gallery / rules / appointments / staff

### Phase B：灰度联调

- 给前端增加临时 base URL 切换能力
- 只在本地 / 测试环境把部分联调指向 `apps/api`
- Network 面板核对是否仍满足冻结契约

### Phase C：主切换

- 确认 `apps/api` 已覆盖旧服务主路由
- 切换默认联调入口到 `apps/api`
- 保留 `apps/server` 作为随时可回退基线

---

## 七、回滚手册

若新服务验证失败，立即按以下方式回滚：

1. 前端恢复使用旧服务基地址 `http://127.0.0.1:3000`
2. 停止 `apps/api` 调试进程
3. 保留 MySQL 容器与数据，不做破坏性删除
4. 继续使用 `apps/server` + SQLite 完成联调与演示

### 回滚原则

- 回滚只切入口，不急着删新骨架
- 不在失败当天继续“边修边切流”
- 先恢复可运行基线，再定位问题

---

## 八、当前已知风险

1. `apps/api` 当前只到骨架阶段，不能误判为可替换旧服务
2. Prisma schema 当前是 v1 最小模型，后续仍可能调整 JSON 字段承载方式
3. 当前尚未补 Docker 化的 `apps/api` 容器本体，只先补了 MySQL 环境
4. 新旧双环境并行阶段，最容易出现 base URL 混用与错误库误连

---

## 九、下一步建议

1. 补 `apps/api` 的真实运行级验证（`migrate deploy` + `/health`）
2. 按 `health -> gallery -> booking-rules -> appointments -> staff` 顺序迁主路由
3. 在前端切换 base URL 前，先补兼容断言和回滚演练
