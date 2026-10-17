# 0.2.8 首页主路径调整验收

## 修改范围

- 搜索并加入馆址后，在当前旅行内直接打开 Day N 编排；暂存清单先提示完成旅行设置。
- 新建旅行时先填写工作区、目的地和可选日期，再进入高德搜馆；避免反复切换页面配置。
- 首页第一步区域增加轻提示层级，搜索主路径仍保持可见。

## 自动检查与包

- `npm run build`、`npm run check`、`npm test`、`npm run check:data`、`npm run pack:release` 均通过。
- 自动测试：59/59通过；数据：5,535条唯一名录通过。
- 包内服务解包启动检查通过，包含59个文件，无凭据。
- `dist/find-museum.tgz`：6,181,920 bytes；SHA-256：`d12e59c4ac42c21d20bf4d264b64c16464274e4167dc9cafdae16b2c01163336`。

## 本机安装

- 安装目标：DSH Desktop `web` Profile。
- 安装前备份：`~/Library/Application Support/dsh-desktop/harness/backups/find-museum-0.2.7-before-0.2.8-20261017/`，包括Profile `package.json`、`pnpm-lock.yaml`、插件安装目录清单和安装状态摘要。
- 使用Desktop内置generation-aware pnpm runner从本地tar安装；安装器报告完成，并恢复11个generation projection。
- Profile依赖指向 `dist/find-museum.tgz`；插件清单含工作台；已安装包与tar包59个文件逐项比对一致，包与客户端版本均为`0.2.8`。
- 安装器报告宿主peer依赖提示；本包声明的4个peer由Desktop宿主提供。安装命令退出成功，Profile项目完成。

## 尚未确认

- DSH Desktop进程在安装前已运行，未强制重启。当前版本已安装到Profile，但本轮没有确认运行中的界面已重新加载，也没有重启后的Desktop界面证据。
- 新建旅行→选工作区→高德搜索→加入清单→编排的整条原生Desktop链路待重开后实测；自动测试覆盖清单状态、入口条件和UI状态。
- GitHub `main` 已推送到提交 `0dc9045`，并发布预发布标签 [v0.2.8](https://github.com/xyb-openharness-dsh-plugins/find-museum/releases/tag/v0.2.8)，附件为 `find-museum.tgz` 和 SHA-256 文件。
- Awesome Workbench 投稿 PR [#57](https://github.com/dataelement/awesome-dsh-workbench/pull/57) 已存在且仍开放。本次没有重复投稿；该条目选择GitHub源码安装，未声明 `tarball`，因此市场探测使用默认分支源码，不会自动改用GitHub Release附件。
