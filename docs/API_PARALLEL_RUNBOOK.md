# API Parallel Runbook（Archived）

## 状态

截至 2026-03-24，`apps/api` 已完成页面验收并切换为当前唯一后端基线。

因此本文件原先描述的：
- `apps/server` / `apps/api` 并行运行
- 旧基线承接默认流量
- 新基线仅做切流前验证

**已不再适用于当前主线。**

## 为什么归档

本文件服务于“并行切流阶段”的临时操作口径。当前项目已进入：

- `apps/api + apps/weapp` 作为唯一主线
- 旧 `apps/server` 待退场
- 过渡性 cutover / rollback 文档逐步清理

若继续保留原文，容易让团队误以为：
- `apps/server` 仍是默认后端基线
- 仍需要以并行切流方式推进联调
- 还应按旧 runbook 执行回滚/切换操作

## 当前应参考的文档

请改为参考以下主线文档：

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/TASKS.md`

如需了解当前后端基线与运行口径，以 `apps/api` 的实际代码、根脚本与上述主线文档为准。

## 备注

本文件保留为“归档占位”，仅用于说明历史阶段已结束；不再作为执行手册使用。
