# API

## Base URL

开发环境：`http://127.0.0.1:3100`

## 当前基线调整（2026-03-24）

- `apps/api` 已通过页面验收，当前对外开发基线切到 `http://127.0.0.1:3100`。
- 旧 `apps/server` 相关脚本、目录与过渡文档进入清理范围，不再作为默认后端口径。
- `GET /api/v1/availability` 需补充“规则窗口日期”表达，不能只让顾客看到当天。
- `GET /api/v1/staff/appointments` 在默认店员工作台视图下需覆盖完整预约数据，而不是只返回 `pending`。

## 当前冻结契约（2026-03-16 复核）

V1 当前只允许以下接口对外使用：

- `GET /health`
- `GET /api/v1/gallery`
- `GET /api/v1/availability`
- `POST /api/v1/appointments`
- `GET /api/v1/my/appointments`
- `GET /api/v1/staff/booking-rules`
- `PUT /api/v1/staff/booking-rules`
- `GET /api/v1/staff/appointments`
- `GET /api/v1/staff/appointments/:id`
- `POST /api/v1/staff/appointments/:id/review`
- `PATCH /api/v1/staff/appointments/:id/review`

以下旧接口不再属于当前契约，前后端都禁止继续依赖：

- `GET /api/v1/services`
- `GET /api/v1/hot-styles`
- `GET /api/v1/artists`
- 旧版 `GET /api/v1/appointments`

## 本轮 UAT / 集成备注（2026-03-19）

- 当前页面 UAT 已确认顾客主链路可跑通，但 staff 侧存在环境一致性问题：文档与 UAT 使用 `staff-openid-demo`，当前统一验收基线服务默认白名单仍需与之对齐，否则 `/api/v1/staff/*` 会返回 `401 + STAFF_UNAUTHORIZED`。
- SQLite 历史库需兼容 `appointments.appointment_date` 旧列；若沿用本地老库启动失败，服务端需在启动时自动迁移到当前 `date` 字段模型。
- 返图接口在不新增详情接口的前提下，扩展 `imageUrls` 供前端详情页展示多图。
- 顾客预约页新增显性时间段选择体验：`GET /api/v1/availability?date=...` 对当前日期应返回“可约 + 不可约”时段与原因，供前端做卡片化选择和禁用提示。

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

## 2. 获取首页图库

### Request

- `GET /api/v1/gallery`

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
      "tags": ["猫眼", "通勤", "热门"],
      "sortOrder": 1,
      "status": "active"
    }
  ]
}
```

### Notes

- 仅返回 `active` 数据。
- `imageUrl` 为首页封面图；`imageUrls` 为详情页多图数组。
- 若 `imageUrls` 缺失或为空，前端至少用 `imageUrl` 兜底展示详情。
- 前端按 `sortOrder` 稳定展示。

## 3. 获取可预约时段

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
- `selectedDate` 表示本次 `items` 对应的日期；若请求未传 `date`，后端应自行选择默认日期并返回。
- `status=active` 表示前端可点击选择；`status=disabled` 表示前端需灰显且不可点击。
- `reasonCode` / `reasonText` 由后端直接提供，当前至少覆盖：`AVAILABLE`、`DATE_CLOSED`、`DATE_OUT_OF_RANGE`、`SLOT_OCCUPIED`；前端不得自行硬编码原因文案替代。
- 前端可直接把 `reasonText` 渲染为时间段卡片的副文案；当 `status=active` 且 `reasonText` 为空时，前端可显示“可预约”等正向提示。
- `date` 为可选；传值时必须为 `YYYY-MM-DD`。
- 返回结果需同时受 `advanceOpenDays`、`closedDates`、`dailySlots`、已批准预约占用影响。

## 4. 创建预约

### Request

- `POST /api/v1/appointments`
- Header：`X-Customer-OpenId: <customer-openid>`

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

- 顾客身份只从请求头 `X-Customer-OpenId` 读取。
- `customerOpenId` 不允许作为 body 主身份字段；即使 body 中出现，也以后端读取到的 header 为准。
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

## 5. 获取我的预约

### Request

- `GET /api/v1/my/appointments`
- Header：`X-Customer-OpenId: <customer-openid>`

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
- 缺少 `X-Customer-OpenId` 时统一返回 `401 + CUSTOMER_UNAUTHORIZED`。

## 6. 店员读取预约规则

### Request

- `GET /api/v1/staff/booking-rules`
- Header：`X-Staff-OpenId: <staff-openid>`

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

- 店员身份口径固定为 `X-Staff-OpenId`。
- 本地 UAT 默认白名单至少包含 `staff-openid-demo`；若环境变量额外配置其他值，应与默认值共同生效。
- 白名单外身份统一返回 `401 + STAFF_UNAUTHORIZED`。

## 7. 店员更新预约规则

### Request

- `PUT /api/v1/staff/booking-rules`
- Header：`X-Staff-OpenId: <staff-openid>`

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

## 8. 店员查看预约列表

### Request

- `GET /api/v1/staff/appointments`
- Header：`X-Staff-OpenId: <staff-openid>`

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

## 9. 店员查看预约详情

### Request

- `GET /api/v1/staff/appointments/:id`
- Header：`X-Staff-OpenId: <staff-openid>`

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

## 10. 店员审核预约

### Request

- `POST /api/v1/staff/appointments/:id/review`
- Header：`X-Staff-OpenId: <staff-openid>`

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
- 店员身份口径固定为 `X-Staff-OpenId`
- 审核通过时需要再次校验 slot 是否已被占用
- 已审核预约不得重复审核

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

### Repeat Review Error Example

```json
{
  "error": "Appointment already reviewed",
  "code": "APPOINTMENT_ALREADY_REVIEWED"
}
```

## 11. 通用未授权返回

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
