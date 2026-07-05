# API

## Base URL

开发环境：`http://127.0.0.1:3100`

## 当前基线调整（2026-07-05）

- `apps/api` 是当前唯一后端基线，开发环境默认地址为 `http://127.0.0.1:3100`。
- 体验版 / 正式版必须切到 HTTPS API 域名，并在微信公众平台配置合法 request/uploadFile 域名。
- 当前身份主线为 `wx.login -> /api/v1/auth/wechat-login -> Authorization: Bearer <token>`。
- develop 环境允许 `X-Customer-OpenId` / `X-Staff-OpenId` 作为本地联调兜底；体验版 / 正式版不允许依赖 mock OpenID header。
- `GET /api/v1/availability` 已承载规则窗口日期、月历日期状态与当前日期全部时段。
- `GET /api/v1/staff/appointments` 未传 `status` 时返回完整预约数据集，供店员月历聚合使用。

## 当前冻结契约（2026-03-16 复核，2026-03-29 增补）

V1 当前只允许以下接口对外使用：

- `GET /health`
- `POST /api/v1/auth/wechat-login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET /api/v1/gallery`
- `GET /api/v1/availability`
- `POST /api/v1/appointments`
- `GET /api/v1/my/appointments`
- `GET /api/v1/staff/booking-rules`
- `PUT /api/v1/staff/booking-rules`
- `POST /api/v1/staff/uploads/images`
- `GET /api/v1/staff/gallery`
- `POST /api/v1/staff/gallery`
- `PATCH /api/v1/staff/gallery/:id`
- `GET /api/v1/staff/appointments`
- `GET /api/v1/staff/appointments/:id`
- `POST /api/v1/staff/appointments/:id/review`
- `PATCH /api/v1/staff/appointments/:id/review`
- `PATCH /api/v1/my/appointments/:id/cancel`
- `PATCH /api/v1/staff/appointments/:id/reschedule`
- `GET /api/v1/staff/appointments/:id/audit-logs`

以下旧接口不再属于当前契约，前后端都禁止继续依赖：

- `GET /api/v1/services`
- `GET /api/v1/hot-styles`
- `GET /api/v1/artists`
- 旧版 `GET /api/v1/appointments`

## 业务流程升级（2026-07-05）

- 预约状态扩展为：`pending` / `approved` / `rejected` / `cancelled` / `completed` / `no_show`。
- 只有 `approved` 状态占用预约时段；`rejected`、`cancelled`、`completed`、`no_show` 都会释放 `approvedSlotKey`。
- 顾客可调用 `PATCH /api/v1/my/appointments/:id/cancel` 取消 `pending` 或 `approved` 预约。
- 店员可继续通过 `POST/PATCH /api/v1/staff/appointments/:id/review` 设置最终状态，`status` 支持上述全部状态。
- 店员可调用 `PATCH /api/v1/staff/appointments/:id/reschedule` 协助待审核/已通过预约改期，body 支持 `appointmentDate`、`timeSlot`、`reviewNote`。
- 店员可调用 `GET /api/v1/staff/appointments/:id/audit-logs` 查看创建、状态修改、改期、取消等操作日志。
- `GET /api/v1/staff/appointments` 额外支持 `keyword`、`date`、`dateFrom`、`dateTo` 查询参数，用于按顾客名/手机号/OpenID、日期和状态筛选。
- 预约规则扩展字段：`weeklyOpenDays`、`sameDayCutoffTime`、`minAdvanceHours`、`dateSlotOverrides`。availability 会根据周营业日、当天截止、提前小时和特殊日期时段返回日期/时段禁用原因。

## 本轮 UAT / 集成备注（2026-07-05）

- 体验版 UAT 需要额外确认 Bearer session、logout、非店员拦截和 staff 白名单复核。
- 本地 UAT 可继续使用 `staff-openid-demo`；`NODE_ENV=production` 时 demo 店员默认不生效。
- 返图接口在不新增详情接口的前提下，扩展 `imageUrls` 供前端详情页展示多图。
- 顾客预约页显性展示“可约 + 不可约”时段与原因，供前端做卡片化选择和禁用提示。

## 本轮体验优化接口增补（2026-03-29）

