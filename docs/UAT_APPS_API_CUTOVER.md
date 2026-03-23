# UAT - apps/api 切流验收文档

## 当前结论（2026-03-23 15:55 Asia/Shanghai）

### 我当前能做什么

我**可以**在当前机器上完成 `apps/api` 的运行级验证，包括：
- 启动 `apps/api`
- 执行 `prisma migrate deploy`
- 执行 `npm run smoke:parallel`
- 验证 `/health`、gallery、availability、创建预约、我的预约、店员审核、重复审核拦截、slot 冲突校验

### 我当前不能做什么

我**不能**在当前 OpenClaw 会话里完成真正的**页面级 UAT**，原因是：
- 当前环境没有微信开发者工具页面点击能力
- 无法代替小程序运行时做首页切流按钮点击、页面跳转、表单输入、Network 面板人工观察
- 因此“切到 `apps/api` 后的小程序真实页面体验”仍需要你在微信开发者工具里验收

## 当前机器侧已完成验证

### 后端服务

- 目录：`repo/miniApp/apps/api`
- 环境文件：`.env`
- 端口：`3100`
- 数据库：`mysql://miniapp:miniapp@127.0.0.1:3307/miniapp_api`

### 已实际执行并通过

```bash
cd repo/miniApp/apps/api
npm run start
npm run smoke:parallel
```

### smoke 通过结论

已确认以下运行级链路通过：
1. `GET /health`
2. `GET /api/v1/gallery`
3. `GET /api/v1/staff/booking-rules`
4. `GET /api/v1/availability?date=...`
5. `POST /api/v1/appointments` 未授权拦截
6. `POST /api/v1/appointments` happy-path -> `pending`
7. `GET /api/v1/my/appointments` 可回查刚创建的预约
8. `POST /api/v1/staff/appointments/:id/review` happy-path -> `approved`
9. 重复审核 -> `APPOINTMENT_ALREADY_REVIEWED`
10. 同 slot 冲突 -> `SLOT_OCCUPIED`
11. `approved` 占位、`pending` 不占位的 availability 语义

## 当前前端切流状态

### 已就绪项

- 首页已支持显示“当前接口基线”
- 开发环境下可从 `apps/server` 切到 `apps/api`
- 仍保留一键切回 `apps/server` 的入口
- 请求层仍按冻结契约访问：
  - `GET /api/v1/gallery`
  - `GET /api/v1/availability`
  - `POST /api/v1/appointments`
  - `GET /api/v1/my/appointments`
  - `GET /api/v1/staff/booking-rules`
  - `GET /api/v1/staff/appointments`
  - `PATCH /api/v1/staff/appointments/:id/review`
- 顾客身份继续走 `X-Customer-OpenId`
- 店员审核状态继续走 `pending / approved / rejected`

### 本轮补充修正

已补 1 个前端最小兼容修正：
- 文件：`apps/weapp/pages/booking/index.js`
- 目的：兼容 `availability` 返回“单日平铺时段数组”的情况，避免同一天多时段时只渲染最后一个时段

## 你要执行的页面级 UAT

> 目标：确认“小程序前端切到 `apps/api` 后”的真实页面链路可用，并且能回滚到 `apps/server`。

### 预置条件

先在本机终端保持新 API 服务运行：

```bash
cd repo/miniApp/apps/api
npm run start
```

如果你还需要保留旧基线用于回滚对比，也可另开终端运行：

```bash
cd repo/miniApp
npm run start:server
```

### 验收环境建议

- 微信开发者工具打开 `repo/miniApp/apps/weapp`
- 开发环境
- 首页能看到“当前接口基线”卡片
- 初始默认基线应为 `apps/server`

## 页面级 UAT 执行清单

### Case A：切流到 apps/api
1. 打开首页
2. 确认当前接口基线初始为 `apps/server`
3. 点击切到 `apps/api`
4. 确认基线文案 / Base URL 已变为 `http://127.0.0.1:3100`

**期望：**
- 切流按钮可用
- 页面不白屏
- 切流状态在当前运行态可见

### Case B：首页返图
1. 切到 `apps/api` 后停留首页
2. 观察返图是否正常加载

**期望：**
- 首页能拉到 gallery
- 不出现旧接口回退
- 无明显错误态/空白态异常

### Case C：顾客预约页 availability
1. 进入预约页
2. 选择一个可测日期
3. 观察时间段卡片

**期望：**
- 可看到 `active/disabled` 时段
- disabled 时段有原因
- 同一天如果后端返回多个时段，页面应完整展示，不应只剩最后一个

### Case D：顾客提交预约
1. 选择一个 active 时段
2. 提交预约
3. 跳转到“我的预约”

**期望：**
- 创建成功
- 新记录状态为 `pending`
- 仍按 `X-Customer-OpenId` 主键回查，不回退到手机号查询

### Case E：店员审核
1. 进入店员页面
2. 查看预约列表
3. 对刚创建的 `pending` 记录做 `approved`

**期望：**
- 审核成功
- 状态更新为 `approved`
- 不出现旧接口或旧状态词

### Case F：顾客回查审核结果
1. 回到“我的预约”
2. 查看刚才那条记录

**期望：**
- 状态从 `pending` 变成 `approved`
- 页面展示与当前冻结契约一致

### Case G：回滚到 apps/server
1. 返回首页
2. 点击“使用 apps/server”或“恢复默认基线”
3. 重新执行首页/预约页最小检查

**期望：**
- 能切回旧基线
- 页面仍可正常工作
- 回滚路径清晰，不需要手改代码

## 验收通过标准

只有同时满足以下条件，才判定本轮切流 UAT 通过：
1. `apps/api` 页面链路可跑通：首页 -> availability -> 创建预约 -> 我的预约 -> 店员审核 -> 顾客回查
2. 微信开发者工具 Network 面板未回落旧接口
3. 前端未回退旧字段/旧状态词
4. 回滚到 `apps/server` 后仍可正常工作

## 如果你验收时发现问题，请按这个格式回我

- 页面：
- 操作步骤：
- 实际结果：
- 预期结果：
- 是否只在 `apps/api` 下出现：是 / 否
- 最好附 1 张截图或一段 Network 关键请求

## 当前建议

- 当前**可以推送 GitHub**，让你基于最新代码进行页面验收
- 当前**不建议继续空转派生新代码任务**
- 下一阶段的判断点很明确：
  - 如果你这轮页面 UAT 通过，我再继续推进 cutover / review 节点
  - 如果你这轮页面 UAT 失败，我按你回传的页面现象做定点修复
