# API Cutover Checklist

## 目标

本清单用于指导 `apps/weapp` 从旧基线 `apps/server` 切到新后端 `apps/api` 前的最小联调与回滚判断。

当前定位：
- `apps/server` 仍是默认基线
- `apps/api` 已完成 availability / create appointment / my appointments / staff review 主链路的主仓级闭环 smoke
- 本清单只回答 **“何时可以开始前端对接验证”**，不等于立即切流

---

## 1. 切流前必须满足的前置条件

以下条件必须同时满足：

1. `apps/api` 可正常启动
   - `npm run prisma:migrate:deploy`
   - `npm run build`
   - `npm run start`
2. MySQL 环境可用
   - `DATABASE_URL` 指向可访问的 `miniapp_api`
3. 闭环 smoke 通过
   - `npm run smoke:parallel`
4. 旧基线仍可回滚
   - `npm run dev:server` 可正常启动
5. 前端尚未改默认基地址前，文档已明确回退路径

---

## 2. 前端切到 `apps/api` 前必须复核的接口清单

## 顾客侧

- `GET /api/v1/gallery`
- `GET /api/v1/availability?date=YYYY-MM-DD`
- `POST /api/v1/appointments`
- `GET /api/v1/my/appointments`

### 顾客侧兼容断言

1. `gallery`
   - 返回 `{ items: [...] }`
   - 字段仍为 `id/title/imageUrl/imageUrls/tags/sortOrder/status`
2. `availability`
   - 返回该日全部应展示时段
   - 字段仍为 `date/timeSlot/status/reasonCode/reasonText`
   - `pending` 不占位，`approved` 才占位
3. `create appointment`
   - 仍仅读 `X-Customer-OpenId`
   - 仍支持 `appointmentDate`，兼容历史 `date`
   - 默认创建 `pending`
   - 仍返回 `{ item }`
4. `my appointments`
   - 仍按 `X-Customer-OpenId` 查询
   - 状态词仍是 `pending/approved/rejected`

## 店员侧

- `GET /api/v1/staff/booking-rules`
- `GET /api/v1/staff/appointments?status=pending`
- `GET /api/v1/staff/appointments/:id`
- `POST /api/v1/staff/appointments/:id/review`
- `PATCH /api/v1/staff/appointments/:id/review`

### 店员侧兼容断言

1. 仍使用 `X-Staff-OpenId`
2. 白名单外仍返回 `401 + STAFF_UNAUTHORIZED`
3. review 仍只接受 `approved/rejected` 为主状态词
4. 重复审核仍返回 `APPOINTMENT_ALREADY_REVIEWED`
5. slot 冲突仍返回 `SLOT_OCCUPIED`

---

## 3. 最小联调步骤（建议顺序）

1. 启动 `apps/api`
2. 保持 `apps/server` 可随时回滚
3. 将前端 API base 临时切到 `http://127.0.0.1:3100`
4. 依次执行：
   - 首页返图加载
   - 顾客预约页拉取 availability
   - 顾客提交预约
   - 我的预约回查
   - 店员审核通过/驳回
   - 顾客再次查看状态
5. 用微信开发者工具 Network 面板确认：
   - 未回退到旧接口
   - 返回字段未漂移

---

## 4. 允许切流的最小判定

只有当下面都满足时，才允许把前端默认联调目标切到 `apps/api`：

1. `npm run smoke:parallel` 通过
2. 前端页面联调通过一次完整闭环：
   - availability -> create -> my appointments -> review -> recheck
3. Network 面板未出现旧接口回退
4. 顾客/店员关键错误码与前端提示未漂移
5. 回滚路径已验证

---

## 5. 不允许切流的信号

出现任一项，都不应切流：

- availability 与 create 对同一天/同一时段给出矛盾结论
- `pending` 被错误当成占位
- 前端仍依赖旧字段或旧状态词
- review 返回结构与当前冻结契约不一致
- MySQL 环境不稳定，无法稳定重复 smoke

---

## 6. 回滚步骤

若前端切到 `apps/api` 后联调失败：

1. 前端 base URL 切回 `apps/server`
2. 保持 `apps/api` 只做并行验证，不再承接默认联调
3. 记录失败点：接口、页面、请求体、响应体、错误码
4. 回到本清单第 2 节重新核对兼容断言

---

## 7. 当前结论（2026-03-22）

当前已经具备：
- `apps/api` availability / create appointment / my appointments / staff review 的主仓级闭环 smoke
- 切流前的最小联调清单
- 明确回滚路径

当前尚未完成：
- 前端真正切到 `apps/api` 的页面联调
- CI / 持续验证接入

因此当前状态应理解为：
**“可开始前端对接验证，但尚未切流完成。”**
