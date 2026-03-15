# API

## Base URL

开发环境：`http://127.0.0.1:3000`

## 当前冻结契约（2026-03-14）

V1 当前只允许以下接口对外使用：

- `GET /health`
- `GET /api/v1/gallery`
- `GET /api/v1/availability`
- `POST /api/v1/appointments`
- `GET /api/v1/my/appointments`
- `GET /api/v1/staff/appointments`
- `GET /api/v1/staff/appointments/:id`
- `POST /api/v1/staff/appointments/:id/review`
- `PATCH /api/v1/staff/appointments/:id/review`

以下旧接口不再属于当前契约，前后端都禁止继续依赖：

- `GET /api/v1/services`
- `GET /api/v1/hot-styles`
- `GET /api/v1/artists`
- 旧版 `GET /api/v1/appointments`

## 1. 健康检查

### Request

- `GET /health`

### Response

```json
{
  "ok": true,
  "service": "miniapp-server",
  "timestamp": "2026-03-14T00:00:00.000Z"
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
      "imageUrl": "https://example.com/images/aurora-cat-eye.jpg",
      "tags": ["猫眼", "通勤", "热门"],
      "priceFrom": 198,
      "serviceId": "svc-design",
      "serviceName": "轻奢款式设计",
      "ctaText": "预约同款",
      "sortOrder": 1,
      "status": "active"
    }
  ]
}
```

## 3. 获取可预约时段

### Request

- `GET /api/v1/availability?date=2026-03-16`

### Response

```json
{
  "items": [
    {
      "date": "2026-03-16",
      "timeSlot": "10:00-11:00",
      "status": "active"
    }
  ]
}
```

### Notes

- 仅返回当前仍可预约的时段。
- `date` 为可选；传值时必须为 `YYYY-MM-DD`。

## 4. 创建预约

### Request

- `POST /api/v1/appointments`
- Header：`X-Customer-OpenId: <customer-openid>`

### Body

```json
{
  "customerName": "Lan",
  "phone": "13800000000",
  "serviceId": "svc-classic",
  "serviceName": "经典纯色美甲",
  "artistId": "artist-luna",
  "artistName": "Luna",
  "appointmentDate": "2026-03-16",
  "timeSlot": "10:00-11:00",
  "note": "希望偏自然风"
}
```

### Field Rules

- 顾客身份只从请求头 `X-Customer-OpenId` 读取。
- `customerOpenId` 不允许作为 body 主身份字段；即使 body 中出现，也以后端读取到的 header 为准。
- 必填：`serviceId`, `serviceName`, `appointmentDate`, `timeSlot`
- 选填联系字段：`customerName`, `phone`, `note`
- 选填偏好字段：`artistId`, `artistName`
- 当前服务端兼容读取历史请求里的 `date` 字段，并统一落库到预约日期字段。

### Success Response

```json
{
  "item": {
    "id": "apt-001",
    "customerOpenId": "openid-customer-001",
    "customerName": "Lan",
    "phone": "13800000000",
    "serviceId": "svc-classic",
    "serviceName": "经典纯色美甲",
    "artistId": "artist-luna",
    "artistName": "Luna",
    "date": "2026-03-16",
    "timeSlot": "10:00-11:00",
    "note": "希望偏自然风",
    "status": "pending",
    "createdAt": "2026-03-14T10:00:00.000Z",
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
      "serviceId": "svc-classic",
      "serviceName": "经典纯色美甲",
      "artistId": "artist-luna",
      "artistName": "Luna",
      "date": "2026-03-16",
      "timeSlot": "10:00-11:00",
      "note": "希望偏自然风",
      "status": "approved",
      "createdAt": "2026-03-14T10:00:00.000Z",
      "reviewedAt": "2026-03-14T10:30:00.000Z",
      "reviewedBy": "staff-openid-v1",
      "reviewNote": "已确认档期"
    }
  ]
}
```

### Notes

- 不再支持手机号参数查询“我的预约”。
- 缺少 `X-Customer-OpenId` 时统一返回 `401 + CUSTOMER_UNAUTHORIZED`。

## 6. 店员查看预约列表

### Request

- `GET /api/v1/staff/appointments`
- Header：`X-Staff-OpenId: <staff-openid>`

### Response

```json
{
  "items": [
    {
      "id": "apt-001",
      "customerOpenId": "openid-customer-001",
      "customerName": "Lan",
      "phone": "13800000000",
      "serviceId": "svc-classic",
      "serviceName": "经典纯色美甲",
      "artistId": "artist-luna",
      "artistName": "Luna",
      "date": "2026-03-16",
      "timeSlot": "10:00-11:00",
      "note": "希望偏自然风",
      "status": "pending",
      "createdAt": "2026-03-14T10:00:00.000Z",
      "reviewedAt": null,
      "reviewedBy": null,
      "reviewNote": ""
    }
  ]
}
```

### Notes

- 店员侧继续保留 `customerName` / `phone` 字段，便于识别顾客。

## 7. 店员审核预约

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
