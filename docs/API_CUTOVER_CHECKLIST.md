# API Cutover Checklist

## Goal

在不影响当前 `apps/server` 稳定基线的前提下，为后续把前端/联调流量切到 `apps/api` 提供一份最小、可执行、可回滚的检查清单。

当前定位：
- 这不是“立即切流指令”
- 这是 `apps/api` 切流前必须满足的最小门槛与操作顺序

## Current Baseline

- 旧默认基线：`apps/server`（Node.js + SQLite）
- 新并行基线：`apps/api`（NestJS + Prisma + MySQL）
- 当前已在主仓通过闭环 smoke 的新接口：
  - `GET /health`
  - `GET /api/v1/gallery`
  - `GET /api/v1/staff/booking-rules`
  - `GET /api/v1/availability`
  - `POST /api/v1/appointments`
  - `GET /api/v1/my/appointments`
  - `GET /api/v1/staff/appointments`
  - `GET /api/v1/staff/appointments/:id`
  - `POST/PATCH /api/v1/staff/appointments/:id/review`

## Cutover Gate

只有同时满足以下条件，才允许进入“前端切到 `apps/api` 的联调阶段”：

1. `apps/api` 在当前机器上可成功启动
2. `npm run prisma:migrate:deploy` 通过
3. `npm run smoke:parallel` 通过
4. 前端当前依赖的冻结契约接口已全部在 `apps/api` 可用
5. 已明确回滚方式：前端可在 1 次配置修改内切回 `apps/server`

## Pre-Cutover Checks

### A. Environment

- [ ] `apps/api/.env` 已存在
- [ ] `DATABASE_URL` 指向可用 MySQL
- [ ] 端口 `3100` 未被其它长期进程占用
- [ ] `npm run prisma:migrate:deploy` 返回成功

### B. Runtime

- [ ] `npm run build` 成功
- [ ] `npm run start` 或 `npm run start:dev` 可正常启动
- [ ] `GET /health` 返回 `ok=true`

### C. Contract

- [ ] `GET /api/v1/gallery` 返回冻结字段
- [ ] `GET /api/v1/staff/booking-rules` 返回 `advanceOpenDays / closedDates / dailySlots / updatedAt`
- [ ] `GET /api/v1/availability` 返回 `status / reasonCode / reasonText`
- [ ] `POST /api/v1/appointments` 支持 `appointmentDate`，兼容 `date`
- [ ] `GET /api/v1/my/appointments` 返回顾客当前记录
- [ ] `POST/PATCH /api/v1/staff/appointments/:id/review` 返回 `approved/rejected`

### D. Behavior

- [ ] `pending` 不占位
- [ ] `approved` 才占位
- [ ] 重复审核返回 `APPOINTMENT_ALREADY_REVIEWED`
- [ ] 同 slot 冲突返回 `SLOT_OCCUPIED`
- [ ] `availability` 与 `create appointment` 对日期范围/闭店判断一致

## Recommended Validation Order

### 1. Backend self-check

在 `apps/api` 目录执行：

```bash
npm run prisma:migrate:deploy
npm run build
npm run smoke:parallel
```

### 2. Frontend pointing check

切前端前，只检查最小配置，不立刻长时间联调：

- [ ] 首页已显示“当前接口基线”卡片
- [ ] 开发环境可通过首页切流按钮把 API base 切到 `http://127.0.0.1:3100`
- [ ] 仍可通过首页按钮或恢复默认基线一键切回旧 `apps/server`
- [ ] 不同时混用新旧后端返回结构

### 3. Manual UAT mini-pass

切到 `apps/api` 后，至少重跑以下最小链路：

1. 首页点击“切到 apps/api”，确认基线文案与 Base URL 已更新
2. 首页返图加载
3. 顾客查看某天 availability
4. 顾客提交预约
5. 顾客在“我的预约”看到 `pending`
6. 店员审核通过
7. 顾客回查为 `approved`
8. 同 slot 第二条审批冲突
9. 点击“使用 apps/server”或“恢复默认基线”，确认可回滚

## Rollback Trigger

出现以下任一情况，立即回滚到 `apps/server`：

- 前端出现冻结契约外字段依赖
- 顾客提交预约失败率明显升高
- 审核后状态回查不一致
- `availability` 展示与创建/审核结果不一致
- MySQL 连接或迁移异常导致接口不可用

## Rollback Steps

1. 停止让前端指向 `apps/api`
2. 恢复前端默认指向 `apps/server`
3. 保持 `apps/server` 继续承接流量
4. 记录本次失败点，回到并行验证阶段继续修复

## Not In Scope Yet

当前这份切流清单不包含：

- 数据迁移到线上/正式环境
- 双写/灰度流量
- CI 自动化流水线
- 容器化部署切换
- 多环境配置矩阵
