# API Cutover Checklist

## Goal

本清单用于约束 `apps/server` -> `apps/api` 的最小切流准备动作。

当前结论：
- `apps/server` 仍是默认前端基线
- `apps/api` 已完成主仓级闭环 smoke，但**尚未等于前端可直接切流**
- 切流前必须按本清单逐项勾完，而不是只凭“后端接口单独可用”推进

---

## 1. Cutover Preconditions

以下条件需要同时满足：

### 1.1 apps/api 运行级门槛
- [x] `npm run prisma:migrate:deploy` 可通过
- [x] `npm run build` 可通过
- [x] `npm run smoke:availability` 可通过
- [x] `npm run smoke:create-appointment` 可通过
- [x] `npm run smoke:parallel` 可通过
- [ ] 关键 smoke 至少有 1 条进入更稳定的持续验证入口（CI / 固定环境任务）

### 1.2 契约门槛
- [x] `GET /api/v1/gallery`
- [x] `GET /api/v1/availability`
- [x] `POST /api/v1/appointments`
- [x] `GET /api/v1/my/appointments`
- [x] `GET /api/v1/staff/booking-rules`
- [x] `GET /api/v1/staff/appointments`
- [x] `GET /api/v1/staff/appointments/:id`
- [x] `POST/PATCH /api/v1/staff/appointments/:id/review`
- [ ] 前端实际 Network 面板验证全部改走 `apps/api`，且不再回落旧口径

### 1.3 回滚门槛
- [x] `apps/server` 仍可独立启动
- [x] `apps/api` 与 `apps/server` 数据库隔离
- [ ] 已明确切回 `apps/server` 时的前端配置恢复步骤

---

## 2. Frontend Cutover Checklist

## 2.1 切流前必须确认
- [ ] 小程序 `apiBaseUrl` 或等价配置支持从 `3000` 切到 `3100`
- [ ] 当前前端没有硬编码依赖旧 `apps/server` 独有返回结构
- [ ] 前端对 `availability` 的 `status/reasonCode/reasonText` 已按冻结契约消费
- [ ] 前端对 `POST /api/v1/appointments` 的 `appointmentDate/date` 口径与 `apps/api` 一致
- [ ] 前端对 staff review 的状态词仍为 `approved/rejected`，没有回退旧词汇

## 2.2 切流后必须执行的页面级验证
按微信开发者工具 / 真机最少跑一轮：

1. 首页加载返图
2. 预约页加载某天 availability
3. 选择 active 时段创建预约
4. “我的预约”回查看到 `pending`
5. 店员侧查看 pending 列表
6. 店员审核 approve
7. 顾客侧重新回查看到 `approved`
8. 选择已占位时段时 availability 显示 `SLOT_OCCUPIED` / disabled
9. 关闭日期 / 超范围日期时 availability 显示对应 disabled 原因

---

## 3. Network Assertions After Cutover

前端切到 `apps/api` 后，Network 面板至少应看到：
- `GET /api/v1/gallery`
- `GET /api/v1/availability`
- `POST /api/v1/appointments`
- `GET /api/v1/my/appointments`
- `GET /api/v1/staff/booking-rules`
- `GET /api/v1/staff/appointments`
- `POST/PATCH /api/v1/staff/appointments/:id/review`

不应再出现：
- 旧 `/api/v1/services`
- 旧 `/api/v1/appointments` 读接口
- 与冻结契约不一致的 query key / 状态词 / review payload

---

## 4. Rollback Checklist

若切流后失败，按下面顺序回退：

1. 前端 `apiBaseUrl` 切回 `apps/server`（默认 `3000`）
2. 停止或隔离 `apps/api` 流量验证
3. 保留 `apps/api` MySQL 数据，不与 `apps/server` SQLite 混用
4. 重新跑 `apps/server` 基线自测 / UAT 最小链路
5. 记录失败点：
   - 是字段口径偏差
   - 是前端消费逻辑偏差
   - 是环境 / 端口 / 配置偏差

---

## 5. Current Recommendation

当前建议：
- **先不直接切前端默认流量**
- 先完成一轮受控联调：前端切到 `apps/api` 的测试配置，按本清单跑全链路
- 联调通过后，再进入是否切默认流量 / push / review 的判断节点
