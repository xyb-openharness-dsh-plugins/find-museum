# DSH 工作台市场投稿流程

本流程的目标是进入 **DSH Desktop 工作台市场**。代码上传、打 tag 或创建 Release 都只是可能的准备动作；市场投稿需要另向 `dataelement/awesome-dsh-workbench` 提交收录 PR。本指南不会自动授权公开仓库或投稿。

## 官方依据

- [官方市场验收规范](https://dshdesktop.com/workbench/docs/market-acceptance.md)：上架前提、安装来源、资料、审核与更新要求。
- [官方开发规范](https://dshdesktop.com/workbench/docs/development.md)：第 4–7 节宿主运行规则及第 8 节本地自测。
- [市场目录协议](https://github.com/dataelement/awesome-dsh-workbench/blob/main/catalog/README.md)：YAML 字段、截图与安装来源探测；该仓库 schema 为字段校验依据。
- 离线副本：[市场规范](../reference/official/market-acceptance-captured-2026-10-16.md)、[目录协议](../reference/official/market-catalog-2026-10-16.md)、[开发规范](../reference/official/development-2026-10-09.md)。抓取日期及 SHA-256 见 `reference/sources.json`；发布时先看官网和目录最新内容，有变化才重读相关章节。

以下人工优先的节奏是社区优化，不降低官方验收要求。

## 1. 一次确认投稿范围

确认作者自己的公开仓库、可公开内容及许可证；确认确实要投稿工作台市场。已有明确授权直接沿用。检查最终可安装版本与真实代码，不能拿空骨架、README 或构建计划当产品。

仓库根目录一个工作台。包不超过 8 MiB，不能带有效密钥、客户资料、数据库、个人绝对路径或无权分发素材。运行时业务 SQLite 与随发布包携带数据库是两回事。完整安装合同与其它限制以官方当前文档为准。

## 2. 选定一个安装来源

| 来源 | 提交前必须落实 | 条目写法 |
| --- | --- | --- |
| 仅源码 | 默认分支含真实入口、patch、已构建客户端；记录具体 commit 并从对应源码安装实测 | 不写 tarball |
| GitHub Release | 上传真实 tgz；从公开下载地址取得同一包并安装，核对包内版本与 hash | 填同仓库 Release 的 tarball 地址 |
| npm | 包的 name/version/repository 与来源契约匹配；从真实 registry 版本安装实测 | 不写 tarball |

市场采用 npm → 显式 Release tarball → 源码的优先级。已有 Release 不会自动被采用；声明的来源失效不能私自换另一来源。不要为投稿临时发布一个用户没有授权的 npm 包。

命令使用项目自己的真实脚本及包管理器；先读 `package.json`。例如使用 npm 的项目可 `npm pack --dry-run` / `npm pack`，已有 release 打包脚本时优先复用。源码路径不要求先发 Release，但必须提交构建产物，市场不代跑 build。禁止把只改版本号当成完成分发。

## 3. 自动检查一次，实机手工验收优先

推荐分工：Agent 检查包结构、版本/hash、打包内容、敏感信息和目录格式；开发者在 Desktop 按[人工验收单](../templates/MARKET-ACCEPTANCE.md)完成交互并提供真实截图。

1. 冻结本轮来源、版本、包 hash、目标 Profile 和平台，运行改动需要的检查并缓存结果。
2. 安装正确来源。重启不会自动把本机插件更新到 Git 最新版；先确认安装版本。原生 Agent 正在目标宿主运行时不自行终止它。
3. 让开发者一次覆盖目录取消/确认/路径失效、项目映射、会话与重启恢复、无会话操作、模式切换、侧栏、较窄面板及公共入口。按适用项填写，异常才回到 Agent 排查。
4. 用户明确“该版本上述清单全部通过”可作为用户手工确认，记录版本、范围、执行者与日期。已提供截图且用途明确时直接整理使用，不逐图反复打开核对；必要的格式/体积检查一次完成。不能扩张确认范围或写成 Agent 独立实测。
5. Computer Use 是可选辅助。建议每个受阻环节只尝试一次；遇权限、焦点漂移、扩展干扰或无法可靠操作，就转人工清单，不循环点击/截图/重复扫描。不能操作时说明缺项，不能伪造通过。
6. 检查通过后不因新一轮 Agent 上下文丢失重做全部验收。发生新代码/包变化、已知失败或证据不匹配时，才补受影响项目。

截图需来自最终可安装版本的真实产品画面。既有合规截图可复用；画面变化后补相应新截图。用户提供与 Agent 代拍具有相同证据用途，不要求 Agent 再拍同一画面。未验证平台不声明兼容。

## 4. 准备唯一的市场 YAML

文件：`data/workbenches/<owner>__<repo>.yml`。不要向插件目录 `data/plugins/` 投稿。

```yaml
url: https://github.com/owner/repo
name: 工作台中文名
nameEn: Workbench Name
category: other
description:
  zh: 说明用户能完成的真实业务。
  en: Describe the actual task users can complete.
screenshots:
  - https://raw.githubusercontent.com/owner/repo/main/demo/overview.jpg
# 仅选择 Release 来源时增加：
# tarball: https://github.com/owner/repo/releases/latest/download/workbench.tgz
```

`other` 只是示例，分类由作者从市场当前分类选择；不要把某个项目选定的分类硬编码成脚手架规则。`nameEn` 是可选项，双语 description 必填。新投稿省略 workbenchId/legacyWorkbenchIds，除非确有旧身份迁移。不要填写版本、npm 包名、源码 commit、校验值、作者 ID 或检查结果，也不要修改生成的目录文件。

截图 1–5 张，放在作者同一源仓库；完整 HTTPS 地址，PNG/JPEG/WebP，单张 ≤2 MiB，总像素 ≤16 MiPixels，第一张为封面。建议横向 16:9、宽至少 1280px，建议比例不是硬门槛。保留真实画面和素材权利，排除凭据与私人内容。可使用固定 commit 图片地址避免后续覆盖。

## 5. 通过 gh 提交市场 PR

下面是在本次流程中核验过的命令形态；先读 `gh repo fork --help`、`gh pr create --help` 和市场仓库当前脚本。示例中的 `YOUR_ACCOUNT`、`owner`、`repo` 需替换为真实公开身份；已有 fork/克隆/分支时复用，不盲目再建。

```bash
gh auth status
gh repo fork dataelement/awesome-dsh-workbench --clone=false
gh repo clone YOUR_ACCOUNT/awesome-dsh-workbench
cd awesome-dsh-workbench
git remote -v
# gh clone fork 通常会配置 upstream；没有时再添加官方远端。
git fetch upstream main
git switch -c add-workbench upstream/main
# 此时写入唯一的 data/workbenches/owner__repo.yml。
npm ci --ignore-scripts
set -o pipefail
npm run check 2>&1 | tail -c 4000
git add data/workbenches/owner__repo.yml
git diff --cached --check
git commit -m 'catalog: add workbench'
npm run validate:pr -- upstream/main HEAD
git diff --name-status upstream/main...HEAD
git push -u origin add-workbench
# 先将用途、来源、平台、手工验收和依赖写到 /tmp/workbench-market-pr.md。
gh pr create --repo dataelement/awesome-dsh-workbench \
  --base main --head YOUR_ACCOUNT:add-workbench \
  --title 'Add workbench' --body-file /tmp/workbench-market-pr.md
```

这里的 Git 操作仅用于向**工作台市场目录**提交那一个 YAML，不能用向业务仓库 push 的结果代替它。不要提交整个业务项目或修改市场生成文件。依赖安装报缺包时先完成锁文件依赖安装；schema 校验通过、远程安装来源探测和实机验收分开记录。可以先用仓库提供的 `npm run validate` 快速看字段错误；仍以最新 PR 上完整检查的实际结果为准，不反复跑全目录联网 probe。

PR 描述写清用途、安装来源、验证版本及 Desktop/OS/架构、手工验收执行者与结果、包检查、外部联网/依赖、本地资料位置策略、限制与未验证项。作者要求新增分类时在描述中建议，由维护者决定；不要自行改全站分类。

## 6. 跟踪审核与真正上架

取得真实 PR URL 后才能报告“已提交”。使用 `gh pr view <PR_URL>`、`gh pr checks <PR_URL>` 查看最新提交；失败再查对应 `gh run view <RUN_ID> --repo dataelement/awesome-dsh-workbench --log-failed`。工作流跳过探测或没有关联 PR 不算通过，网络/配额未完成也不算通过。

PR 合并后是“已合并，待目录更新”；公开目录可读、Desktop 市场能看到且可安装才是“已上架”。进度以远端 PR/市场为准，不在业务 App 内实现一个假投稿状态。开发材料可以记录 PR URL 和观察时间。

上架后按选中的安装来源更新：npm 发真实版本；Release 上传约定名称的安装包；源码提交可安装产物供市场发现。名称/分类/简介/图片地址/仓库/tarball选择变化才需要改相应 YAML；不要每次业务版本都重复提新条目。用户本机仍需通过 Desktop 的更新入口安装新版，重启不等于更新。
