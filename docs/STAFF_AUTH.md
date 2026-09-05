# 身份、角色与店员管理

## 当前方案

正式环境统一使用：

```text
wx.login
  -> POST /api/v1/auth/wechat-login
  -> 服务端 code2Session 获取可信 OpenID
  -> （可选）服务端使用 wx.getPhoneNumber 的 phoneCode 调用 getuserphonenumber
  -> 查询 users / staff_members
  -> 返回业务 Bearer session 与当前角色
  -> 小程序保持顾客首页，按 primaryRole / permissions 在“我的”显示后台入口
```

OpenID 只由服务端向微信换取。昵称、头像、手机号、页面参数和客户端提交的
`role` 都不能作为授权依据。

手机号授权是顾客侧的可选补充资料能力，不改变 OpenID 主身份。后续如在页面提供
`open-type="getPhoneNumber"` 按钮，应在用户主动授权后将一次性 `phoneCode` 交给
服务端调用微信接口换取手机号并写入 `users.phone`；用户拒绝时仍可使用普通微信登录。

`X-Customer-OpenId` / `X-Staff-OpenId` 仅保留给 develop 联调；体验版和正式版
必须使用 Bearer session。

## 角色模型

角色采用可叠加模型。所有正常账号都拥有顾客能力，店员身份是在此基础上的附加权限。

| 角色 | 默认进入 | 权限 |
| --- | --- | --- |
| `customer` | 顾客首页 | 返图、灵感、预约、我的预约、顾客图片 |
| `staff` | 顾客首页；“我的”显示后台入口 | 顾客权限 + 预约查看/审核/改期 + 返图管理 |
| `owner` | 顾客首页；“我的”显示后台入口 | 店员权限 + 预约规则 + 店员邀请、查看和移除 |
| `system_admin` | 顾客首页；“我的”显示后台入口 | 店主权限 + 邀请/移除店主 + 系统维护权限 |

店主不能：

- 授予或移除店主、系统管理员；
- 移除自己；
- 移除最后一位有效店主。

系统管理员不能通过小程序接口创建。首次身份只能通过服务端可信配置
`SYSTEM_ADMIN_OPEN_IDS` 引导，防止任何业务用户自行提权。

## 数据来源

- `users`：微信账号、状态、系统管理员标记。
- `staff_members`：店员/店主成员关系及启用、停用审计字段。
- `staff_invitations`：只保存邀请码 SHA-256 哈希、目标角色、状态和有效期。
- `auth_sessions`：只保存业务 token 哈希；权限在每次请求时按数据库当前状态计算。

成员被移除后不物理删除，记录转为 `DISABLED`。旧 token 仍可用于顾客功能，但
会立即失去店员权限，不需要等待 session 到期。

## 权限标识

```text
staff:appointments:read
staff:appointments:write
staff:gallery:read
staff:gallery:write
staff:booking-rules:read
staff:booking-rules:write
staff:manage
staff:manage:owners
system:manage
```

控制器按具体 permission 校验。前端的显示/隐藏只改善体验，不能代替后端鉴权。

## 首次引导

生产首次部署配置：

```env
SYSTEM_ADMIN_OPEN_IDS="你的真实 OpenID"
OWNER_OPEN_IDS="首位店主真实 OpenID"
```

登录时服务端会幂等写入对应数据库角色。旧部署中的 `STAFF_OPEN_IDS` 仍作为
`OWNER_OPEN_IDS` 的兼容来源，方便平滑迁移；它不再是日常请求的权限白名单。

取得首次 OpenID 的推荐流程：

1. 用户先用体验版完成一次微信登录。
2. 从受控数据库管理工具查询 `users.open_id`，不要从客户端提交的值采信身份。
3. 写入生产密钥管理/环境变量并重新登录。
4. 首次店主和系统管理员建立后，普通店员全部通过一次性邀请加入。

系统管理员降权不开放业务接口。需要撤销某个系统管理员时，运维人员必须先把其
OpenID 从 `SYSTEM_ADMIN_OPEN_IDS` 移除，再通过受控数据库管理工具把对应
`users.system_role` 改为 `USER`。服务端逐请求读取当前系统角色，因此已有 token
会立即失去系统管理员权限；如果只改数据库但没有移出环境变量，该账号下次登录
会再次被可信引导为系统管理员。

## 邀请流程

1. 店主创建 `staff` 邀请；系统管理员还可以创建 `owner` 邀请。
2. 服务端生成高强度随机码，数据库只保存哈希。
3. 原始邀请码只在创建响应中返回一次，可复制或通过微信分享。
4. 被邀请者使用自己的微信登录后兑换。
5. 服务端锁定邀请记录，校验有效期和状态，创建/恢复成员关系并把邀请标记为已使用。
6. 同一邀请码不能重复兑换；撤销与兑换使用事务锁避免并发竞态。

邀请码默认 72 小时，可配置 1 到 336 小时。不要在日志中输出邀请码原文。

## 会话与撤权

登录响应保留兼容字段和多角色字段。生产响应不包含原始 OpenID；以下开发环境示例省略该字段：

```json
{
  "user": {
    "id": "user-id",
    "role": "staff",
    "primaryRole": "owner",
    "roles": ["customer", "staff", "owner"],
    "permissions": [
      "staff:appointments:read",
      "staff:appointments:write",
      "staff:gallery:read",
      "staff:gallery:write",
      "staff:booking-rules:read",
      "staff:booking-rules:write",
      "staff:manage"
    ],
    "systemRole": "user",
    "staffRole": "owner"
  }
}
```

`auth_sessions.role` 只作为旧数据兼容和审计快照。每次受保护请求都会重新检查：

- session 是否存在且未过期；
- 用户是否仍为 `ACTIVE`；
- session 的 OpenID 是否仍与用户一致；
- 当前有效成员关系和系统角色；
- 当前接口要求的 permission。

## 错误边界

- 未登录、token 无效或普通顾客访问店员资源：`401 STAFF_UNAUTHORIZED`。
- 已登录店员访问店主/系统管理员资源：`403 PERMISSION_DENIED`。
- 用户账号停用后重新登录：`401 ACCOUNT_DISABLED`。
- `/auth/me` 的 session 无效：`401 SESSION_UNAUTHORIZED`。
- 店员移除自己：`409 CANNOT_DISABLE_SELF`。
- 移除最后一位店主：`409 LAST_ACTIVE_OWNER`。

## 发布要求

```env
NODE_ENV=production
ALLOW_OPENID_HEADER_AUTH=0
ALLOW_DEMO_STAFF_OPENID=0
WECHAT_APP_ID=<真实 AppID>
WECHAT_APP_SECRET=<真实 AppSecret>
SYSTEM_ADMIN_OPEN_IDS=<系统管理员 OpenID>
OWNER_OPEN_IDS=<首位店主 OpenID>
```

发布前必须确认体验版/正式版请求中不存在模拟 OpenID Header，并完成成员邀请、
撤权即时生效、最后一位店主保护和普通店员越权访问的真机 UAT。
