# API

## Base URL

开发环境：`http://127.0.0.1:3000`

## 接口冻结说明（2026-03-14）

- 前端联调口径仅允许：`/api/v1/gallery`、`/api/v1/availability`、`POST /api/v1/appointments`、`GET /api/v1/my/appointments`、`/api/v1/staff/*`
- `/api/v1/services` 与旧版 `GET /api/v1/appointments` 不在当前版本契约内，视为废弃
- “页面能打开”不等于“接口已跑通”，必须以本文件接口响应为验收依据

---

## 1. 健康检查

### Request
- `GET /health`

### Response

```json
{
  "ok": true,
  "service": "miniapp-server",
  "timestamp": "2026-03-12T00:00:00.000Z"
}
```

---

## 2. 获取返图展示列表

### Request
- `GET /api/v1/gallery`

### Response

```json
{
  "items": [
    {
      "id": "gallery-001",
      "imageUrl": "https://example.com/nails/rose-cat-eye.jpg",
      "title": "玫瑰猫眼",
      "tags": ["猫眼", "温柔", "春日"],
      "description": "适合日常和约会场景的温柔风格",
      "sortOrder": 1,
      "status": "active",
      "createdAt": "2026-03-12T00:00:00.000Z"
    }
  ]
}
```

### Notes
- 仅返回 `status=active` 数据
- 用于首页返图 / 案例展示

---

## Staff 鉴权约定（V1）

适用于所有 `/api/v1/staff/*` 接口。

### Request Header
- `X-Staff-OpenId`: 店员在小程序登录后取得的 OpenID

### Rules
- 请求 staff 接口时必须携带该请求头
- 后端以白名单方式校验是否允许访问
- 顾客端接口不依赖该请求头

### Unauthorized Response

HTTP Status: `401`

```json
{
  "error": "Staff unauthorized",
  "code": "STAFF_UNAUTHORIZED"
}
```

说明：
- 这是 V1 最小落地约定，用于支撑“同一小程序承载顾客端与店员端”。
- 后续若升级为更正式的登录态，可替换鉴权实现，但保持 staff 接口语义不变。
- 所有 `/api/v1/staff/*` 接口未授权时统一返回该状态码与结构，不在单个接口各自发明错误格式。

---

## 顾客身份约定（V1）

### Request Header
- `X-Customer-OpenId`: 顾客在小程序登录后取得的 OpenID（开发环境可先用模拟值）

### Rules
- `POST /api/v1/appointments`、`GET /api/v1/my/appointments` 必须携带该请求头
- 后端以 OpenID 作为“我的预约”唯一身份查询条件
- 手机号、姓名仅作为联系补充信息，不再作为主身份键

### Unauthorized Response

HTTP Status: `401`

```json
{
  "error": "Customer unauthorized",
  "code": "CUSTOMER_UNAUTHORIZED"
}
```

---

## 3. 获取当前预约规则

### Request
- `GET /api/v1/staff/booking-rules`

### Response

```json
{
  "item": {
    "id": "rule-default",
    "advanceOpenDays": 2,
    "closedDates": ["2026-03-18", "2026-03-25"],
    "dailySlots": [
      { "start": "10:00", "end": "11:30" },
      { "start": "14:00", "end": "15:30" },
      { "start": "16:00", "end": "17:30" }
    ],
    "updatedAt": "2026-03-12T00:00:00.000Z"
  }
}
```

---

## 4. 更新预约规则

### Request
- `PUT /api/v1/staff/booking-rules`

### Body

```json
{
  "advanceOpenDays": 2,
  "closedDates": ["2026-03-18", "2026-03-25"],
  "dailySlots": [
    { "start": "10:00", "end": "11:30" },
    { "start": "14:00", "end": "15:30" },
    { "start": "16:00", "end": "17:30" }
  ]
}
```

### Field Rules
- `advanceOpenDays`: 必填，整数，`>= 0`
- `closedDates`: 必填，数组，元素格式 `YYYY-MM-DD`
- `dailySlots`: 必填，数组，至少 1 项
- `dailySlots[*].start` / `end`: 必填，格式 `HH:mm`
- 单个时间段的 `start` 必须早于 `end`
- 时间段之间不得重叠

### Success Response

```json
{
  "item": {
    "id": "rule-default",
    "advanceOpenDays": 2,
    "closedDates": ["2026-03-18", "2026-03-25"],
    "dailySlots": [
      { "start": "10:00", "end": "11:30" },
      { "start": "14:00", "end": "15:30" },
      { "start": "16:00", "end": "17:30" }
    ],
    "updatedAt": "2026-03-12T01:00:00.000Z"
  }
}
```

---

## 5. 获取顾客可预约日期与时间段

### Request
- `GET /api/v1/availability?month=2026-03`

### Response

```json
{
  "month": "2026-03",
  "advanceOpenDays": 2,
  "closedDates": ["2026-03-18", "2026-03-25"],
  "days": [
    {
      "date": "2026-03-16",
      "bookable": true,
      "slots": [
        { "label": "10:00-11:30", "value": "10:00-11:30", "bookable": true },
        { "label": "14:00-15:30", "value": "14:00-15:30", "bookable": true }
      ]
    },
    {
      "date": "2026-03-18",
      "bookable": false,
      "slots": []
    }
  ]
}
```

