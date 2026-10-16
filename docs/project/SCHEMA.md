# 数据主体、关系与存储 · 实现合同

## 主体与关系

Museum 机构 1:N Venue 馆址；Trip 旅行 1:N Selection 收藏入本次旅行的馆址，1:N TripStop 已编排站点。一个机构可有多个分馆，不合并馆址。SessionBinding N:1 Trip；Favorite 跨旅行保存参观笔记；Trip 1:N Candidate / Artifact。

**清单不等于路线。** 第一阶段 `trip_selection` 只有馆址ID和顺序，没有day或minutes。第二阶段才创建 `trip_stop`，使用Day N和240–480分钟。加入清单不触发时长限制、自动排日或新建会话。

## 实际数据表

| 位置 / 表 | 主字段 | 责任 |
| --- | --- | --- |
| 包内 CSV / catalog.json | museum_id、名称、等级及年份、地理候选、旅游字段、来源 | 5,535条2019历史基线，缺失留空 |
| 内存 SQLite museum | id / name / province / city / grade / county / payload，城市/等级索引 | 启动即离线查询，选择目录前不写业务文件 |
| trips.sqlite / trip | id、title、settings_json、revision、archived、updated_at | 用户确认目录下的旅行事实 |
| trip_selection | trip_id、venue_id、position | 建清单，无day/minutes |
| trip_stop | trip_id、venue_id、position、day、minutes | Day 1–30；4–8小时参观；同一旅行馆址唯一 |
| favorite | venue_id、payload(note/visited)、updated_at | 参观笔记与收藏，不跟名录更新被覆盖 |
| candidate | id、trip_id、payload、status、created_at | pending/confirmed/rejected；保留来源和输入revision |
| venue_override | id、payload、updated_at | 用户确认的馆址补充，覆盖包内同ID记录 |
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
