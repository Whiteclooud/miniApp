# TASKS

## 当前阶段

V1 范围扩展：首页热门款式推荐 + 预约页美甲师选择

## 任务列表

| ID | Owner | Task | Input | Output | Depends On | Done Definition | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ARCH-001 | architect | 固化 PRD、架构、API、任务文档 | 业务需求、现有 V1 文档 | `docs/*.md` | 无 | 文档可作为前后端执行依据 | 需求假设未写明会导致理解偏差 |
| FE-001 | frontend | 完善首页和预约页基础 UI 与交互 | `docs/PRD.md`, `docs/API.md` | `apps/weapp/pages/*` | ARCH-001 | 用户可在小程序端提交预约 | 基础页面改动可能与新增区块冲突 |
| FE-002 | frontend | 增加表单校验与提交结果提示 | `docs/API.md` | `apps/weapp/pages/booking/*` | FE-001 | 异常输入能被前端拦截 | 校验规则与后端不一致 |
| BE-001 | backend | 完善服务与预约 API | `docs/API.md` | `apps/server/src/server.mjs` | ARCH-001 | 接口字段与 `docs/API.md` 一致 | 接口变更影响前端联调 |
| BE-002 | backend | 增加持久化方案设计 | `docs/ARCHITECTURE.md` / code | 文档或代码方案 | BE-001 | 提出 SQLite/MySQL 迁移方案 | 当前内存存储不适合持续扩展 |
| ARCH-002 | architect | 评审前后端交付并更新任务状态 | 前后端提交结果 | `docs/TASKS.md` | FE-001, BE-001 | 状态、风险、下一步清晰 | 评审口径不统一 |
| FE-003 | frontend | 首页新增热门款式推荐区 | `docs/PRD.md`, `docs/API.md` 中热门款式结构 | `apps/weapp/pages/home/*`, `apps/weapp/services/*` | ARCH-001, BE-003 | 首页能展示热门款式卡片；点击可进入预约页；失败时有兜底态 | 图片样式与接口字段未对齐 |
| FE-004 | frontend | 预约页支持选择美甲师并提交 | `docs/API.md` 中 artists / appointments 字段 | `apps/weapp/pages/booking/*`, `apps/weapp/services/*` | ARCH-001, BE-004 | 用户可选择具体美甲师或“不指定”；提交后预约记录正确展示 | 无偏好逻辑、默认值和回填处理易出错 |
| BE-003 | backend | 提供热门款式推荐接口 | `docs/API.md` 热门款式定义 | `apps/server/src/server.mjs` | ARCH-001 | `GET /api/v1/hot-styles` 返回有效数据，排序稳定，仅返回 active 项 | 图片地址、字段命名与前端约定不一致 |
| BE-004 | backend | 提供美甲师列表并扩展预约字段 | `docs/API.md` artists / appointments 定义 | `apps/server/src/server.mjs` | ARCH-001 | `GET /api/v1/artists` 可用；创建/查询预约包含 `artistId` / `artistName`；旧请求不传 artist 字段也能成功 | 若后续要求排班能力，当前接口需升级 |
| ARCH-003 | architect | 对本次需求做联调验收与范围守卫 | 前后端联调结果、测试结果 | 评审结论 / 更新任务状态 | FE-003, FE-004, BE-003, BE-004 | 明确通过 / 不通过项、剩余风险、后续待确认事项 | 范围外诉求混入本次迭代 |

## 验收标准

### A. 首页热门款式推荐区

- 首页可见“热门款式推荐”区块，位置在首屏主 CTA 之后、服务项目列表之前。
- 至少可展示 3 条推荐内容，字段完整：名称、图片、标签/描述、价格参考或关联服务。
- 点击推荐卡片或卡片 CTA 可进入预约页。
- 接口异常或无数据时，页面不白屏，允许展示空态或隐藏区块。

### B. 预约页美甲师选择

- 预约页可加载美甲师列表。
- 用户可选择具体美甲师，也可选择“无偏好/到店安排”。
- 提交预约时，所选美甲师字段会随预约一起提交。
- 提交成功后，在预约列表或结果展示中可看到美甲师信息；若无偏好则展示相应文案。

### C. 接口与兼容性

- 新接口 `GET /api/v1/hot-styles`、`GET /api/v1/artists` 可正常返回。
- `POST /api/v1/appointments` 在不传 artist 字段时仍兼容旧逻辑。
- `GET /api/v1/appointments` 返回结构包含美甲师字段。
- 前后端字段命名与 `docs/API.md` 完全一致。

### D. 非功能要求

- 不引入个性化推荐算法。
- 不引入技师排班、实时库存或冲突校验。
- 不影响现有基础预约提交流程。

## 任务拆解规则

- 任何新增需求，先由架构师写入文档，再派给前后端
- 每项任务都必须包含输入、输出、边界、验收标准
- 状态更新统一由架构师维护
- 如涉及新字段或新接口，必须先更新 `docs/API.md`
