# UAT Results

## 当前状态（2026-03-19 22:22 Asia/Shanghai）

本文件用于承接当前统一验收基线的真实页面 UAT 记录。

本轮已收到 Lan 的一轮真实页面 UAT 反馈，顾客侧主链路基本通过；针对 staff 鉴权、本地历史 SQLite 兼容、返图详情多图与预约页禁用原因展示的定向修复，前后端 worker 均已回收。

### 已完成的机器门槛校验

- `npm run test:server`：2026-03-18 17:29 复核通过
- `npm run check:weapp-contract`：2026-03-18 17:29 复核通过
- backend 定向修复自测：`npm run test:server` 通过（worker commit `abfdfe5`）
- frontend 定向修复自测：`npm run check:weapp-contract` 通过（worker commit `df2e731`）
- architect 统一基线复核：2026-03-19 19:10 再次在当前 repo 执行 `npm run test:server` 与 `npm run check:weapp-contract`，均通过
- architect 文件级抽查：2026-03-19 19:43 直接读取当前 repo 关键文件后确认，当前统一验收基线并未真实反映本轮 worker 回收结果：后端仍保留 `staff-openid-v1` 默认白名单，前端 booking / contract-selfcheck 也仍缺少本轮新增交互与守卫
- architect 基线收口复核：2026-03-19 22:22 已将本轮前后端修复真实落入当前 repo，并再次执行 `npm run test:server` 与 `npm run check:weapp-contract`，均通过
- architect 当日回归复核：2026-03-20 13:08 在当前 repo 再次执行 `npm run test:server` 与 `npm run check:weapp-contract`，均通过；说明二次 UAT 前当前统一验收基线未出现新的代码级回退

结论：当前代码与 UAT 反馈已不再停留在“修复方案”层面，而是已真正进入 architect 当前统一验收基线；项目阶段从“统一基线重新收口，暂缓二次 UAT”恢复为“可执行二次真实页面 UAT”。

## 本轮 UAT 环境

- 时间：2026-03-19 18:06 Asia/Shanghai（Lan 反馈时间）
- 后端地址：`http://127.0.0.1:3000`
- 店员 OpenID（UAT 实际输入）：`staff-openid-demo`
- 顾客 OpenID（开发环境模拟）：`customer-openid-demo`
- 数据库文件：`apps/server/data/miniapp.sqlite`
- `npm run test:server`：首轮真实页面 UAT 反馈中未填写；后续 backend 定向修复自测已回收通过（worker commit `abfdfe5`）

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

- 第一轮真实页面 UAT 暴露的问题已拆成 `BE-008`、`BE-009`、`FE-009`、`FE-010`、`QA-002`，当前这些修复已真实落入 architect 当前统一验收基线。
- 当前下一步不再是继续收口代码，而是直接重跑二次真实页面 UAT，重点复测：
  1. `staff-openid-demo` 默认白名单是否已恢复 staff 链路
  2. 预约页 disabled 时段的灰显与 `reasonText` 展示是否符合预期
  3. 首页返图封面 -> 详情多图链路与接口口径防回退
- 在二次真实页面 UAT 跑完前，仍不进入 push / review / release 判断。

## 问题记录

1. 店员输入 `staff-openid-demo` 后，请求 `/api/v1/staff/appointments` 返回 `401 Unauthorized`，导致 Case 4 / 5 / 6 无法继续。
2. 当前统一验收基线直接复核可见：后端默认店员白名单仍为 `staff-openid-v1`，与 `docs/UAT_GUIDE.md` 及本轮 UAT 输入值 `staff-openid-demo` 不一致，属于环境一致性问题。
3. Lan 反馈本地 `apps/server/data/miniapp.sqlite` 中 `appointments` 表仍保留旧 schema（`appointment_date` 列）；backend 已回收“启动自动迁移到 `date` 模型”的修复与自测，当前待 architect 在统一基线复核并确认未回退。
4. 新增体验需求：首页返图目前只能看单图，需支持“首页只展示封面图，点击后进入详情页查看其它图片”；frontend 已回收 FE-009，自检通过，待统一基线复核。
5. 新增体验需求：预约页的时间段选择要更直观，建议改为块状/卡片式选择；不可预约的时间段不要直接消失，要显性禁用并提示原因。frontend / backend 已分别回收 FE-010 / BE-009，待二次 UAT 验证真实效果。

## 结论口径

- 当前不进入 push / review / release 判断。
- 当前阶段判断为：顾客主链路已通过首轮 UAT，本轮 staff 侧与新增交互项修复也已真实进入 architect 当前统一验收基线，当前可恢复二次真实页面 UAT。
- 当前已解除“worker 结果正确、architect 基线仍旧”的混合结论风险。
- 只有在二次 UAT 确认 `BE-008`、`BE-009`、`FE-009`、`FE-010` 的页面效果与接口行为都通过后，才进入最终验收与后续发布判断。
