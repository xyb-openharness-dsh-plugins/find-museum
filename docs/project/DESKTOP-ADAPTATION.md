# Desktop工作台适配：参考1.2.2能力

参考dataelement/dsh-site-selection的README及客户端实现；官方当前合同优先。复用行为，不复制其运行时ID、legacyWorkbenchIds、品牌或业务模型。

标准分栏：左业务0.65可折叠，右宿主原生会话。不渲染第二套聊天UI；设计原型的右侧只是宿主占位，正式包由Desktop提供。

注册使用调用方ctx.desktopWorkbenches.register，descriptor含真实GitHub repository，新包不填旧id。能力清单：register、isActive、ownsSession、currentSession、ensureSession、subscribe、sessions.scope、原生conversation input。逐项在目标Desktop核验。

会话动作：新建旅行→选择目录→落盘→请求原生会话→排队开场草稿；旧项目浏览不自动建会话。session→trip多对一，显式映射优先；重启恢复数据根.desktop-session-projects.json，无会话用当前来源localStorage。业务资料与DSH工作区独立。

消息桥四重边界：同源+对应iframe窗口+当前项目+活跃归属会话；请求前后重新验证，异步ticket防串。保留草稿、附件和引用；无法安全追加则提示用户先处理特殊草稿，绝不自动发送。切换工作台保持iframe；离开页面提示保存未提交表单。

结果回流：Agent输出文件/JSON候选→工作台预览→确认→写事实/馆单/路书。无公开回调API时走手工导入，不伪称监听全部聊天。删除旅行项目只归档业务资料，不删会话与工作区。

安装验收：包版本/哈希→安装副本→已安装列表→左侧入口→无会话浏览→新项目会话与草稿→切换后不串项目→重启恢复→折叠/边栏。当前仓库身份与目标宿主版本未确认，实际安装与会话均未验证。
