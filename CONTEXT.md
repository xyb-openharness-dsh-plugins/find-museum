# 协作入口

项目为寻馆DSH工作台，包@xyb-community/find-museum，仓库xyb-openharness-dsh-plugins/find-museum，首版0.1.0。先读docs/TASKS.md、SPEC、project/SCHEMA、project/ACCEPTANCE和project/RELEASE。

现行三步：搜索建清单（无时间字段）→弹窗拖拽/DayN/4–8小时→保存或交给原生Agent。清单trip_selection和规划trip_stop分表，SQLite迁移1–4；不退回首页直接分配时间的旧实现。

public为正式业务页，src/client.js集中原生适配，lib/client.js由build生成。data/processed/museums-national.csv为5535条2019官方历史快照，不能当当前完整目录；未知字段留空。高德Key在机器私有配置，不在仓库。

验收区分源码、真实tgz、安装副本、Desktop列表/界面和外部服务。按项目AGENTS及官方规则，不自行退出正在运行的DSH。未观察到的项目写待验证；保持用户试用旅行。
