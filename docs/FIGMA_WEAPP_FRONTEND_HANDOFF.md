# Figma 与小程序前端协作交接

> 适用仓库：`D:\study\postGraduate\project\miniApp`  
> 最后核对：2026-08-16  
> 目标：让新的 Codex 对话可以基于 Figma 原型持续开发微信小程序前端，并在用户提出需求时小范围更新同一份原型。

## 1. 当前目标与边界

当前小程序为原生微信小程序，前端根目录是 `apps/weapp/`。预约页已依据 Figma 的 `Booking / Ready` 原型完成一次视觉改版；后续工作应以该原型及其状态画板为设计基线。

预约页的主要文件：

| 角色 | 文件 | 约束 |
| --- | --- | --- |
| 页面结构 | `apps/weapp/pages/booking/index.wxml` | 使用原生 WXML，不要粘贴 React 或 Tailwind 输出。 |
| 局部视觉 | `apps/weapp/pages/booking/index.wxss` | 保持暖白、浅粉/珊瑚粉视觉，优先局部样式。 |
| 页面逻辑 | `apps/weapp/pages/booking/index.js` | 只有交互需求改变时才修改；保留预约接口、状态判断与校验。 |
| 页面导航栏 | `apps/weapp/pages/booking/index.json` | 当前为白色导航栏，与 Figma 顶栏一致。 |
| 全局基础样式 | `apps/weapp/app.wxss` | 只在需要全局一致性时修改，避免影响其他页面。 |

前端实现时必须保留：

- `getAvailability` 和 `createAppointment` 的调用方式与请求参数。
- 顾客 OpenID 身份处理、开发环境模拟 OpenID、未授权状态。
- 日历日期的可用/占用/休息/超出范围状态，以及禁用时段原因。
- `ready`、`loading`、`unauthorized`、`empty`、`error` 页面状态与 `submitting`、`success` 提交状态。
- 姓名、手机号、备注的现有校验；不可为了视觉改版删除校验或改变预约归属规则。

Figma 中的日期、时段和 OpenID 为原型示例数据，不能当作生产页面的固定数据。生产页面必须继续使用接口返回的日历和时段数据。

## 2. Figma 文件与画板

主文件：<https://www.figma.com/design/ttoDYwBFd8yRnDE1C9gxYa/Untitled>

文件 key：`ttoDYwBFd8yRnDE1C9gxYa`  
原型页面：`预约原型`，节点 `4:2`

| Figma 画板 | 节点 ID | 用途 |
| --- | --- | --- |
| `Booking / Ready` | `4:62` | 常规预约表单，前端主视觉基线。 |
| `Booking / Loading` | `4:228` | 加载数据时的反馈。 |
| `Booking / Unauthorized` | `4:243` | 无顾客身份时的反馈。 |
| `Booking / Empty` | `4:253` | 没有日期或时段可展示时的反馈。 |
| `Booking / Error` | `4:267` | 网络或服务异常时的反馈。 |
| `Booking / Success` | `4:281` | 提交成功后的确认与后续操作。 |

已有可编辑组件：

| 组件 | 节点 ID | 使用场景 |
| --- | --- | --- |
| `Button` | `4:11` | 主、次、幽灵、禁用按钮。 |
| `Calendar Cell` | `4:24` | 可选、选中、禁用、今天、超出范围、占用日期。 |
| `Time Slot Card` | `4:34` | 可选、选中、禁用时段。 |
| `Text Field` | `4:35` | 输入框。 |
| `Status Notice` | `4:59` | Loading、Error、Empty、Success、Unauthorized 状态。 |

读取或编辑画板时必须传具体画板节点，例如 `4:62`。`4:2` 是 Figma 页面根节点；不要对整个页面执行无边界读取或写入。

## 3. 当前 Figwright MCP 配置

Codex 配置文件：`C:\Users\lan\.codex\config.toml`

Figma 的读取与写入统一使用 Figwright。不要配置、调用或重新启用官方 Figma MCP（`mcp_servers.figma`），并禁用 Codex 的官方 Figma 插件（`figma@openai-api-curated`）；它们不属于本项目的协作链路。

当前配置：

```toml
[mcp_servers.figwright]
command = "C:\\Windows\\System32\\cmd.exe"
args = ["/d", "/c", "npx", "-y", "@figwright/mcp@latest"]
startup_timeout_sec = 120
```

```toml
[plugins."figma@openai-api-curated"]
enabled = false
```