- `GET /api/v1/gallery` 升级为“统一返图查询接口”：默认按 `publishedAt desc` 返回全部已发布返图；首页调用时传 `limit=3`，列表页不传 `limit` 或后续按分页扩展。
- `GalleryItem` 新增 `description` 与 `publishedAt` 字段，分别承载店员文字说明与顾客侧时间排序基准；详情页仍复用同一接口返回的 `imageUrls`。
- 新增店员返图维护链路：`POST /api/v1/staff/uploads/images` 负责上传图片，`GET/POST/PATCH /api/v1/staff/gallery` 负责返图内容查询、创建与编辑。
- `GET /api/v1/availability` 除 `dateOptions` 外，新增 `calendarDays`，用于顾客端复用店员月历组件；每个日期需显性给出日期级状态与原因。
- `POST/PATCH /api/v1/staff/appointments/:id/review` 从“一次性审核”调整为“可修改最终状态”；最新审核结果生效，且从拒绝改回通过时仍需重新做 slot 冲突校验。
- 当前体验版 / 正式版身份口径为 `wx.login -> /api/v1/auth/wechat-login -> Authorization: Bearer <token>`；`X-Customer-OpenId` / `X-Staff-OpenId` 仅作为 develop 环境兼容兜底，不作为体验版或正式版发布口径。
- 店员 Bearer session 每次访问 staff 接口时仍会复核 `STAFF_OPEN_IDS` 白名单；从白名单移除后，旧 session 不再拥有店员权限。

## 1. 健康检查

### Request

- `GET /health`

### Response

```json
{
  "ok": true,
  "service": "miniapp-server",
  "timestamp": "2026-03-16T00:00:00.000Z"
}
```

## 身份登录与会话

### 2.1 微信登录

#### Request

- `POST /api/v1/auth/wechat-login`

```json
{
  "code": "wx.login 返回的临时 code"
}
```

#### Response

```json
{
  "token": "session-token",
  "expiresAt": "2026-07-05T12:00:00.000Z",
  "user": {
    "id": "user-id",
    "openId": "openid",
    "role": "customer"
  }
}
```

### 2.2 当前会话

#### Request

- `GET /api/v1/auth/me`
- Header：`Authorization: Bearer <token>`

#### Response

```json
{
  "user": {
    "id": "user-id",
    "openId": "openid",
    "role": "customer"
  }
}
```

### 2.3 退出登录

#### Request

- `POST /api/v1/auth/logout`
- Header：`Authorization: Bearer <token>`

#### Response

```json
{
  "ok": true
}
```

### Notes

- 缺少、过期或已退出的 token 访问 `/api/v1/auth/me` 时返回 `401 + SESSION_UNAUTHORIZED`。
- `role=staff` 由服务端根据 `STAFF_OPEN_IDS` 白名单判断。
- 体验版 / 正式版必须使用 Bearer token；OpenID header 只保留给 develop 环境联调。

## 2. 获取返图库

### Request

- `GET /api/v1/gallery`
- Query（可选）：
  - `limit=3`：首页仅取最近 3 条已发布返图

### Response

```json
{
  "items": [
    {
      "id": "gallery-aurora",
      "title": "极光猫眼",
      "imageUrl": "https://example.com/images/aurora-cat-eye-cover.jpg",
      "imageUrls": [
        "https://example.com/images/aurora-cat-eye-cover.jpg",
        "https://example.com/images/aurora-cat-eye-detail-1.jpg",
        "https://example.com/images/aurora-cat-eye-detail-2.jpg"
      ],
      "description": "偏通勤的极光猫眼，适合春夏。",
      "tags": ["猫眼", "通勤", "热门"],
      "publishedAt": "2026-03-29T10:00:00.000Z",
      "sortOrder": 1,
      "status": "active"
    }
  ]
}
```

### Notes

- 仅返回已发布且 `active` 的数据。
- `imageUrl` 为首页 / 列表封面图；`imageUrls` 为详情页多图数组。
- 若 `imageUrls` 缺失或为空，前端至少用 `imageUrl` 兜底展示详情。
- 默认按 `publishedAt desc` 排序；`sortOrder` 仅作为兼容或运营兜底字段。
- 首页调用时使用 `limit=3`；返图列表页默认读取全部已发布内容。
- 当前页面级 UAT 基线要求开发环境至少存在 1 条可见返图数据；若库内为空，只进入“返图内容整理中”空态不视为满足首页返图展示验收。

## 3. 店员上传返图图片

### Request

