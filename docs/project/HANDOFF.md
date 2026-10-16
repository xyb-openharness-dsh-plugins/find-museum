# 当前交接

真实仓库find-museum，包@xyb-community/find-museum，首版0.1.0。由dsh-wb-cli1.1.0初始化，已按用户确认原型开发五个Tab，并落实清单→编排→交付三步。

运行：npm run dev，http://127.0.0.1:4390/；独立验收可用FIND_MUSEUM_DEV_PORT=4391 npm run dev。两者服务实例独立，不覆盖另一个预览的资料根。需要保持开发服务重启后的目录连接时，FIND_MUSEUM_DEV_ROOT只能传入用户已确认的现有目录。

数据：5535条2019名录+苏州5馆址为发布基线；用户数据在确认目录SQLite，不随包。首页加入只写trip_selection，不填时长；第二步才写trip_stop。迁移1–4、revision和批量事务已有回归测试。

高德Key留在机器级配置，不在源码和包内。当前机已配置；新用户需按配置页申请Web服务Key。别把本机开箱可用当成下载包含共享Key。

结果回流使用完整馆址JSON候选与手工保存Agent路书；原生草稿只追加、不自动发送。包内指南会复制到旅行input，不宣称已自动注册高德或搜索技能。

当前构建/测试/安装/发布结果以ACCEPTANCE和RELEASE为准，尤其保留Desktop重启和实际加载的未验证项。不要为完成表格而清理用户试用旅行。
