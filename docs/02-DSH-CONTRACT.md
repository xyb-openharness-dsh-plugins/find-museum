# DSH 接入合同与边界

依据官网 2026-10-09 快照第 2–8 节。版本变化先核对官网与目标 Desktop 的实际 API；脚手架不会替宿主实现不存在的能力。

## 包的四要素

1. `package.json`：npm name/version、main 与 exports["."]、exports["./client"]、dsh.bundle.patch、web client inject。
2. `cordis.patch.yml`：YAML 数组，insert.name 为完整 npm 包名，不是文件路径；空 patch 写 `[]`。覆盖配置是整体替换，不会合并。
3. `dsh/index.js`：Cordis 服务插件，Config 使用 Schemastery；API 只放自己的前缀，按宿主 connection 鉴权；effect/disposer 清理注册。
4. `lib/client.js`：已经构建的单文件，`window.__ModuleLoader__.load`；factory 里拿宿主共享 React，返回 apply 与 inject。不要把另一份 React/宿主 runtime 打入包。

```js
window.__ModuleLoader__.load({
  id: '@community/my-workbench',
  factory(require) {
    const React = require('react')
    function Panel() { return React.createElement('main', null, '业务页面') }
    function apply(ctx) {
      ctx.effect(() => ctx.desktopWorkbenches.register({
        title: '社区工作台', repository: 'https://github.com/owner/repo',
        description: '明确的业务用途',
        layout: { businessSide: 'left', businessWidth: 0.65 }
      }, Panel))
    }
    return { apply, inject: ['desktopWorkbenches'] }
  }
})
```

上例是用户明确选择标准分栏后的例子，非通用默认。**不用旧指南里的 `ctx.inject('dsh-desktop-workbenches', ...)` 示意写法。** 服务名 `desktopWorkbenches` 与加载顺序模块 ID `dsh-desktop-workbenches` 不混用。

npm 包名、patch 插件条目 ID、从 GitHub repository 推导的 `owner/repo` 身份职责不同。loader ID 等于 npm 包名。新 register 不填 id；repository 的改名/转移会影响会话归属，须设计迁移。

## 布局先选再实现

- 报表、审核、宽表格等业务为主：优先评估 `customFrame: true`，首页先可用；用户主动请求 AI 才显示宿主传入的 conversation 节点。模板只演示业务壳，真实创建/恢复会话要另按目标 API 接入。
- 对话为主：标准分栏，layout.businessWidth 合同范围 0.25–0.7；不要因 65% 不够就侵占宿主侧栏。
- 根容器 min-width/min-height 为 0，内部滚动有界；用容器查询/ResizeObserver，不以整窗断点假设业务宽度。
- 不覆盖公共导航、设置、模式与窗口按钮。macOS 自定义 header 按 `--dsh-frame-leading-clearance` 避让。

## 文件与会话

没有会话也能浏览、创建和选择业务记录。需要文件/工作区时先用宿主目录选择器，用户取消无残留；原路径丢失重新选择，不静默创建同名目录。

业务患者/项目不等于 DSH workspace，会话 owner 也不能从“当前打开面板”猜。恢复会话要验证工作台归属，保持当前业务映射。草稿保留用户已有内容，由用户发送。自动任务另需明确授权、正确 owner 和防重。

## 模板兼容声明

`project-template` 使用经项目实践核对的 webServer.register 与 connection.requestRejection 形态实现只读健康接口。目标 Desktop 需要提供这些服务；缺能力时拒绝请求/显示错误，而不绕过鉴权。peer 范围需按目标宿主核验；预发布范围不能仅用排除 prerelease 的普通版本范围。

模板静态通过只说明文件与声明一致。实际列表、会话、customFrame、生命周期与跨平台行为仍需实机验收。

## 接入失败的上下文陷阱

项目实践中，Desktop 0.11.1 / Harness 0.2.0-rc.2 上出现注册代理与 props.service 的 fiber 上下文不同，渲染调用 ownsSession 才触发包身份错误。不要把所有 registration 文案都归因于包名；服务端无日志也不证明客户端正常。集中适配，区分 owned/not-owned/unavailable；特定版本状态回退不能当通用授权合同。见 [开发典型错误和修复经验](LESSONS.md)。
