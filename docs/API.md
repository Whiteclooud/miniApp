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
- `GET /api/v1/gallery/:id`
- `GET /api/v1/my/inspirations`
- `GET /api/v1/my/inspirations/:id`
- `POST /api/v1/my/inspirations`
- `PATCH /api/v1/my/inspirations/:id`
- `DELETE /api/v1/my/inspirations/:id`
- `GET /api/v1/availability`
- `POST /api/v1/uploads/images`
- `GET /api/v1/uploads/images/:filename`
- `DELETE /api/v1/uploads/images/:filename`
- `POST /api/v1/appointments`
- `GET /api/v1/my/appointments`
- `GET /api/v1/staff/booking-rules`
- `PUT /api/v1/staff/booking-rules`
- `POST /api/v1/staff/uploads/images`
- `GET /api/v1/staff/uploads/images/:filename`
- `GET /api/v1/staff/gallery`
- `GET /api/v1/staff/gallery/:id`
- `POST /api/v1/staff/gallery`
- `PATCH /api/v1/staff/gallery/:id`
- `DELETE /api/v1/staff/gallery/:id`
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
- 返图详情页使用 `GET /api/v1/gallery/:id` 单条读取，避免先拉取整份返图库；仅 `active` 内容对顾客可见。
- 顾客预约页显性展示“可约 + 不可约”时段与原因，供前端做卡片化选择和禁用提示。

## 本轮体验优化接口增补（2026-03-29）

- `GET /api/v1/gallery` 默认按 `publishedAt desc` 返回全部已发布返图；首页传 `limit=1`，按标签筛选可传 `tag`。
- `GalleryItem` 的 `description` 与 `publishedAt` 分别承载店员文字说明与顾客侧时间排序基准；详情页通过单条接口读取 `imageUrls`。
- “我的灵感”是顾客保存公共返图的个人关系资源，不复用店员返图 CRUD，也不允许顾客修改公共返图字段；顾客仅可维护自己的 `note`。
- “我的灵感”所有读写接口都按当前顾客身份做所有权过滤；Bearer session 优先且必须是 `customer` 角色，develop 才允许 `X-Customer-OpenId` 兜底。
- 店员返图维护链路由 `POST /api/v1/staff/uploads/images` 与 `GET/POST/PATCH/DELETE /api/v1/staff/gallery` 组成；上传与内容元数据分开管理。
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
- Bearer session 每次请求都会复核关联用户仍为 `ACTIVE`，且当前角色与 session 角色一致；用户被禁用或改角色后，旧 token 立即失效。
- 微信登录命中已禁用用户时返回 `401 + ACCOUNT_DISABLED`；登录不会自动把 `DISABLED` 账号恢复为 `ACTIVE`。
- 请求已带 Bearer token 但 token 无效、过期或已失效时，不会再降级使用 develop 的 OpenID header；顾客 / 店员接口分别返回 `CUSTOMER_UNAUTHORIZED` / `STAFF_UNAUTHORIZED`。
- 体验版 / 正式版必须使用 Bearer token；OpenID header 只保留给 develop 环境联调。

## 2. 顾客侧返图库

### 2.1 获取返图列表

#### Request

- `GET /api/v1/gallery`
- Query（可选）：
  - `limit=1`：首页仅取最近 1 条已发布返图
  - `tag=通勤`：仅返回包含该标签的返图；精确匹配、英文不区分大小写

#### Response

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

#### Notes

- 仅返回已发布且 `active` 的数据。
- `imageUrl` 为首页 / 列表封面图；`imageUrls` 为详情页多图数组。
- 若 `imageUrls` 缺失或为空，前端至少用 `imageUrl` 兜底展示详情。
- 默认按 `publishedAt desc` 排序；`sortOrder` 仅作为兼容或运营兜底字段。
- 首页调用时使用 `limit=1` 且只渲染首条内容；返图列表页默认读取全部已发布内容。
- 无可见数据时返回 `{ "items": [] }`，由前端进入 Empty 状态；运行时不合成 fallback 数据。
- 仓库提供 `npm --prefix apps/api run seed:gallery`，按固定 ID 幂等写入 Figma 的 `极光猫眼 / 奶茶跳色 / 法式细闪` 三个样例，且不删除已有返图。
- `limit` 不是正整数时返回 `400 + INVALID_LIMIT`；`tag` 超过 64 个字符时返回 `400 + INVALID_GALLERY_TAG`。

