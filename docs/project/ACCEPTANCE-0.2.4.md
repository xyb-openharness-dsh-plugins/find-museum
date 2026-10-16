# 0.2.4 本机安装与界面验收

日期：2026-10-16。目标：DSH Desktop 0.11.1，macOS arm64，web Profile。

## 已完成

- 问题原因：Desktop web Profile 的 `@xyb-community/find-museum` 仍引用 `file:/Users/qinxiaoqiang/Downloads/museum-route-workbench/dist/find-museum-0.2.3-final.tgz`。0.2.4 源码和包此前已生成，但没有安装到该 Profile。
- 安装前备份了 Profile 的 `package.json`、`pnpm-lock.yaml`、`cordis.yml`、`cordis.patch.yml`：`~/.config/find-museum/backups/desktop-v0.2.4-preinstall-1792134931/`。
- 使用 Desktop 自带的 pnpm runner 按 `docs/project/RELEASE.md` 安装 `dist/find-museum.tgz`。generation 投影由runner排除并在安装后恢复。
- Profile 依赖现指向 `file:/Users/qinxiaoqiang/Downloads/museum-route-workbench/dist/find-museum.tgz`；已安装包元信息为 `@xyb-community/find-museum@0.2.4`。
- 本机包大小 6,182,922 bytes，SHA-256 `98c40ea9406cdc7c44cb68f4e8ef29a5659086782892d66082d4dd790fce003c`。构建包解包运行检查通过，未捆绑凭据。
- 在实际 DSH Desktop 原生工作台界面看到 `v0.2.4`；点击💡后，浮层显示三步完整说明：搜索并建立清单、排序与安排Day N、保存或交给原生Agent。
- 作者随后提供了最终版Desktop实拍 `demo/preview/overview-0.2.4.jpg`（裁切自其提供的 `/Users/qinxiaoqiang/Downloads/find-musuem-wb-demo-1.png`）。可见 `v0.2.4`、已展开帮助浮层、当前旅行选择，以及“已追加到原生草稿，由你确认发送”；不含右侧Agent对话内容。市场截图1张，JPEG 1958×1101，143,188 bytes，符合格式、宽度、像素和体积限制。
- 自动测试52项全通过；build、包检查、private scan通过。

## 仍待验证

- 旧验收记录中的会话目录关联警告未出现在这张最新截图；成功追加到原生草稿是正向证据，但目录选择器取消/确认、映射持久化和重启恢复流程仍未逐项实测。
- 尚未逐项核对模式切换、侧栏收起/展开、无会话进入和旧项目恢复等第4–7节要求；这些属于市场投稿前必验项。
- 市场投稿仍需按独立验收要求处理；本记录不代表已创建PR或已上架。
