# UAT Report - 2026-03-18

## 当前阶段

统一验收基线已完成代码口径复核，进入真实页面 UAT 执行阶段。

## 已完成的基线预检

- 时间：2026-03-18 16:37 Asia/Shanghai
- 执行人：architect
- `npm run test:server`：通过
- `npm run check:weapp-contract`：通过

说明：以上结果仅代表后端自测与前端契约自检通过，不等价于微信开发者工具中的真实页面 UAT 已通过。

## 待执行的真实页面 UAT

按 `docs/UAT_GUIDE.md` 依次完成以下用例，并在本文件回填结果：

- [ ] Case 1 首页返图展示
- [ ] Case 2 顾客提交预约
- [ ] Case 3 我的预约查询
- [ ] Case 4 店员修改规则
- [ ] Case 5 店员审核预约
- [ ] Case 6 顾客查看审核结果
- [ ] Case 7 重启后持久化验证
- [ ] Case 8 无权限访问（可选）
- [ ] Case 9 接口口径一致性

## 环境建议

- 后端地址：`http://127.0.0.1:3000`
- 店员 OpenID：`staff-openid-demo`
- 顾客 OpenID（开发模拟）：`customer-openid-demo`

## 结果回填模板

### 环境
- 微信开发者工具版本：
- 是否已启动后端：
- 店员 OpenID：
- 顾客 OpenID：

### 结果
- Case 1：首页返图展示：
- Case 2：顾客提交预约：
- Case 3：我的预约查询：
- Case 4：店员修改规则：
- Case 5：店员审核预约：
- Case 6：顾客查看审核结果：
- Case 7：重启后持久化验证：
- Case 8：无权限访问（可选）：
- Case 9：接口口径一致性：

### 问题记录
1. 
2. 
3. 

### 截图 / 现象补充
- 