Figwright MCP 通过本机 `127.0.0.1:3055` 与 Figma Desktop 插件通信。当前插件版本为 `v0.4.0`，Node 运行时要求为 `^20.19.0 || >=22.12.0`；本机已使用 Node `v24.0.0`。每个新对话开始时仍应做一次健康检查；不要把某次会话的工具可用性当作永久保证。

### 安装、启动与连接

在 Figma Desktop 中通过开发插件导入以下清单：

```text
C:\Users\lan\Downloads\figwright-plugin-v0.4.0\manifest.json
```

打开 Figwright 插件并保持运行，插件面板必须显示 `Connected`。若显示断开连接，先检查插件是否仍在运行、Figma Desktop 是否已启动，再重新打开插件。不要用浏览器 OAuth、`mcp login` 或 `mcp logout` 排查该链路。

新增、删除或修改 `[mcp_servers.figwright]` 或官方 Figma 插件配置后，需要重启 Codex Desktop；配置文件存在不代表插件已经连通。

### 健康检查标准

新对话应按以下顺序检查：

1. 确认本轮工具中存在 `mcp__figwright__*`，且 Figma Desktop 的 Figwright 插件显示 `Connected`。
2. 调用 `mcp__figwright__ping`；必须返回 `hop: "e2e"`，且 `plugin` 不是 `null`。
3. 对具体画板调用 `mcp__figwright__get_node` 或 `mcp__figwright__get_nodes_info`，例如节点 `4:62`；读取成功才可开始任务。
4. 修改前后均调用 `mcp__figwright__get_screenshot` 做视觉核验。读取范围必须限于目标画板、组件或其必要子节点。

常见错误及处理：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `ping` 未返回 `hop: "e2e"` 或 `plugin: null` | Figma Desktop 插件未运行或尚未连接。 | 打开目标 Figma 文件，运行 Figwright 插件并等待其显示 `Connected`，随后再次检查。 |
| 新对话没有 `mcp__figwright__*` 工具 | Codex 未加载服务器配置或刚修改过配置。 | 核对 `config.toml` 中的 Figwright 配置，重启 Codex Desktop。 |
| `get_node` 找不到节点或读取失败 | 节点 ID 不存在、文件未打开，或指定了页面根节点。 | 在 Figma 打开目标文件，改用具体画板或组件节点。 |
| 截图或读取超时、内容过大 | 读取节点范围过大。 | 缩小到目标画板、组件或必要子树；不要读取整个文档。 |

## 4. 每次任务的固定工作流

### A. Figma 原型修改后，更新小程序代码

这是最常见的工作流。

1. 先阅读本文件，再阅读目标页面现有的 WXML、WXSS、JS 和相关服务文件。
2. 让用户提供具体 Figma 画板 URL；若没有 URL，使用本文件中的节点 ID，并明确将采用哪一个状态画板。
3. 完成 Figwright 健康检查后，调用 `mcp__figwright__get_node` 或 `mcp__figwright__get_nodes_info` 读取目标画板及必要子节点；不能只凭截图手写页面。
4. 需要核对视觉时调用 `mcp__figwright__get_screenshot`；需要定位节点时使用 `mcp__figwright__search_nodes`、`mcp__figwright__get_nodes_info`，或在范围明确时使用 `mcp__figwright__get_document`。
5. 把设计输出视为参考，而不是最终代码：将布局和颜色适配为 WXML/WXSS，复用当前页面的数据字段、事件和样式约定。
6. 先做局部视觉变更；涉及接口、日历状态或提交逻辑时才改 `index.js`，并说明行为改变。
7. 执行验证命令，并在微信开发者工具中预览对应状态。

### B. 代码或产品需求改变后，调整 Figma 原型

只有用户明确要求同步或修改 Figma 时才写入 Figma。写入前先确认影响范围：指定画板、状态画板，或组件本身。

1. 完成 Figwright 健康检查，并读取目标画板、组件和必要的设计系统节点。
2. 仅使用 `mcp__figwright__*` 的组件、布局、文本和图片写入工具执行修改；禁止调用官方 Figma MCP 的 `use_figma`、`generate_figma_design` 或其他写入工具。
3. 修改或新建组件时，先用 Figwright 检查现有组件、变量和样式，保留变量、变体和组件结构。
4. 优先修改已有的 `Button`、`Calendar Cell`、`Time Slot Card`、`Text Field`、`Status Notice`，不要复制出一套同名但无关联的组件。
5. 只编辑用户指定的画板或组件。完成后用 `mcp__figwright__get_screenshot` 检查层级和视觉结果；必要时再用 `get_nodes_info` 核验节点属性。

### C. 需要双向协作时

同一轮任务中同时修改原型和代码时，先明确本次的设计源头：