- `POST /api/v1/staff/uploads/images`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`
- Content-Type：`multipart/form-data`
- FormData：`files[]`

### Response

```json
{
  "items": [
    {
      "url": "https://example.com/uploads/gallery/aurora-1.jpg"
    },
    {
      "url": "https://example.com/uploads/gallery/aurora-2.jpg"
    }
  ]
}
```

### Notes

- 该接口只负责图片上传，不负责返图标题、标签、文字说明等业务字段落库。
- 店员侧必须先完成上传，再调用返图管理接口保存元数据。

## 4. 店员创建返图内容

### Request

- `POST /api/v1/staff/gallery`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Body

```json
{
  "title": "极光猫眼",
  "imageUrl": "https://example.com/uploads/gallery/aurora-1.jpg",
  "imageUrls": [
    "https://example.com/uploads/gallery/aurora-1.jpg",
    "https://example.com/uploads/gallery/aurora-2.jpg"
  ],
  "description": "偏通勤的极光猫眼，适合春夏。",
  "tags": ["猫眼", "通勤"],
  "publishedAt": "2026-03-29T10:00:00.000Z"
}
```

### Notes

- `imageUrl` 作为封面图；若未单独指定，前端 / 后端可约定默认取 `imageUrls[0]`。
- `publishedAt` 未传时，默认取创建时间。
- V1 默认创建即发布，不额外拆复杂审核流。

## 5. 店员查看 / 编辑返图内容

### Request

- `GET /api/v1/staff/gallery`
- `PATCH /api/v1/staff/gallery/:id`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### PATCH Body（示例）

```json
{
  "title": "极光猫眼（更新）",
  "description": "补充了细节图。",
  "tags": ["猫眼", "通勤", "新上架"],
  "imageUrl": "https://example.com/uploads/gallery/aurora-1.jpg",
  "imageUrls": [
    "https://example.com/uploads/gallery/aurora-1.jpg",
    "https://example.com/uploads/gallery/aurora-2.jpg",
    "https://example.com/uploads/gallery/aurora-3.jpg"
  ]
}
```

### Notes

- `GET /api/v1/staff/gallery` 返回店员维护视角所需的返图列表，至少包含 `id / title / imageUrl / imageUrls / description / tags / publishedAt / status`。
- `PATCH /api/v1/staff/gallery/:id` 用于编辑已发布返图；V1 不强制拆删除接口，若需隐藏可后续通过 `status` 扩展。

## 6. 获取可预约时段

### Request

- `GET /api/v1/availability?date=2026-03-16`

### Response

```json
{
  "dateOptions": [
    "2026-03-16",
    "2026-03-17",
    "2026-03-18"
  ],
  "calendarDays": [
    {
      "date": "2026-03-16",
      "status": "active",
      "reasonCode": "AVAILABLE",
      "reasonText": "可预约"
    },
    {
      "date": "2026-03-17",
      "status": "disabled",
      "reasonCode": "DATE_CLOSED",
      "reasonText": "门店休息"
    }
  ],
  "selectedDate": "2026-03-16",
  "items": [
    {
      "date": "2026-03-16",
      "timeSlot": "09:30-10:30",
      "status": "active",
      "reasonCode": "AVAILABLE",
      "reasonText": "可预约"
    },
    {
      "date": "2026-03-16",
      "timeSlot": "11:00-12:00",
      "status": "disabled",
      "reasonCode": "SLOT_OCCUPIED",
      "reasonText": "该时间段已被预约"
    }
  ]
}
```

### Notes

- 当请求携带 `date` 时，服务端应返回该日期下所有应展示的时间段，而不只是可预约时段。
- 返回体中的 `dateOptions` 表示当前规则窗口内顾客可切换查看的日期集合；至少应覆盖“今天起至 `advanceOpenDays` 上限”的未来日期窗口，而不是只返回当天。
- `calendarDays` 用于顾客端月历组件渲染，至少覆盖当前窗口内顾客应看到的日期状态；日期级 `status / reasonCode / reasonText` 不得由前端自行推断。
- `selectedDate` 表示本次 `items` 对应的日期；若请求未传 `date`，后端应自行选择默认日期并返回。
- `status=active` 表示前端可点击选择；`status=disabled` 表示前端需灰显且不可点击。
- `reasonCode` / `reasonText` 由后端直接提供，当前至少覆盖：`AVAILABLE`、`DATE_CLOSED`、`DATE_OUT_OF_RANGE`、`SLOT_OCCUPIED`；前端不得自行硬编码原因文案替代。
- 前端可直接把 `reasonText` 渲染为时间段卡片或月历日期格的辅助文案；当 `status=active` 且 `reasonText` 为空时，前端可显示“可预约”等正向提示。
- `date` 为可选；传值时必须为 `YYYY-MM-DD`。
- 返回结果需同时受 `advanceOpenDays`、`closedDates`、`dailySlots`、已批准预约占用影响。

## 7. 创建预约

### Request

- `POST /api/v1/appointments`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Customer-OpenId: <customer-openid>`

