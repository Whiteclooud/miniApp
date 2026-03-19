# UAT Results

## 当前状态（2026-03-19 18:06 Asia/Shanghai）

本文件用于承接当前统一验收基线的真实页面 UAT 记录。

本轮已收到 Lan 的一轮真实页面 UAT 反馈，顾客侧主链路基本通过，当前阻塞集中在店员鉴权一致性与本地历史 SQLite 兼容。

### 已完成的机器门槛校验

- `npm run test:server`：2026-03-18 17:29 复核通过
- `npm run check:weapp-contract`：2026-03-18 17:29 复核通过

结论：当前代码基线已再次确认满足冻结契约，项目阶段维持在“真实页面 UAT 执行”，不再是“继续代码修偏”。

## 本轮 UAT 环境

- 时间：2026-03-19 18:06 Asia/Shanghai（Lan 反馈时间）
- 后端地址：`http://127.0.0.1:3000`
- 店员 OpenID（UAT 实际输入）：`staff-openid-demo`
- 顾客 OpenID（开发环境模拟）：`customer-openid-demo`
- 数据库文件：`apps/server/data/miniapp.sqlite`
- `npm run test:server`：本轮反馈未填写；Lan 另行说明 backend 已在其侧验证通过

## 用例执行面板

| Case | 名称 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| 1 | 首页返图展示 | 通过 | 首页返图展示正常；新增体验需求：首页只展示封面图，点击进入详情查看多图 |
| 2 | 顾客提交合法预约申请 | 通过 | 顾客预约提交流程通过 |
| 3 | 顾客查看“我的预约” | 通过 | 当前按 OpenID 查询通过 |
| 4 | 店员修改预约规则 | 不通过 | `GET /api/v1/staff/appointments` 返回 `401 Unauthorized`，店员链路被阻断 |
| 5 | 店员审核预约 | 不通过 | 同上，staff 接口 401，无法进入审核闭环 |
| 6 | 顾客查看审核后状态 | 不通过 | 上游审核未成功，无法验证审核回写 |
| 7 | 重启后端后验证 SQLite 持久化 | 通过 | 重启后持久化验证通过 |
| 8 | 无权限店员访问（可选） | 待补充 | 用户反馈模板中未最终勾选 |
| 9 | 接口口径一致性（防回退） | 待补充 | 用户反馈模板中未最终勾选 |

## 当前推进动作

- 当前机器门槛已复核通过，但真实页面 UAT 已暴露新的定向修复项，不再是“继续盲测全部 Case”。
- 当前先收口三块：
  1. staff 默认白名单与 UAT 输入值对齐（`staff-openid-demo`）
  2. 旧 SQLite `appointment_date -> date` 启动迁移兼容
  3. 首页返图“封面 -> 详情多图”体验补齐
- 待以上三块完成后，再补跑 Case 4~9。

## 问题记录

1. 店员输入 `staff-openid-demo` 后，请求 `/api/v1/staff/appointments` 返回 `401 Unauthorized`，导致 Case 4 / 5 / 6 无法继续。
2. 当前统一验收基线直接复核可见：后端默认店员白名单仍为 `staff-openid-v1`，与 `docs/UAT_GUIDE.md` 及本轮 UAT 输入值 `staff-openid-demo` 不一致，属于环境一致性问题。
3. Lan 反馈本地 `apps/server/data/miniapp.sqlite` 中 `appointments` 表仍保留旧 schema（`appointment_date` 列）；backend 已声称补了启动迁移与回归自测，但 architect 当前本地 / 远端主线尚未直接看到该新提交，需继续核对并合入。
4. 新增体验需求：首页返图目前只能看单图，需支持“首页只展示封面图，点击后进入详情页查看其它图片”。

## 结论口径

- 当前不进入 push / review / release 判断。
- 当前阶段判断为：顾客主链路已通过 UAT，staff 侧与本地旧库兼容仍需定向修复。
- 若 Case 9 出现旧接口（如 `/api/v1/services`、旧版 `GET /api/v1/appointments`），直接判定为契约回退问题。
- 待 `BE-008` 与 `FE-009` 收口后，再重跑 Case 4~9 形成最终验收结论。