### 2.2 获取返图详情

#### Request

- `GET /api/v1/gallery/:id`
- 无需登录。

#### Response

```json
{
  "item": {
    "id": "gallery-aurora",
    "title": "极光猫眼",
    "imageUrl": "https://example.com/images/aurora-cat-eye-cover.jpg",
    "imageUrls": [
      "https://example.com/images/aurora-cat-eye-cover.jpg",
      "https://example.com/images/aurora-cat-eye-detail-1.jpg"
    ],
    "description": "偏通勤的极光猫眼，适合春夏。",
    "tags": ["猫眼", "通勤"],
    "publishedAt": "2026-03-29T10:00:00.000Z",
    "sortOrder": 1,
    "status": "active"
  }
}
```

#### Not Found

返图不存在或已下线时统一返回，不向顾客暴露草稿是否存在：

```json
{
  "error": "Gallery item not found",
  "code": "GALLERY_ITEM_NOT_FOUND"
}
```

### 2.3 查看我的灵感

“我的灵感”表示顾客保存的公共返图。它与 `GalleryItem` 分开存储，顾客不能通过这些接口修改或删除公共返图内容。

#### 获取列表

- `GET /api/v1/my/inspirations`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Customer-OpenId: <customer-openid>`
- Query（可选）：`limit`（默认 20，范围 1-50）、`cursor`（上一页 `pageInfo.nextCursor`；游标是不透明值，客户端不要自行拼装）

```json
{
  "items": [
    {
      "id": "clx-inspiration-001",
      "galleryItemId": "gallery-aurora",
      "note": "想做偏冷色的版本",
      "availability": "available",
      "createdAt": "2026-08-20T07:00:00.000Z",
      "updatedAt": "2026-08-20T07:00:00.000Z",
      "galleryItem": {
        "id": "gallery-aurora",
        "title": "极光猫眼",
        "imageUrl": "https://example.com/images/aurora-cat-eye-cover.jpg",
        "imageUrls": [
          "https://example.com/images/aurora-cat-eye-cover.jpg",
          "https://example.com/images/aurora-cat-eye-detail-1.jpg"
        ],
        "description": "偏通勤的极光猫眼，适合春夏。",
        "tags": ["猫眼", "通勤"],
        "publishedAt": "2026-03-29T10:00:00.000Z",
        "sortOrder": 1,
        "status": "active"
      }
    }
  ],
  "pageInfo": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

返图下线后，关系记录仍保留，但该条返回 `availability: "unavailable"` 且 `galleryItem: null`，便于前端展示失效空态并允许顾客删除。返图硬删除时，数据库外键会级联删除关系记录。

#### 获取详情

- `GET /api/v1/my/inspirations/:id`
- 需要顾客身份；`:id` 是“我的灵感”记录 ID，不是 `galleryItemId`。
- 成功响应为 `{ "item": MyInspirationItem }`，字段与列表项一致。

#### 创建 / 保存返图

- `POST /api/v1/my/inspirations`
- 需要顾客身份

```json
{
  "galleryItemId": "gallery-aurora",
  "note": "想做偏冷色的版本"
}
```

`note` 可省略或传空字符串，最多 2000 个字符；只允许保存当前仍为 `active` 的公共返图。成功返回 `201` 和 `{ "item": MyInspirationItem }`。同一顾客重复提交同一 `galleryItemId` 时幂等返回原记录，不覆盖已有 `note`。

#### 修改备注

- `PATCH /api/v1/my/inspirations/:id`
- 需要顾客身份

```json
{
  "note": "改成更适合短甲的长度"
}
```

当前仅允许修改 `note`；不允许传 `galleryItemId`、标题、图片、标签、状态等公共返图字段。成功返回 `200` 和 `{ "item": MyInspirationItem }`。

#### 删除

- `DELETE /api/v1/my/inspirations/:id`
- 需要顾客身份
- 成功返回 `200`：`{ "item": MyInspirationItem }`（删除前快照）

#### 错误码

- `401 + CUSTOMER_UNAUTHORIZED`：缺少有效顾客身份。
- `400 + INVALID_INSPIRATION_PAYLOAD`：请求体不是对象。
- `400 + INVALID_INSPIRATION_CREATE`：创建请求包含不支持的字段。
- `400 + INVALID_INSPIRATION_UPDATE`：修改请求包含不支持的字段或缺少 `note`。
- `400 + INVALID_INSPIRATION_GALLERY_ITEM_ID`：`galleryItemId` 不是非空字符串或超过 191 个字符。
- `400 + INVALID_INSPIRATION_NOTE`：`note` 不是字符串或超过 2000 个字符；传 `null` 时按空备注处理。
- `400 + INVALID_INSPIRATION_LIMIT`：`limit` 不是 1-50 的整数。
- `400 + INVALID_INSPIRATION_CURSOR`：分页游标无效或不属于当前顾客。
- `404 + GALLERY_ITEM_NOT_AVAILABLE`：目标返图不存在或已下线，不能新建保存记录。
- `404 + INSPIRATION_NOT_FOUND`：详情、修改或删除的记录不存在，或不属于当前顾客；跨顾客访问不会暴露资源存在性。

#### 前端接入

请求封装位于 `apps/weapp/services/appointment.js`，已提供 `listMyInspirations`、`getMyInspiration`、`createMyInspiration`、`updateMyInspiration`、`deleteMyInspiration`，全部使用 `auth: 'customer'`。`apps/weapp/pages/my-inspirations` 已接入这些 service：列表消费 `pageInfo` 做分页，详情按 `:id` 查询，顾客可修改备注或删除记录；`availability=unavailable` / `galleryItem=null` 会保留失效空态并允许删除。返图详情页的“保存到我的灵感”入口调用创建接口并支持填写备注。

## 3. 店员上传返图图片

### Request

- `POST /api/v1/staff/uploads/images`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`
- Content-Type：`multipart/form-data`
- FormData：字段名 `files`，支持一次上传多张图片

上传成功返回的 URL 可通过 `GET /api/v1/staff/uploads/images/:filename` 读取；读取接口不需要再次提交 multipart body。

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
- 鉴权先于 multipart body 解析；解析层默认最多接收 6 张、单张最多 5 MiB，可通过 `UPLOAD_MAX_FILES` / `UPLOAD_MAX_FILE_SIZE_BYTES` 调整。
- JPEG / PNG / WebP 会校验文件签名与声明类型一致，伪装或损坏的内容返回 `INVALID_IMAGE_FILE`。
- `400`：`UPLOAD_FILE_COUNT_EXCEEDED`、`INVALID_IMAGE_FILE`、`UNSUPPORTED_IMAGE_TYPE`。
- `413`：`UPLOAD_TOO_LARGE`；缺少有效店员身份时为 `401 + STAFF_UNAUTHORIZED`。

## 3.1 顾客上传预约参考图

### Request

- `POST /api/v1/uploads/images`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Customer-OpenId: <customer-openid>`
- Content-Type：`multipart/form-data`
- FormData：字段名 `files`，支持一次上传多张图片

### Response (`201`)

```json
{
  "items": [
    {
      "url": "https://example.com/api/v1/uploads/images/customer-<owner-hash>-<timestamp>-<random>.jpg"
    }
  ]
}
```

### Notes

- 图片读取路径为 `GET /api/v1/uploads/images/:filename`，用于预约表单、我的预约和店员预约明细展示。
- 顾客上传文件名包含由当前 OpenID 单向散列得到的归属前缀；前端删除尚未提交的顾客上传图时，调用下节的删除接口。
- 鉴权先于 multipart body 解析；解析层默认最多接收 6 张、单张最多 5 MiB，支持 JPEG / PNG / WebP。
- 服务端会校验文件签名与声明类型一致；部署可用 `UPLOAD_MAX_FILES` / `UPLOAD_MAX_FILE_SIZE_BYTES` 调整上传接口限制。
- `400`：`UPLOAD_FILE_COUNT_EXCEEDED`、`INVALID_IMAGE_FILE`、`UNSUPPORTED_IMAGE_TYPE`。
- `413`：`UPLOAD_TOO_LARGE`；缺少有效顾客身份时为 `401 + CUSTOMER_UNAUTHORIZED`。

### 3.2 顾客删除预约参考图

#### Request

- `DELETE /api/v1/uploads/images/:filename`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Customer-OpenId: <customer-openid>`
- 无请求体。

服务端仅允许删除当前顾客通过 `POST /api/v1/uploads/images` 上传的文件。前端只应在预约提交前移除图片时调用；预约创建成功后必须保留文件。返图库图片路径为 `/api/v1/staff/uploads/images/`，不属于此接口的删除范围。

#### Response (`200`)

```json
{
  "item": {
    "filename": "customer-<owner-hash>-<timestamp>-<random>.jpg"
  }
}
```

#### Errors

- `400 + INVALID_UPLOAD_FILENAME`：文件名为空、格式非法或包含目录穿越字符。
- `401 + CUSTOMER_UNAUTHORIZED`：缺少有效顾客身份。
- `403 + CUSTOMER_UPLOAD_FORBIDDEN`：目标不是当前顾客上传的文件，包括其他顾客文件和返图库文件。
- `404 + CUSTOMER_UPLOAD_NOT_FOUND`：当前顾客拥有该文件名，但文件已经不存在。
- 正式部署必须把 `/app/uploads`（宿主目录对应 `apps/api/uploads`）挂载到持久卷并纳入备份，或将上传实现替换为对象存储；否则容器重建后预约中的图片 URL 会失效。

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
  "publishedAt": "2026-03-29T10:00:00.000Z",
  "sortOrder": 1,
  "status": "active"
}
```

### Success Response (`201`)

```json
{
  "item": {
    "id": "gallery-aurora",
    "title": "极光猫眼",
    "imageUrl": "https://example.com/uploads/gallery/aurora-1.jpg",
    "imageUrls": [
      "https://example.com/uploads/gallery/aurora-1.jpg",
      "https://example.com/uploads/gallery/aurora-2.jpg"
    ],
    "description": "偏通勤的极光猫眼，适合春夏。",
    "tags": ["猫眼", "通勤"],
    "publishedAt": "2026-03-29T10:00:00.000Z",
    "sortOrder": 1,
    "status": "active",
    "createdBy": "staff-openid-demo"
  }
}
```

### Notes

- `imageUrl` 作为封面图；若未单独指定，前端 / 后端可约定默认取 `imageUrls[0]`。
- `publishedAt` 未传时，默认取创建时间。
- V1 默认创建即发布，不额外拆复杂审核流。

## 5. 店员查看 / 编辑 / 删除返图内容

### Request

- `GET /api/v1/staff/gallery`
- `GET /api/v1/staff/gallery/:id`
- `PATCH /api/v1/staff/gallery/:id`
- `DELETE /api/v1/staff/gallery/:id`
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
- `GET /api/v1/staff/gallery/:id` 可读取 `active` 或 `inactive` 内容，响应为 `{ "item": GalleryItem }`，并额外包含 `createdBy`。
- `PATCH /api/v1/staff/gallery/:id` 为字段级局部修改；未传字段保留原值，响应为 `{ "item": GalleryItem }`。
- `DELETE /api/v1/staff/gallery/:id` 硬删除返图元数据并返回删除前的 `{ "item": GalleryItem }`。图片可能被其他内容复用，因此不会自动删除上传目录中的文件。
- 单条读取、修改或删除不存在的 ID 时返回 `404 + GALLERY_ITEM_NOT_FOUND`。
- 缺少有效店员身份时返回 `401 + STAFF_UNAUTHORIZED`。
- 小程序 service 已提供 `listStaffGallery`、`getStaffGalleryDetail`、`createStaffGallery`、`updateStaffGallery`、`deleteStaffGallery`；所有方法使用 `auth: 'staff'`，ID 会先做 URI 编码。

### 创建 / 修改字段规则

- `title` 必填，去除首尾空格后长度为 1 至 191 个字符。
- `title`、`imageUrl` / `coverImageUrl`、`description`、`publishedAt`、`status` 传入时必须是字符串；服务端不会把布尔值或数字静默转换为文本。
- `imageUrl` 或 `coverImageUrl` 至少提供一个；未提供 `imageUrls` 时自动以封面组成单元素数组。
- `imageUrls`、`tags` 接受字符串数组；为兼容既有调用，也接受 JSON 数组字符串或逗号分隔字符串。
- `publishedAt` 必须是可解析的日期时间；未传时取当前时间。
- `sortOrder` 必须是整数，默认 `0`。
- `status` 仅允许 `active` 或 `inactive`，默认 `active`。

对应的 `400` 错误码：`INVALID_GALLERY_PAYLOAD`、`INVALID_GALLERY_TITLE`、`INVALID_GALLERY_IMAGE`、`INVALID_PUBLISHED_AT`、`INVALID_GALLERY_SORT_ORDER`、`INVALID_GALLERY_STATUS`。

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
  "note": "",
  "referenceImageUrls": [
    "https://example.com/api/v1/uploads/images/reference-1.jpg"
  ]
}
```

### Field Rules

- 顾客身份优先从 Bearer session 读取；develop 环境允许从请求头 `X-Customer-OpenId` 兜底读取。
- `customerOpenId` 不允许作为 body 主身份字段；即使 body 中出现，也以服务端解析到的 session/header 身份为准。
- 必填：`appointmentDate`, `timeSlot`
- 选填字段：`customerName`, `phone`, `note`, `referenceImageUrls`
- `referenceImageUrls` 必须是 HTTP(S) URL 字符串数组，最多 6 个；省略时保存为空数组。
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
    "note": "",
    "referenceImageUrls": [
      "https://example.com/api/v1/uploads/images/reference-1.jpg"
    ],
    "status": "pending",
    "createdAt": "2026-03-16T10:00:00.000Z",
    "reviewedAt": null,
    "reviewedBy": null,
    "reviewNote": ""
  }
}
```

