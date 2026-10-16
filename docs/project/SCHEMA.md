# 数据主体、关系与存储 · 实现合同

## 主体与关系

Museum 机构 1:N Venue 馆址；Trip 旅行 1:N Selection 收藏入本次旅行的馆址，1:N TripStop 已编排站点。一个机构可有多个分馆，不合并馆址。SessionBinding N:1 Trip；Favorite 跨旅行保存参观笔记；Trip 1:N Candidate / Artifact。

**清单不等于路线。** 第一阶段 `trip_selection` 只有馆址ID和顺序，没有day或minutes。第二阶段才创建 `trip_stop`，使用Day N和按地点类别校验的分钟数。加入清单不触发时长限制、自动排日或新建会话。

## 实际数据表

| 位置 / 表 | 主字段 | 责任 |
| --- | --- | --- |
| 包内 CSV / catalog.json | museum_id、名称、等级及年份、地理候选、旅游字段、来源 | 5,535条2019历史基线，缺失留空 |
| 内存 SQLite museum | id / name / province / city / grade / county / payload，城市/等级索引 | 启动即离线查询，选择目录前不写业务文件 |
| trips.sqlite / trip | id、title、settings_json、revision、archived、updated_at | 用户确认目录下的旅行事实 |
| trip_selection | trip_id、venue_id、position | 建清单，无day/minutes |
| trip_stop | trip_id、venue_id、position、day、minutes | Day 1–30；博物馆4–8小时，其他地点15–480分钟；同一旅行馆址唯一 |
| favorite | venue_id、payload(note/visited)、updated_at | 参观笔记与收藏，不跟名录更新被覆盖 |
| candidate | id、trip_id、payload、status、created_at | pending/confirmed/rejected；保留来源和输入revision |
| venue_override | id、payload、updated_at | 通用Place扩展；kind/provider/providerPoiId/rating/themes/unlocated，保留旧馆址ID |
| artifact | id、trip_id、kind、path、payload、created_at | 格式、输入revision、SHA-256、结果文件索引 |
| migration_ledger | version、applied_at | 递增迁移，不清库升级 |
| .desktop-session-projects.json | sessionId → tripId | 业务关联，不授予会话owner权限 |

settings_json 保存目的地、可选日期、交通偏好、中心点、备注、用户确认的旅行文件夹。前端Tab调整不改变实体；新增展示字段优先扩展经过校验的JSON载荷，真实约束变化才升级迁移。

## 迁移与事务

1. 旅行/站点与迁移账本。
2. 收藏、候选、馆址覆盖与结果记录。
3. 旧短时参观归一到4小时，下限240、上限480，保留顺序与天数；受影响旅行revision递增，旧候选因此失效。
4. 独立清单表，旧路线回填清单；第一步不再强制生成行程。

路线保存采用revision乐观锁；批量导入馆址+清单、馆址+路线分别在单一SQLite事务中提交。中途失败整体回滚。拒绝过时更新，但允许拒绝过期候选。移出清单会同步移出该旅行的编排，不删除公共馆址/收藏/其他旅行。

## 目录与文件

资料根由系统目录选择器确认，根下包含trips.sqlite及会话映射。每次旅行在另选的父目录下创建独立文件夹：

```text
寻馆-<id>/
  CONTEXT.md                  # 自动生成的入口说明
  route.json                  # 清单和路线的只读快照
  input/
    selected-museums.json      # 所选馆址与来源快照
    museum-route-planner.md    # 包内任务指南副本，不宣称已注册技能
    OUTPUT-CONTRACT.md         # 结构化候选合同
  output/                     # 导出与用户登记的Agent路书
```

SQLite是事实源，input和route.json可重建；Agent直接改快照不更新数据库，直接写output不等于已登记。工作台“保存路书”生成文件并登记；不监听全部原生聊天。

## 证据与坐标

等级及年份、常规开放时间、临时公告与有效区间分开。city_candidate来自馆名推断，不能当核实城市。当前地图全部使用GCJ-02；其他坐标必须核实后导入，不拿城市中心冒充馆址。非unknown开放状态必须附核实时间和有效日期，失效后界面回到待核实。

后续字段级Claim/OpeningNotice独立表、锁定点、时间窗冲突和可选记忆索引属于扩展设计，首版不伪称已经实现。记忆只能引用事实ID和revision，不能覆盖数据库事实。


## 下一轮扩展入口

0.2计划将收藏扩展为旅行Place（博物馆/美食/景点/Citywalk），并增加Roadbook/RoadbookVersion用于可浏览档案。分类时长不再共用museum约束。设计与迁移顺序见[0.2修改需求第7节](../changes/V0.2-NAVIGATION-AND-TRAVEL-LIBRARY.md)。以上是待实现设计，本页上文表格仍描述0.1真实结构。

## 0.2实际实现与迁移5

- Place复用venue_override的已校验JSON载荷，不另建同ID的重复地点事实表。原museum机构链接和Venue ID继续兼容；非博物馆通过kind区分。评分为provider/value/scale/checkedAt；高德未给范围时scale=null，原样显示，不换算星级。
- migration5先VACUUM INTO生成trips.pre-v5-时间.sqlite一致备份，再事务重建trip_stop约束为15–480分钟。更严格的museum下限由服务端地点类别和领域校验共同执行；旧顺序、Day、收藏、笔记和revision保留。
- roadbook_version：id/trip_id/version/input_revision/snapshot/created_at；(trip_id,version)和(trip_id,input_revision)唯一。单行冻结版本直接承载Roadbook读模型，避免额外空壳主表。旧Artifact没有可靠快照时作为历史附件保留。
- Artifact.payload新增roadbookId/status，格式附件归到同一路书版本；Agent结果初始pending，用户确认后confirmed。分享、预览和下载不修改冻结输入。
- recommendation_cache：cache_key/payload/created_at；30分钟缓存查询，不自动转成收藏。Favorite仍独立存笔记和visited；同地点重新推荐不清空已保存内容。
- 未归属清单只在当前Desktop来源localStorage暂存，明确未落盘。正式清单写入用户选定目录SQLite；批量补充地点、收藏和清单在同一事务内保存。

## 迁移6：资料核实与同路线新版本

迁移前使用VACUUM INTO生成一致备份。事务重建roadbook_version，增加content_hash；唯一约束为(trip_id,version)和(trip_id,input_revision,content_hash)。旧快照原样迁移并计算摘要，新增资料版本无需伪造旅行revision。

roadbook_check(id,roadbook_id,payload,created_at)记录一次查询的POI/开放时间/天气/失败和来源。查询结果本身不是当前事实；用户采纳后更新地点常规时间及来源，在同一路线下保存新的冻结路书。30分钟后须重新核实。旧版本、用户笔记和当前规划不覆盖。

input/HTML-ROADBOOK.md与input/selected-roadbook.json是指定版本的Agent任务上下文。output/roadbook-<id>.json为可重建的公开快照，数据库保存私有事实和版本索引。直接写入output不等于登记结果。

## 迁移7：路书管理状态

roadbook_state(roadbook_id主键外键,status,updated_at)，status限定active/archived/deleted。缺记录默认active。管理状态与冻结snapshot.status(draft/planned)分开，不改content_hash和旅行revision。迁移前VACUUM INTO生成一致备份，事务建表/写账本。

删除仅标记deleted，可从已删除恢复；不删除附件文件、收藏、旅行或其他版本。存档可移回active。明确重新保存完全相同内容会恢复同一版本active，继续保持内容去重。修改走恢复草稿→编辑→保存新版本，不原位更新旧snapshot。