### Notes
- 后端负责根据规则和已批准预约计算 `bookable`
- 顾客端不能自行拼接业务规则

---

## 6. 创建预约申请

### Request
- `POST /api/v1/appointments`

### Body

```json
{
  "customerName": "Lan",
  "phone": "13800000000",
  "appointmentDate": "2026-03-16",
  "timeSlot": "14:00-15:30",
  "note": "想做温柔通勤款"
}
```

> 身份字段 `customerOpenId` 不放在 body 中，由请求头 `X-Customer-OpenId` 传入并由后端写入。

### Field Rules
- 请求头必填：`X-Customer-OpenId`
- Body 必填：`appointmentDate`, `timeSlot`
- Body 选填：`customerName`, `phone`, `note`
- `appointmentDate` 必须为当前可预约日期
- `timeSlot` 必须为该日期当前可申请时间段
- 创建成功后状态默认写入 `pending`

### Success Response

```json
{
  "item": {
    "id": "apt-001",
    "customerOpenId": "oAbCdEf123456",
    "customerName": "Lan",
    "phone": "13800000000",
    "appointmentDate": "2026-03-16",
    "timeSlot": "14:00-15:30",
    "note": "想做温柔通勤款",
    "status": "pending",
    "reviewNote": "",
    "createdAt": "2026-03-12T02:00:00.000Z",
    "reviewedAt": null
  }
}
```

### Error Response

HTTP Status: `400`

```json
{
  "error": "Invalid appointment slot",
  "code": "INVALID_SLOT"
}
```

---

## 7. 获取顾客自己的预约记录

### Request
- `GET /api/v1/my/appointments`
- Header: `X-Customer-OpenId: oAbCdEf123456`

### Response

```json
{
  "items": [
    {
      "id": "apt-001",
      "customerOpenId": "oAbCdEf123456",
      "customerName": "Lan",
      "phone": "13800000000",
      "appointmentDate": "2026-03-16",
      "timeSlot": "14:00-15:30",
      "note": "想做温柔通勤款",
      "status": "pending",
      "reviewNote": "",
      "createdAt": "2026-03-12T02:00:00.000Z",
      "reviewedAt": null
    }
  ]
}
```

### Notes
- V1 以 OpenID 作为“我的预约”唯一查询条件
- 手机号仅用于联系，不承担身份主键职责

---

## 8. 获取店员侧预约列表

### Request
- `GET /api/v1/staff/appointments?status=pending`

### Response

```json
{
  "items": [
    {
      "id": "apt-001",
      "customerOpenId": "oAbCdEf123456",
      "customerName": "Lan",
      "phone": "13800000000",
      "appointmentDate": "2026-03-16",
      "timeSlot": "14:00-15:30",
      "note": "想做温柔通勤款",
      "status": "pending",
      "reviewNote": "",
      "createdAt": "2026-03-12T02:00:00.000Z",
      "reviewedAt": null
    }
  ]
}
```

---

## 9. 审核预约申请

### Request
- `POST /api/v1/staff/appointments/:id/review`

### Body

```json
{
  "action": "approve",
  "reviewNote": "请准时到店"
}
```

### Field Rules
- `action`: 必填，枚举：`approve` / `reject`
- `reviewNote`: 选填，字符串
- 若 `action=approve`，需再次校验该时间段是否仍可被批准
- 同一预约不可重复审核

### Success Response

```json
{
  "item": {
    "id": "apt-001",
    "status": "approved",
    "reviewNote": "请准时到店",
    "reviewedAt": "2026-03-12T03:00:00.000Z"
  }
}
```

### Conflict Response

HTTP Status: `409`

```json
{
  "error": "Slot already occupied",
  "code": "SLOT_OCCUPIED"
}
```

### Repeat Review Response

HTTP Status: `409`

```json
{
  "error": "Appointment already reviewed",
  "code": "ALREADY_REVIEWED"
}
```

---

## 数据对象总结

### GalleryItem
- `id`
- `imageUrl`
- `title`
- `tags`
- `description`
- `sortOrder`
- `status`
- `createdAt`

### BookingRule
- `id`
- `advanceOpenDays`
- `closedDates`
- `dailySlots`
- `updatedAt`

### Appointment
- `id`
- `customerOpenId`
- `customerName`
- `phone`
- `appointmentDate`
- `timeSlot`
- `note`
- `status`
- `reviewNote`
- `createdAt`
- `reviewedAt`

---

## 接口影响总结

- 保留：`GET /health`
- 新增：`GET /api/v1/gallery`
- 新增：`GET /api/v1/availability`
- 新增：`POST /api/v1/appointments`
- 新增：`GET /api/v1/my/appointments`
- 新增：`GET /api/v1/staff/booking-rules`
- 新增：`PUT /api/v1/staff/booking-rules`
- 新增：`GET /api/v1/staff/appointments`
- 新增：`POST /api/v1/staff/appointments/:id/review`
