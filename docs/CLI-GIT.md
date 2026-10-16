# Git 同步、CLI 激活与项目初始化

CLI 版本：1.1.0。Git 管理社区脚手架版本，`npm link` 将克隆目录激活为本机命令，`init` 把确认后的规范/模板/资产生成到业务项目。DSH Desktop 安装是业务包完成后的独立步骤。

## 首次部署脚手架

需要 Git、Node.js 22+、npm 和可用 shell。无需先装 DSH 才能准备开发目录；实际插件验收需要目标 Desktop。

```bash
git clone https://github.com/xyb-openharness-dsh-plugins/xyb-workbench-starter.git
cd xyb-workbench-starter
npm link --ignore-scripts --no-audit --no-fund
dsh-wb-cli --version
dsh-wb-cli doctor
```

`npm link` 建立指向克隆目录的本机命令链接，未发布 npm 也能用。npm 全局 bin 目录需在 PATH 中且可写；如出现权限问题，先查看 `npm prefix -g`，按本机团队约定配置用户目录，不自动 sudo、不修改 shell 配置。也可先用 `node /克隆目录/bin/dsh-wb-cli.mjs --help` 验证。

源码来自 Git，CLI 不额外安装第三方库，也不执行 prepare/postinstall。跨机器首次部署仍需网络访问 Git；克隆后生成和检查可离线。不要用来源不明的 curl | sh 激活。

## 初始化新项目

```bash
# 在希望放置新项目的父目录执行。
dsh-wb-cli init --prepare
# 用编辑器填写 project.config.json：用户、场景、流程、产出、仓库和布局。
dsh-wb-cli init my-workbench --dry-run
dsh-wb-cli init my-workbench
cd my-workbench
dsh-wb-cli check
```

已有配置可用 `--config /path/to/confirmed-config.json`；不需要反复填写。没有确认业务时，prepare 仅生成需求配置，不创建业务代码。默认配置仍是示例，填写完成才允许 init。所有计划文件含 `.dsh-wb-starter.json` 一起做冲突预检查，不覆盖同名文件。

生成目录保存 `AGENTS.md`、docs/SPEC/BRIEF/TASKS/ACCEPTANCE、功能/契约模板、assets、官方快照和接入骨架；`.dsh-wb-starter.json` 记录 CLI 版本、Git commit、dirty 状态和生成时间，不含原机器路径。它是可开发起点，不代表业务已实现或 Desktop 已加载。

## 日常同步

```bash
# 任意目录可执行；更新的是激活来源的脚手架克隆。
dsh-wb-cli sync --dry-run
dsh-wb-cli sync
```

仅在脚手架是独立 Git 根、工作区干净且已有 upstream 时执行 `git pull --ff-only`。不会自动 stash、reset、解决分叉或运行新脚本。没有远端/上游时明确提示，不猜业务仓库。Git 凭证由正常 Git/SSH 管理，CLI 配置不保存 token。

通过 npm link 激活时，后续命令直接读取更新后的克隆文件，通常无需重新激活。若未来 CLI 改了 bin 声明或新增依赖，按该版升级说明处理。固定某版本可在干净工作区 checkout 已验证 tag；detached HEAD 可用于 init，但 sync 会因无 upstream 停止。

**同步脚手架不自动修改已生成业务项目。** 业务项目拥有自己的 Git、schema 和原型；升级先在临时目录用相同配置生成，再比较选定模板和规则，更新来源记录并验收。不整目录覆盖。

## 检查与打包

```bash
# 在实际业务项目内执行。
dsh-wb-cli check
# 若项目有构建脚本，先按项目要求构建。
dsh-wb-cli pack --dry-run
dsh-wb-cli pack
```

pack 先运行社区静态包检查，再检查 prepack/prepare/postpack；存在生命周期脚本时停止，请审阅项目流程。已发现本机 npm 10.9.2 的 --ignore-scripts 仍执行 prepare，因此不只依赖这个标志。没有这些脚本时才 npm pack --ignore-scripts，不替项目执行 build、安装依赖或装入 DSH。当前 CLI 没有通用 install：安装入口/profile/generation 在各版有差异，按 [部署指南](06-VALIDATION-AND-RELEASE.md) 操作，不能把 init 称为 Desktop 插件安装成功。

停用本机链接：`npm unlink --global dsh-wb-cli`。只移除 CLI 链接，生成的业务项目不受影响。清理克隆前先确认是否有自己的修改。

## 本机验收与跨平台

本版在 macOS arm64 / Node v23.6.1 验证。Windows/Linux 未实机验证；命令使用 Node 参数数组而非拼接用户 shell，npm 在 Windows 的入口仍需目标平台检验。CLI doctor 只报告工具与 Git、应用目录是否存在，不探测进程、不读取 token、不确定运行版本与 profile，也不重启 Desktop。
