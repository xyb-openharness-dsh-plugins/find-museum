# 本机安装与发布

本机更新必须交付到已安装版本，而不止推送代码。常规更新连续完成构建版本化安装包→受支持入口安装→核对安装版本并打开确认本次修改；已有用户确认直接复用。只有仍加载旧版或异常时才排查源码、生成物、tgz、Profile和运行界面整链。仅要求Git推送时按Git范围交付。

## 首版门禁

```bash
npm run build
npm run check
npm test
npm run check:data
npm run pack:release
```

pack:release对真实tgz解包，检查入口/命名/运行数据/密钥，并在独立临时目录启动包内服务做健康与目录读取。产物为dist/find-museum.tgz与SHA-256。源码语法、契约测试、解包运行、目标安装和Desktop界面是不同证据，分别记录。

## macOS本机目标

本轮已读取目标：DSH Desktop 0.11.1，内置Node24.17，Profile为应用支持目录下harness/profiles/web；存在generation投影。先备份Profile的package/lock与投影链接清单。使用当版.desktop-bin中带generation隔离的pnpm runner，不能用普通全局pnpm盲目覆盖。

本机经核验的命令形态：

```bash
TASK_DSH_ROOT="$HOME/Library/Application Support/dsh-desktop/harness"
DSH_HOME="$TASK_DSH_ROOT" PATH="$TASK_DSH_ROOT/.desktop-bin:$PATH" \
  dsh plugin --profile web add /absolute/path/find-museum.tgz --ignore-scripts --offline
```

其他机器先检查dsh与当版Profile路径，不直接照抄macOS目录。无缓存时offline失败应报告缺失依赖，不能暗中改用其它Profile。安装后检查原有投影插件仍可解析；manifest恢复不证明node_modules链接已恢复，修复须用该版本官方恢复入口。

## 安装后核对

1. 已装包版本、客户端和服务端哈希与tarball一致。
2. dump-config含find-museum条目；不要把含凭据的完整配置写进日志或Git。
3. 按需由用户完整退出/重开Desktop。Agent不自行重启正在承载任务的宿主。
4. 工作台管理/已安装列表找到“寻馆”，左侧入口打开，确认65%业务区及唯一原生会话。
5. 无会话可查目录；取消目录无残留；新旅行建会话、已有旅行不自动建会话。
6. 保留已有草稿，不自动发送；切换项目和会话不串数据。验证真实搜索、清单、DayN排序、导出/结果回顾。
7. 重启恢复和卸载不删旅行、笔记或结果文件。

若缺少重启或真实界面证据，标为待验证，不把安装成功写成已上线可用。

## Git和交付

开发提交与发布tag分别管理。首版tag和package版本一致；发布固定附件find-museum.tgz及校验文件，便于后续固定下载地址。Desktop未验完时使用GitHub预发布标识并明确边界。市场收录需要独立目录PR和真实安装截图，本轮不默认提交市场PR。

本轮安装首次错误：pnpm add不接受--no-frozen-lockfile，移除后成功。全局dsh dump-config缺Desktop内置团队bundle；改用Desktop的harness-node-entry.mjs和app.asar内置dsh/lib/bin.js后exit=0且含本包。不是插件依赖缺失。

## 0.1.0发布记录

GitHub预发布：https://github.com/xyb-openharness-dsh-plugins/find-museum/releases/tag/v0.1.0 。tag对应35bd2cc。附件find-museum.tgz共323232字节，SHA-256为8f6eeedd055b26529ea7832cd954579bad6c5d9a2eeb295b56fa7c14cf0069fe。上传后从Release重新下载，实际包内版本0.1.0、字节和校验附件一致。未投稿市场，Desktop重启后UI验收尚未完成，保持预发布标识。

## 0.2.0预发布准备

新增旅行地点收藏/推荐、明确三步引导、折叠配置、冻结路书版本、附件预览/分享与清单切换按钮；MIT已确认。Node22/24均37项测试通过，实际包32文件、335455字节，SHA-256为5bbdbb951c8130ece5d58fd7c71a7de828fe36f55eb3435005346a496e102873。安装副本9个关键文件一致，15个原依赖全部可解析，内置Node实际入口32路由可加载。

0.2仍使用预发布标识：浏览器受扩展界面阻挡，Desktop完整重启与真实界面/原生会话验收未完成。投稿指令已保存，但无最终真实截图，不提交市场收录PR。
