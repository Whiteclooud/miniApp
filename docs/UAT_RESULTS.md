# UAT Results

## 当前状态（2026-03-20 16:24 Asia/Shanghai）

本文件用于承接当前统一验收基线的真实页面 UAT 记录。

Lan 已补充确认二次真实页面 UAT 的 Case 9 也通过。当前结论已从“主链路是否闭环”推进到“主链路与接口口径均已通过，剩余为体验增强与现象复核项”：审核闭环、顾客状态回查、无权限拦截、持久化、接口口径防回退都已通过；当前剩余工作收敛为顾客预约页“只有一个时间段可以选择”的现象复核，以及店员端规则页结构化交互 / 月历视图增强。

### 已完成的机器门槛校验

- `npm run test:server`：2026-03-18 17:29 复核通过
- `npm run check:weapp-contract`：2026-03-18 17:29 复核通过
- backend 定向修复自测：`npm run test:server` 通过（worker commit `abfdfe5`）
- frontend 定向修复自测：`npm run check:weapp-contract` 通过（worker commit `df2e731`）
- architect 统一基线复核：2026-03-19 19:10 再次在当前 repo 执行 `npm run test:server` 与 `npm run check:weapp-contract`，均通过
- architect 文件级抽查：2026-03-19 19:43 直接读取当前 repo 关键文件后确认，当前统一验收基线并未真实反映本轮 worker 回收结果：后端仍保留 `staff-openid-v1` 默认白名单，前端 booking / contract-selfcheck 也仍缺少本轮新增交互与守卫
- architect 基线收口复核：2026-03-19 22:22 已将本轮前后端修复真实落入当前 repo，并再次执行 `npm run test:server` 与 `npm run check:weapp-contract`，均通过
- architect 当日回归复核：2026-03-20 13:08 在当前 repo 再次执行 `npm run test:server` 与 `npm run check:weapp-contract`，均通过；说明二次 UAT 前当前统一验收基线未出现新的代码级回退
- GitHub 同步：2026-03-20 13:07 已将当前统一验收基线 push 到 `origin/main`，远端更新到 `2eb7fd9 feat: restore second uat baseline`

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
| 1 | 首页返图展示 | 通过 | 首页返图展示正常；封面图 -> 详情多图链路已在二次 UAT 中继续保留 |
| 2 | 顾客提交合法预约申请 | 不通过 | Lan 标记原因为“顾客预约只有一个时间段可以选择”；需复核是规则/占用导致的预期结果，还是 availability / 页面渲染缺陷 |
| 3 | 顾客查看“我的预约” | 通过 | 当前按 OpenID 查询通过 |
| 4 | 店员修改预约规则 | 不通过 | 功能链路已恢复，但交互体验未达预期：当前仍需直接编辑文本，需升级为结构化配置控件 |
| 5 | 店员审核预约 | 通过 | 店员审核链路恢复；用户补充确认驳回时可选填写理由 |
| 6 | 顾客查看审核后状态 | 通过 | 顾客端可看到审核结果；若店员填写驳回理由，顾客端也可看到 |
| 7 | 重启后端后验证 SQLite 持久化 | 通过 | 重启后持久化验证通过 |
| 8 | 无权限店员访问（可选） | 通过 | 白名单外 OpenID 拦截通过 |
| 9 | 接口口径一致性（防回退） | 通过 | Lan 已补充确认本轮 Network 面板口径检查通过，未再发现旧接口回退 |

## 当前推进动作

- 第一轮真实页面 UAT 暴露的问题已拆成 `BE-008`、`BE-009`、`FE-009`、`FE-010`、`QA-002`，当前这些修复已真实落入 architect 当前统一验收基线，并已完成 GitHub 同步。
- 二次真实页面 UAT 已确认：staff 默认白名单、审核闭环、顾客侧状态回查、无权限拦截、SQLite 持久化当前都已不再是阻塞项。
- 当前下一步重新收敛为三件事：
  1. 复现并定位“顾客预约只有一个可选时段”的现象，明确是预期结果还是缺陷
  2. 将店员规则页从原始文本编辑升级为结构化配置交互
  3. 增补店员预约页月历 / 月视图，支持查看当月日程总览
- backend 侧 `QA-003` 已完成复核：当前“顾客预约页只有一个可选时段”更符合规则配置 + `approved-only` 占用语义下的预期表现，后端当前未发现需要修复的 availability 缺陷。
- frontend worker 已回收本地提交 `4fc0e62`：声称完成 FE-011 规则页结构化改造、FE-012 店员月历视图，并对 Case 2 做了前端侧判断与提示收口；但 architect 在 2026-03-20 15:5x 直接复核当前 repo `pages/staff/rules/*` 与 `pages/staff/appointments/*` 时仍看到旧版实现，说明这批改动尚未真实落入 architect 当前统一验收基线。
- architect 已确认前端连续两轮出现“worker 回报已完成，但主仓文件事实未变”的基线漂移；为避免继续空转，本轮已按例外路径由 architect 直接在当前 repo 落 FE-011 / FE-012，仅改动 `pages/staff/rules/*` 与 `pages/staff/appointments/*` 六个目标文件，不扩散到服务层与文档契约。
- architect 已在当前 repo 执行 `npm run check:weapp-contract`，结果通过；并已将本轮前端增强与文档状态提交为 `ebcb900 feat: land staff rules structured ui and calendar view`。
- 当前剩余门槛已从“代码是否真实落地”收敛为“微信开发者工具中的页面级交互 / 视觉复核”，即确认结构化规则页与月历视图是否符合最终体验预期。

## 问题记录

1. Case 2：顾客预约页当前被用户标记为“不通过”，原因是“只有一个时间段可以选择”；需结合当时 booking rules、已批准预约占用和页面渲染结果复核，不应直接假定为后端 bug。
2. Case 4：店员规则页当前虽能保存规则，但交互仍依赖原始文本输入/多行编辑；下一轮需升级为结构化控件（开放天数选择、闭店日期选择、每日时间段可视化增删）。
3. Case 5 / Case 6 的补充确认：店员驳回预约时可选填写驳回理由，且顾客端可看到该理由；该行为与当前 V1 能力一致，记录为已验证通过项，不作为缺陷。
4. 用户新增店员侧体验要求：预约页除列表外，还应提供类似参考图的“月历 / 月视图”查看方式，用于总览当月日程；该项属于本轮 UAT 后增补需求，已冻结为新的前端收口任务。

## 结论口径

- 当前不进入 release 判断，但也不再把项目定义为“主链路未闭环”。
- 当前阶段判断为：二次 UAT 已确认首页展示、我的预约、店员审核、顾客侧状态回查、无权限拦截、持久化、接口口径防回退均通过；`QA-003` 后端侧已完成并倾向判定为预期行为，`FE-011` / `FE-012` 也已真实落入 architect 当前统一验收基线并通过契约静态自检。  
- 前一阶段的“frontend worker 已完成但主仓未变”基线漂移风险已被 architect 直接落库与提交动作收口；当前不再把它视为发布前主阻塞。
- 当前已解除“staff 鉴权 / SQLite 迁移 / 多图返图 / disabled 原因展示 / 接口口径回退”这批上一轮阻塞项。
- 只有在 `QA-003` 完成最终判定、并将 `FE-011` / `FE-012` 合入 architect 当前统一验收基线并复核通过后，才进入最终验收与后续发布判断。
