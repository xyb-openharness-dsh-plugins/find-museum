# 0.2.3 市场投稿前置核对

2026-10-16按照作者授权核实。本文是证据和材料核对，不是已提交/上架的标记；是否进入审核以真实GitHub PR为准。

## 已核实

- 公开仓库：xyb-openharness-dsh-plugins/find-museum，默认分支main，MIT，真实源码提交9de01cd72b2734bd5f93ffd1ceb4f9fbc519be89已推送。
- 安装来源：https://github.com/xyb-openharness-dsh-plugins/find-museum/releases/download/v0.2.3/find-museum.tgz 。目前为预发布，采用明确tag地址，不使用latest别名。
- 2026-10-16重新联网读取官网market-acceptance.md与development.md，与项目官方快照字节一致；市场catalog/README.md和schema以本轮拉取为准。
- 使用awesome-dsh-workbench当前scripts/probe-lib.mjs的inspectPackage直接下载上述公开Release，包名/版本/仓库、入口、bundle patch、路径和大小校验通过：6182137字节，0.2.3，SHA-256为28437eea2ec2b3d97960fd6061bd6e9efc8d8b0b194ee4e5069e67440c3f4978，与实际安装包一致。
- 市场仓库npm run check通过：目录校验及102/102测试。该记录只说明市场工具自身正常，不代表尚不存在的新条目/截图已通过投稿探测。
- 已安装版本和代码测试见ACCEPTANCE-0.2.3.md。当前GitHub登录可访问，目标市场仓库为READ权限，后续使用fork+PR。
- 本轮真实Desktop AX中读到v0.2.3、五入口正确顺序、业务iframe和唯一原生会话。此为真实加载证据；不会把独立浏览器截图作为Desktop实拍。

## 必须补齐

1. 当前Desktop实际显示“会话项目关联尚未保存：请先通过系统目录选择器选择本地资料目录”。需通过原生目录选择完成关联，再验收创建/切换会话与目录规则；不能把现有会话能聊天当作关联已保存。
2. Native自动化多次返回cgWindowNotFound/noWindowsAvailable，已请求作者把/Applications的Desktop置前；不自行停止/重启宿主或用进程探测绕过。
3. 在最终安装版本完成官方开发规范第4–7节适用项，按第8节逐项记录。
4. 从最终Desktop实拍1–5张无凭据/私人对话/个人行程的产品图，保存到本项目仓库；现有output/playwright只属浏览器开发证据，不能替换。
5. 截图齐备后上传源仓库，核对真实URL/尺寸/格式，生成唯一YAML并运行条目探测和PR范围检查，再创建PR和检查实际日志。不在证据缺失时先提交公开PR。

## 投稿编排材料

- 文件仅新增：data/workbenches/xyb-openharness-dsh-plugins__find-museum.yml
- url：https://github.com/xyb-openharness-dsh-plugins/find-museum
- name：寻馆
- nameEn：Museum Atlas
- category：other（作者指定，不擅自改动）
- description.zh：发现目的地及周边博物馆，收藏美食与景点，编排多日路线，导出路书或交给原生 Agent 继续完善。
- description.en：Discover museums near a destination, collect places, arrange multi-day itineraries, and export travel guides or refine them with the native Agent.
- tarball：上述v0.2.3固定下载地址。
- screenshots：待最终Desktop无私人内容实拍后填写真实源仓库HTTPS图片地址，不填占位或浏览器原型图。
- 不写版本、npm包名、校验值、作者ID、验证记录；不改市场生成文件。
- PR描述固定包含：“建议新增分类：旅行”；列用途、实际Desktop版本/平台、安装来源、验收证据和未验证平台。只声明macOS arm64实际测试范围。

## 官方第6节核对

| 要求 | 证据 |
| --- | --- |
| 最终包校验/安装/实际打开/本地自测 | 包安装与实际打开已有；目录关联及全部适用UI项未完成 |
| 公开MIT仓库、无密钥用户数据 | 已核实公开MIT；源码与包扫描见验收 |
| 可用来源、不超过8MiB | 公开Release直接下载及官方inspectPackage通过 |
| 开发规范4–7节逐项实测 | 尚有上述目录/会话/公共导航等项，不能勾为通过 |
| YAML完整与最终实拍 | 材料已对齐，真实公开截图缺失 |
| PR仅新增自己的一个YAML | 创建前检查，目前没有PR URL |