参考图字段错误：

- `400 + INVALID_REFERENCE_IMAGE_URLS`：字段不是数组、存在空值、非字符串或非 HTTP(S) URL。
- `400 + REFERENCE_IMAGE_COUNT_EXCEEDED`：数组超过 6 个 URL。

### 前端接入顺序

1. 普通预约由顾客通过 `POST /api/v1/uploads/images` 上传 0 至 6 张图片，并把响应 URL 放入 `referenceImageUrls`。
2. 从返图详情点击“预约同款”时，路由只传 `galleryId`、`galleryTitle` 和当前选中图的 `referenceImageUrl`；预约页用该 URL 初始化参考图数组，不自动填写 `note`。
3. 顾客可继续新增、预览或移除图片。移除 `/api/v1/uploads/images/` 下的顾客上传图时同时调用删除接口；移除自动带入的 `/api/v1/staff/uploads/images/` 返图库图片时只更新表单，不删除图库文件。
4. 图片上传或删除期间禁止提交；提交开始后禁止继续增删，避免页面数组与已发送请求不一致。
5. 创建预约成功后保留已提交图片，不再调用删除接口。创建失败时保留当前表单，供顾客重试或主动删除图片。

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
      "referenceImageUrls": [
        "https://example.com/api/v1/uploads/images/reference-1.jpg"
      ],
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
- 创建响应、我的预约、店员预约列表和店员预约详情统一返回 `referenceImageUrls: string[]`。

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
    "weeklyOpenDays": [0, 1, 2, 3, 4, 5, 6],
    "sameDayCutoffTime": "",
    "minAdvanceHours": 0,
    "dateSlotOverrides": {},
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
  ],
  "weeklyOpenDays": [1, 2, 3, 4, 5],
  "sameDayCutoffTime": "18:00",
  "minAdvanceHours": 2,
  "dateSlotOverrides": {
    "2026-03-21": ["12:00-13:00"]
  }
}
```

### Rules

- `advanceOpenDays` 必须为非负整数。
- `closedDates` 中的日期必须为 `YYYY-MM-DD`。
- `dailySlots` 和每个 `dateSlotOverrides` 时段数组必须使用真实 `HH:mm-HH:mm` 时间，开始时间早于结束时间，且数组内不允许重叠。
- `weeklyOpenDays` 必须为至少包含一天的 `0-6` 整数数组（周日为 `0`）。
- `sameDayCutoffTime` 为空字符串或合法 `HH:mm`；`minAdvanceHours` 为非负整数。
- 请求体必须是 JSON 对象；显式传错数组/标量类型不会静默降级。

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
    "weeklyOpenDays": [1, 2, 3, 4, 5],
    "sameDayCutoffTime": "18:00",
    "minAdvanceHours": 2,
    "dateSlotOverrides": {
      "2026-03-21": ["12:00-13:00"]
    },
    "updatedAt": "2026-03-16T09:05:00.000Z"
  }
}
```