### Body

```json
{
  "customerName": "Lan",
  "phone": "13800000000",
  "appointmentDate": "2026-03-16",
  "timeSlot": "10:00-11:00",
  "note": "希望偏自然风"
}
```

### Field Rules

- 顾客身份优先从 Bearer session 读取；develop 环境允许从请求头 `X-Customer-OpenId` 兜底读取。
- `customerOpenId` 不允许作为 body 主身份字段；即使 body 中出现，也以服务端解析到的 session/header 身份为准。
- 必填：`appointmentDate`, `timeSlot`
- 选填联系字段：`customerName`, `phone`, `note`
- 不再要求 `serviceId`、`serviceName`、`artistId`、`artistName`。
- 当前服务端兼容读取历史请求里的 `date` 字段，并统一落库到预约日期字段。

### Success Response

```json
{
  "item": {
    "id": "apt-001",
    "customerOpenId": "openid-customer-001",
    "customerName": "Lan",
    "phone": "13800000000",
    "date": "2026-03-16",
    "timeSlot": "10:00-11:00",
    "note": "希望偏自然风",
    "status": "pending",
    "createdAt": "2026-03-16T10:00:00.000Z",
    "reviewedAt": null,
    "reviewedBy": null,
    "reviewNote": ""
  }
}
```

### Unauthorized Response

```json
{
  "error": "Customer unauthorized",
  "code": "CUSTOMER_UNAUTHORIZED"
}
```

### Validation Error Example

```json
{
  "error": "Invalid slot",
  "code": "INVALID_SLOT"
}
```

## 8. 获取我的预约

### Request

