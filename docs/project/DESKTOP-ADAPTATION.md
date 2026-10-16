# Desktop工作台适配：参考1.2.2能力

参考dataelement/dsh-site-selection的README及客户端实现；官方当前合同优先。复用行为，不复制其运行时ID、legacyWorkbenchIds、品牌或业务模型。

标准分栏：左业务0.65可折叠，右宿主原生会话。不渲染第二套聊天UI；设计原型的右侧只是宿主占位，正式包由Desktop提供。

注册使用调用方ctx.desktopWorkbenches.register，descriptor含真实GitHub repository，新包不填旧id。能力清单：register、isActive、ownsSession、currentSession、ensureSession、subscribe、sessions.scope、原生conversation input。逐项在目标Desktop核验。

会话动作：新建旅行→选择目录→落盘→请求原生会话→等待Desktop切换并确认owner→保存session→trip映射→排队开场草稿，用户确认后发送。新建旅行自动初始化独立原生会话。打开旧旅行只恢复项目，不自动建会话；用户点击“为此旅程新建原生会话”或“打开此旅行的原生会话”后才调用ensureSession。已关联会话通过ensureSession({ folder, sessionId })恢复，缺少关联时创建新会话。单纯切换业务旅行不会重绑当前会话，避免覆盖其他旅行的会话归属。创建返回与宿主会话状态更新之间存在异步时序，客户端等待当前会话和owner一致；超时显示可重试状态，不把失败伪装成成功。session→trip多对一，显式映射优先；重启恢复数据根.desktop-session-projects.json，无会话用当前来源localStorage。业务资料与DSH工作区独立。

消息桥四重边界：同源+对应iframe窗口+当前项目+活跃归属会话；请求前后重新验证，异步ticket防串。保留草稿、附件和引用；无法安全追加则提示用户先处理特殊草稿，绝不自动发送。切换工作台保持iframe；离开页面提示保存未提交表单。

结果回流：Agent输出文件/JSON候选→工作台预览→确认→写事实/馆单/路书。无公开回调API时走手工导入，不伪称监听全部聊天。删除旅行项目只归档业务资料，不删会话与工作区。

## 顶部目录与会话状态（0.2.6）

通用设计、实现和检查矩阵见[工作台双状态规范](../09-WORKBENCH-STATUS.md)，可复制参考在 `examples/workbench-status.mjs`。状态用途是让用户区分本地资料是否就绪、当前对话是否与所选旅行匹配，不将两者合成一个“连接成功”。

本项目 `boot.configured` 来自后端成功打开资料存储；`src/client.js` 集中核验当前会话 owner 与 session→trip 映射，再通过同源消息桥发送 `sessionReady`、`tripHasSession`。这些字段是本项目桥接协议，不是 Desktop 新 API。`public/app.js` 的 `renderHostStatus` 展示结果；切换旅行先清除旧快照，等待宿主发回新状态。顶部使用文字和静态圆点；目录切换统一在数据配置，路书浏览/数据配置不显示重复的旅行操作栏。

目录绿灯表示最近一次配置/启动时成功初始化存储，不代表持续监测磁盘。本轮实机确认版本及两个标识已显示；目录运行中失效、归属 API 异常等全部分支尚未逐项重测，见[本机更新记录](ACCEPTANCE-0.2.6.md)。验收时按通用规范检查具体分支，不据绿灯推断完整流程已通过。

安装验收：包版本/哈希→安装副本→已安装列表→左侧入口→无会话浏览→新项目会话与草稿→切换后不串项目→重启恢复→折叠/边栏。仓库身份已确认，目标为Desktop0.11.1/macOS arm64，0.2.0已安装并核对副本；已安装列表、左侧入口、实际打开和原生会话仍待实机验证。