### Notes

- `PUT /api/v1/staff/booking-rules` 属于当前冻结契约的必选写接口；若运行环境缺失该路由，店员规则保存直接判定为回归缺陷。
- 保存成功后，顾客预约页再次请求 `GET /api/v1/availability` 时，应能看到未来日期窗口与时段结果随新规则生效。
- `400` 错误码：`INVALID_BOOKING_RULE_PAYLOAD`、`INVALID_ADVANCE_OPEN_DAYS`、`INVALID_CLOSED_DATE`、`INVALID_SLOT`、`INVALID_WEEKLY_OPEN_DAYS`、`INVALID_SAME_DAY_CUTOFF_TIME`、`INVALID_MIN_ADVANCE_HOURS`、`INVALID_DATE_SLOT_OVERRIDES`。

## 11. 店员查看预约列表

### Request

- `GET /api/v1/staff/appointments`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Query

- `status`：可选；允许 `pending` / `approved` / `rejected` / `cancelled` / `completed` / `no_show`。
- `keyword`：可选，按顾客姓名、手机号或顾客 OpenID 模糊匹配。
- `date`：可选，精确匹配 `YYYY-MM-DD`；与 `dateFrom` / `dateTo` 不同时使用时优先精确日期。
- `dateFrom`、`dateTo`：可选，按 `YYYY-MM-DD` 日期范围过滤。
- 当未传 `status` 时，默认返回完整预约数据集（覆盖全部状态与历史预约），供店员月历聚合使用。

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
      "referenceImageUrls": [
        "https://example.com/api/v1/uploads/images/reference-1.jpg"
      ],
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
- `400 + INVALID_STATUS`：status 不在允许集合内；`400 + INVALID_DATE` / `INVALID_DATE_FROM` / `INVALID_DATE_TO`：日期格式非法；`400 + INVALID_DATE_RANGE`：dateFrom 晚于 dateTo。
- `401 + STAFF_UNAUTHORIZED`：缺少有效店员身份或 Bearer session 角色不是店员。

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
    "referenceImageUrls": [
      "https://example.com/api/v1/uploads/images/reference-1.jpg"
    ],
    "status": "pending",
    "createdAt": "2026-03-16T10:00:00.000Z",
    "reviewedAt": null,
    "reviewedBy": null,
    "reviewNote": "",
    "cancelledAt": null,
    "cancelledBy": null,
    "cancelReason": "",
    "arrivalInstructions": null
  }
}
```

不存在的预约统一返回 `404 + APPOINTMENT_NOT_FOUND`；详情响应与列表项使用同一 `ApiAppointmentItem` 字段。

## 13. 店员审核 / 更新预约状态

### Request

- `POST /api/v1/staff/appointments/:id/review`
- `PATCH /api/v1/staff/appointments/:id/review`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Body

```json
{
  "status": "approved",
  "reviewNote": "已确认档期"
}
```

### Rules

- `status` 支持：`approved` / `rejected` / `cancelled` / `completed` / `no_show`；兼容 `canceled`、`no-show`、`noshow` 拼写。
- 也可用 `action=approve|reject|cancel|complete|no_show|mark_no_show`，但同一请求应只传 `status` 或 `action` 之一；当两者同时存在时以 `status` 为准。
- `reviewNote` 可省略，必须为字符串且不超过 2000 个字符。
- 请求体必须是 JSON 对象；数组/标量返回 `400 + INVALID_REVIEW_PAYLOAD`。
- 店员身份优先使用 Bearer session；develop 环境可用 `X-Staff-OpenId` 兜底
- 该接口语义为“设置当前最终审核结果”，已审核预约允许再次修改状态
- 改为 `approved` 时需要再次校验 slot 是否已被其他已通过预约占用
- 改为非 `approved` 状态时立即释放该时段占用；从 `cancelled` 恢复为其他状态时会清理取消元数据。
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
- `400` 错误码：`INVALID_REVIEW_PAYLOAD`、`INVALID_REVIEW_STATUS`、`INVALID_REVIEW_NOTE`；`404 + APPOINTMENT_NOT_FOUND`；`409 + SLOT_OCCUPIED`。
- 成功返回 `201`（POST）或 `200`（PATCH），格式均为 `{ "item": ReviewStaffAppointmentResultItem }`。

## 14. 店员协助改期

### Request

- `PATCH /api/v1/staff/appointments/:id/reschedule`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Body

```json
{
  "appointmentDate": "2026-03-18",
  "timeSlot": "14:00-15:00",
  "reviewNote": "店员协助改期"
}
```

也兼容历史字段 `date` 作为 `appointmentDate` 的别名。

### Rules / Errors

- 仅 `pending` 或 `approved` 预约可改期；否则 `400 + APPOINTMENT_NOT_RESCHEDULABLE`。
- 日期、时段必须符合当前预约规则（开放窗口、营业日、闭店日、特殊日期时段、当天截止、提前小时），否则返回 `400 + INVALID_APPOINTMENT_DATE`、`INVALID_SLOT` 或对应规则原因码。
- 目标时段已有其他 `approved` 预约时返回 `409 + SLOT_OCCUPIED`。
- 请求体必须是对象；数组/标量返回 `400 + INVALID_RESCHEDULE_PAYLOAD`；`reviewNote` 超长返回 `400 + INVALID_REVIEW_NOTE`。
- 成功返回 `200` 和完整 `{ "item": ApiAppointmentItem }`，并追加 `STAFF_RESCHEDULE` 审计日志。
- 目标预约不存在（含并发删除）返回 `404 + APPOINTMENT_NOT_FOUND`。

## 15. 店员查看预约操作日志

### Request

- `GET /api/v1/staff/appointments/:id/audit-logs`
- Header：体验版 / 正式版使用 `Authorization: Bearer <token>`；develop 可用 `X-Staff-OpenId: <staff-openid>`

### Response (`200`)

```json
{
  "items": [
    {
      "id": "audit-001",
      "appointmentId": "apt-001",
      "actorOpenId": "staff-openid-demo",
      "actorRole": "staff",
      "action": "STAFF_STATUS_UPDATE",
      "fromStatus": "pending",
      "toStatus": "approved",
      "fromDate": "2026-03-16",
      "toDate": "2026-03-16",
      "fromTimeSlot": "10:00-11:00",
      "toTimeSlot": "10:00-11:00",
      "note": "已确认档期",
      "createdAt": "2026-03-16T10:30:00.000Z"
    }
  ]
}
```

日志按 `createdAt desc` 返回，覆盖创建、顾客取消、店员状态更新与店员改期。不存在的预约返回 `404 + APPOINTMENT_NOT_FOUND`；缺少店员身份返回 `401 + STAFF_UNAUTHORIZED`。

## 16. 店员端前端接入

- `apps/weapp/pages/staff/rules/index.js` 首次进入调用 `listStaffRules()`，保存时把 `form` 映射为 `updateStaffRules()` 的完整规则对象；页面直接消费响应 `item` 的 `weeklyOpenDays`、`sameDayCutoffTime`、`minAdvanceHours`、`dateSlotOverrides`，并根据 `400` 错误码保留表单错误状态。
- `apps/weapp/pages/staff/gallery/index.js` 先调用 `uploadStaffGalleryImages(filePaths)` 获取图片 URL，再调用 `createStaffGallery()` 或 `updateStaffGallery(id, payload)` 保存元数据；列表使用 `listStaffGallery()`。详情/删除能力由 `getStaffGalleryDetail(id)` / `deleteStaffGallery(id)` 提供，ID 在 service 层 URI 编码；上传、保存、列表分别保留 loading / submitting / empty / error 状态。
- `apps/weapp/pages/staff/appointments/index.js` 默认调用 `listStaffAppointments()` 获取全量数据并聚合月历；状态筛选、关键词/日期筛选通过同一 service 的 query 参数重新请求。详情可调用 `getStaffAppointmentDetail(id)`，审核使用 `reviewStaffAppointment(id, { status })`，改期使用 `rescheduleStaffAppointment(id, { appointmentDate, timeSlot, reviewNote })`，操作日志使用 `listStaffAppointmentAuditLogs(id)`；前端应把 `SLOT_OCCUPIED`、规则原因码、`APPOINTMENT_NOT_RESCHEDULABLE` 映射为可重试的业务提示。
- 三个页面均使用 `auth: 'staff'`：正式环境由 Bearer session 提供身份，develop 才允许 `X-Staff-OpenId` 兜底；`STAFF_UNAUTHORIZED` 应进入 Unauthorized 状态，不应静默显示空列表。

## 17. 通用未授权返回

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

### Response Shapes (`200`)

- 列表：`{ "items": [StaffGalleryItem] }`
- 单条详情：`{ "item": StaffGalleryItem }`
- 修改：`{ "item": StaffGalleryItem }`
- 删除：`{ "item": StaffGalleryItem }`，返回删除前快照

`StaffGalleryItem` 与创建成功响应中的 `item` 一致，包含 `createdBy`；顾客侧 `GalleryItem` 不包含该字段。

### Session Unauthorized

```json
{
  "error": "Session unauthorized",
  "code": "SESSION_UNAUTHORIZED"
}
```
