# 0.2.5 工作台验收记录

日期：2026-10-16  
安装版本：`@xyb-community/find-museum@0.2.5`  
宿主：DSH Desktop 0.11.1 / macOS arm64

## 自动化与包检查

- `npm run build`：通过。
- `npm run check`：通过，含源码与工作台包结构校验。
- `npm test`：55 项通过。
- `npm run check:data`：通过；名录检查为 5,535 条唯一记录。
- `npm run check:private`：通过。
- `npm run pack:release`：通过；生成包 6,177,304 bytes，低于 8 MiB。
- 发布包解包后的运行检查与私密内容检查：通过。
- 发布包 SHA-256：`0872bc1792de1d8a0427a4971724989721234a67be6ed217e91672197b6f0c6b`。
- `git diff --check`：通过。

## 安装与宿主验收

- 0.2.5 包已安装到本机 DSH Desktop Web Profile 并实际打开；安装包与本地发布包哈希一致。
- 用户于 2026-10-16 明确确认官方规范第 4–7 节所列宿主验收项全部通过，包括目录选择与恢复、多会话项目映射及重启恢复、无会话时业务操作后发起 Agent、原生/工作台模式切换、侧栏状态和较窄窗口布局。
- 上述交互由用户在实机完成并确认；本记录不将其表述为 Codex 独立重复执行的结果。
- 本地资料目录与旅行数据不进入发布包；地图服务密钥不写入源码或包。

## 投稿截图

沿用仓库已有的真实工作台截图：`demo/full/overview-0.2.4.jpg`。截图用于展示稳定的业务界面；本次 0.2.5 主要变更集中在 Desktop 会话归属、映射恢复与宿主交互，不以截图版本号作为验收证据。

## 市场投稿状态

- 已获授权向 `dataelement/awesome-dsh-workbench` 投稿。
- 已提交 PR：<https://github.com/dataelement/awesome-dsh-workbench/pull/57>（2026-10-16）。
- 投稿目录仅新增 `data/workbenches/xyb-openharness-dsh-plugins__find-museum.yml`。
- 分类使用 `other`；PR 描述包含“建议新增分类：旅行”。
- 当前状态为待市场审核，尚未合并；因此尚未上架。