- `GET /api/v1/my/appointments`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Customer-OpenId: <customer-openid>`

### Response

```json
{
  "items": [
    {
      "id": "apt-001",
      "customerOpenId": "openid-customer-001",
      "customerName": "Lan",
      "phone": "13800000000",
      "date": "2026-03-16",
      "timeSlot": "10:00-11:00",
      "note": "希望偏自然风",
      "status": "approved",
      "createdAt": "2026-03-16T10:00:00.000Z",
      "reviewedAt": "2026-03-16T10:30:00.000Z",
      "reviewedBy": "staff-openid-v1",
      "reviewNote": "已确认档期"
    }
  ]
}
```

### Notes

- 不再支持手机号参数查询“我的预约”。
- 缺少有效 Bearer session 且 develop header 兜底不可用时，统一返回 `401 + CUSTOMER_UNAUTHORIZED`。

## 9. 店员读取预约规则

### Request

- `GET /api/v1/staff/booking-rules`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Response

```json
{
  "item": {
    "advanceOpenDays": 7,
    "closedDates": ["2026-03-20"],
    "dailySlots": [
      "10:00-11:00",
      "14:00-15:00"
    ],
    "updatedAt": "2026-03-16T09:00:00.000Z"
  }
}
```

### Notes

- 店员身份优先从 Bearer session 读取；develop 环境允许从 `X-Staff-OpenId` 兜底读取。
- 本地 UAT 默认可使用 `staff-openid-demo`；`NODE_ENV=production` 时 demo 店员默认关闭，必须通过 `STAFF_OPEN_IDS` 显式配置。
- 白名单外身份统一返回 `401 + STAFF_UNAUTHORIZED`。

## 10. 店员更新预约规则

### Request

- `PUT /api/v1/staff/booking-rules`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Body

```json
{
  "advanceOpenDays": 1,
  "closedDates": ["2026-03-20"],
  "dailySlots": [
    "09:30-10:30",
    "11:00-12:00"
  ]
}
```

### Rules

- `advanceOpenDays` 必须为非负整数。
- `closedDates` 中的日期必须为 `YYYY-MM-DD`。
- `dailySlots` 必须为合法时间段，且不允许重叠。

### Success Response

```json
{
  "item": {
    "advanceOpenDays": 1,
    "closedDates": ["2026-03-20"],
    "dailySlots": [
      "09:30-10:30",
      "11:00-12:00"
    ],
    "updatedAt": "2026-03-16T09:05:00.000Z"
  }
}
```

### Notes

- `PUT /api/v1/staff/booking-rules` 属于当前冻结契约的必选写接口；若运行环境缺失该路由，店员规则保存直接判定为回归缺陷。
- 保存成功后，顾客预约页再次请求 `GET /api/v1/availability` 时，应能看到未来日期窗口与时段结果随新规则生效。

## 11. 店员查看预约列表

### Request

- `GET /api/v1/staff/appointments`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Query

- `status`：可选；当未传时，默认返回完整预约数据集（覆盖 `pending` / `approved` / `rejected` 与历史预约），供店员月历聚合使用

### Response

```json
{
  "items": [
    {
      "id": "apt-001",
      "customerOpenId": "openid-customer-001",
      "customerName": "Lan",
      "phone": "13800000000",
      "date": "2026-03-16",
      "timeSlot": "10:00-11:00",
      "note": "希望偏自然风",
      "status": "pending",
      "createdAt": "2026-03-16T10:00:00.000Z",
      "reviewedAt": null,
      "reviewedBy": null,
      "reviewNote": ""
    }
  ]
}
```

### Notes

- 店员侧继续保留 `customerName` / `phone` 字段，便于识别顾客。
- 店员月历 / 月视图默认依赖该接口做聚合，因此未传 `status` 时不得再只返回 `pending`。
- 这份返回同时要能支撑两类前端展示：月历格中的顾客/状态摘要，以及选定日期后按 `timeSlot` 展开的具体预约明细，因此 `date`、`timeSlot`、`customerName`、`status` 不得缺失。

## 12. 店员查看预约详情

### Request

- `GET /api/v1/staff/appointments/:id`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Response

```json
{
  "item": {
    "id": "apt-001",
    "customerOpenId": "openid-customer-001",
    "customerName": "Lan",
    "phone": "13800000000",
    "date": "2026-03-16",
    "timeSlot": "10:00-11:00",
    "note": "希望偏自然风",
    "status": "pending",
    "createdAt": "2026-03-16T10:00:00.000Z",
    "reviewedAt": null,
    "reviewedBy": null,
    "reviewNote": ""
  }
}
```

## 13. 店员审核预约

### Request

- `POST /api/v1/staff/appointments/:id/review`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Body

```json
{
  "status": "approved",
  "reviewNote": "已确认档期"
}
```

### Rules

- `status` 仅允许：`approved` / `rejected`
- 兼容 `action=approve|reject` 到相同审核结果
- 店员身份优先使用 Bearer session；develop 环境可用 `X-Staff-OpenId` 兜底
- 该接口语义为“设置当前最终审核结果”，已审核预约允许再次修改状态
- 改为 `approved` 时需要再次校验 slot 是否已被其他已通过预约占用
- 改为 `rejected` 时，如当前记录原本为 `approved`，需立即释放该时段占用
- `reviewedAt` / `reviewedBy` / `reviewNote` 以最新一次审核操作覆盖

### Success Response

```json
{
  "item": {
    "id": "apt-001",
    "status": "approved",
    "reviewedAt": "2026-03-16T10:30:00.000Z",
    "reviewedBy": "staff-openid-v1",
    "reviewNote": "已确认档期"
  }
}
```

### Conflict Error Example

```json
{
  "error": "Slot occupied",
  "code": "SLOT_OCCUPIED"
}
```

### Notes

- 若请求把 `approved` 改回 `approved` 或把 `rejected` 改回 `rejected`，服务端可按幂等更新处理，但返回体仍以最新 `reviewedAt` / `reviewNote` 为准。
- 若改回 `approved` 时命中 slot 冲突，仍返回 `409 + SLOT_OCCUPIED`。
- V1 不强制返回 review history；如需追溯历史，后续再扩展操作日志。

## 14. 通用未授权返回

### Staff Unauthorized

```json
{
  "error": "Staff unauthorized",
  "code": "STAFF_UNAUTHORIZED"
}
```

### Customer Unauthorized

```json
{
  "error": "Customer unauthorized",
  "code": "CUSTOMER_UNAUTHORIZED"
}
```

### Session Unauthorized

```json
{
  "error": "Session unauthorized",
  "code": "SESSION_UNAUTHORIZED"
}
```