- 用户在 Figma 中改了布局：以 Figma 为视觉源头，读取后改代码。
- 用户描述了产品需求，尚未定稿：先调整 Figma，再由确认后的画板改代码。
- 只修复小程序展示问题：默认只改代码，不回写 Figma，除非用户要求同步。

不要把一次性的代码调试结果直接覆盖设计稿，也不要把原型中的示例数据写死到业务逻辑里。

## 5. 预约页视觉规范

当前 `Booking / Ready` 对应的实现规则：

- 页面底色：暖白 `#fffaf8`；导航栏：白色。
- 卡片：白色、轻阴影；身份/开发卡 16px 等效圆角，主表单卡 20px 等效圆角。
- 强调色：珊瑚粉 `#e8856c`；浅色容器 `#fff8f5`、`#fff6f2`、`#fff0eb`。
- 日历：7 列固定网格；选中日期填充珊瑚粉，今天使用珊瑚粉描边，禁用状态保持可区分的低饱和颜色。
- 时段：单列卡片；选中态为浅粉底加珊瑚粉描边，禁用态必须显示原因。
- 表单：姓名、手机号、备注均为柔和浅粉输入面；提交按钮为全宽珊瑚粉圆角按钮。
- 状态页：Loading、Error、Unauthorized、Empty、Success 使用居中反馈卡，行动按钮使用同一强调色。

视觉微调优先限制在 `apps/weapp/pages/booking/index.wxss`。不要为了一个页面的调整修改 `app.wxss` 的 `.card`、`.button-primary` 等全局基础类，除非其他页面也要同步采用同一规范。

## 6. 预约页状态与行为映射

| Figma 画板 | 小程序条件 | 关键行为 |
| --- | --- | --- |
| `Booking / Ready` | `pageState === 'ready'` 且 `submitState !== 'success'` | 可选择日期和可用时段，填写信息后提交。 |
| `Booking / Loading` | `pageState === 'loading'` | 等待 `getAvailability`。 |
| `Booking / Unauthorized` | `pageState === 'unauthorized'` | 没有可用 OpenID；开发环境仍需保留输入/生成模拟 OpenID 的路径。 |
| `Booking / Empty` | `pageState === 'empty'` | 日期或时段为空，可重新加载。 |
| `Booking / Error` | `pageState === 'error'` | 展示错误信息，可重新加载。 |
| `Booking / Success` | `submitState === 'success'` | 展示提交结果，可跳转“我的预约”或再次预约。 |

日历的 `canTap`、时段的 `status` 和 `reasonText` 是业务行为的一部分。视觉改版可以改变呈现方式，但不得让禁用时段提交、隐藏禁用原因，或绕过 OpenID 和手机号校验。

## 7. 验证清单

前端任务完成后至少执行：

```powershell
npm run check:weapp-contract
```

该命令在仓库根目录运行，会检查预约页面的关键数据结构、事件绑定与业务契约。

在微信开发者工具中再人工验证：

1. 首次进入看到 Loading，然后进入 Ready、Empty、Error 或 Unauthorized 的正确状态。
2. 切换月份、点击日期、选择可用时段正常；点击禁用时段会提示原因且不会选中。
3. 开发环境可以保存、生成、清空模拟 OpenID。
4. 姓名、手机号、备注校验仍有效；提交成功后显示 Success，并能“再约一次”。
5. 在常用手机模拟器宽度下检查文字换行、按钮、日历 7 列和输入框不重叠。

不要撤销或覆盖工作区中其他人已经修改的文件。提交前用 `git diff --check` 检查空白错误，并只复核本次涉及的文件。

## 8. 新对话提示词

创建新的 Codex 前端任务时，可直接发送：

```text
请先阅读 docs/FIGMA_WEAPP_FRONTEND_HANDOFF.md，并按其中的 Figwright 健康检查与工作流执行。

本次任务：<描述要修改的页面、状态和交互>
Figma 画板：<粘贴具体 node-id 的 Figma URL；没有时写明使用的画板名称>
设计源头：<Figma / 产品需求 / 代码现状>
允许范围：<只改代码 / 同时调整 Figma 和代码>

保留现有接口、身份处理、校验与状态逻辑；所有 Figma 读取和写入只允许使用 Figwright MCP，禁止使用官方 Figma MCP 写入。完成后运行 npm run check:weapp-contract，说明修改文件和验证结果。
```

对于预约主页面，默认 Figma URL 可写为：

```text
https://www.figma.com/design/ttoDYwBFd8yRnDE1C9gxYa/Untitled?node-id=4-62
```
