# API

## Base URL

开发环境：`http://127.0.0.1:3000`

## 1. 健康检查

### Request

- `GET /health`

### Response

```json
{
  "ok": true,
  "service": "miniapp-server",
  "timestamp": "2026-03-11T00:00:00.000Z"
}
```

## 2. 获取服务项目

### Request

- `GET /api/v1/services`

### Response

```json
{
  "items": [
    {
      "id": "svc-classic",
      "name": "经典纯色美甲",
      "durationMinutes": 60,
      "price": 168,
      "description": "适合日常通勤的基础款"
    }
  ]
}
```

## 3. 获取热门款式推荐

### Request

- `GET /api/v1/hot-styles`

### Response

```json
{
  "items": [
    {
      "id": "style-aurora",
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

### Notes

- 仅返回 `status=active` 的推荐款式。
- `serviceId` / `serviceName` 用于前端点击后带入预约流程。

## 4. 获取美甲师列表

### Request

- `GET /api/v1/artists`

### Response

```json
{
  "items": [
    {
      "id": "artist-luna",
      "name": "Luna",
      "avatarUrl": "https://example.com/avatars/luna.jpg",
      "title": "高级美甲师",
      "specialties": ["猫眼", "法式", "轻奢设计"],
      "status": "active",
      "sortOrder": 1
    }
  ]
}
```

### Notes

- 仅返回可预约的美甲师。
- 如前端需支持“无偏好/到店安排”，由前端本地补充一个兜底选项，不单独由接口返回。

## 5. 获取预约列表

### Request

- `GET /api/v1/appointments`

### Response

```json
{
  "items": [
    {
      "id": "apt-001",
      "customerName": "Lan",
      "phone": "13800000000",
      "serviceId": "svc-classic",
      "serviceName": "经典纯色美甲",
      "artistId": "artist-luna",
      "artistName": "Luna",
      "date": "2026-03-12",
      "timeSlot": "14:00-15:00",
      "note": "希望偏自然风",
      "status": "pending",
      "createdAt": "2026-03-11T09:00:00.000Z"
    }
  ]
}
```

### Notes

- 当用户选择“无偏好/到店安排”时，`artistId` / `artistName` 可为空字符串或 `null`，前后端需统一一种实现方式。

## 6. 创建预约

### Request

- `POST /api/v1/appointments`

### Body

```json
{
  "customerName": "Lan",
  "phone": "13800000000",
  "serviceId": "svc-classic",
  "serviceName": "经典纯色美甲",
  "artistId": "artist-luna",
  "artistName": "Luna",
  "date": "2026-03-12",
  "timeSlot": "14:00-15:00",
  "note": "希望偏自然风"
}
```

### Field Rules

- 必填：`customerName`, `phone`, `serviceId`, `serviceName`, `date`, `timeSlot`
- 选填：`artistId`, `artistName`, `note`
- `artistId` / `artistName` 为空时表示“无偏好/到店安排”

### Success Response

```json
{
  "item": {
    "id": "apt-002",
    "customerName": "Lan",
    "phone": "13800000000",
    "serviceId": "svc-classic",
    "serviceName": "经典纯色美甲",
    "artistId": "artist-luna",
    "artistName": "Luna",
    "date": "2026-03-12",
    "timeSlot": "14:00-15:00",
    "note": "希望偏自然风",
    "status": "pending",
    "createdAt": "2026-03-11T09:05:00.000Z"
  }
}
```

### Error Response

```json
{
  "error": "Missing required fields",
  "missing": ["customerName", "phone"]
}
```

## 接口影响总结

- 新增接口：`GET /api/v1/hot-styles`
- 新增接口：`GET /api/v1/artists`
- 扩展接口：`GET /api/v1/appointments`
- 扩展接口：`POST /api/v1/appointments`
- 保持不变：`GET /api/v1/services`, `GET /health`
