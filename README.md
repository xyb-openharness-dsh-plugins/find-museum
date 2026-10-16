# 寻馆 · Museum Atlas

在目的地城市发现大馆，也给周边100km内的县域馆、专题馆留一些时间。DSH Desktop 工作台：左侧65%为业务区，右侧保留唯一的原生Agent会话。

仓库：https://github.com/xyb-openharness-dsh-plugins/find-museum

## 使用流程

1. **搜索并建清单**：选择目的地，检索本地名录或高德POI；单选、多选、一键全选后加入旅行清单。这一步不分配时长或Day N。
2. **排序与调整**：打开“我的路线”的编排弹窗，拖拽或用上下箭头排序，选择Day 1–30。每馆4小时基本参观、6或8小时深度参观；每日统计不含交通和用餐。
3. **保存或交给Agent**：保存JSON规划，导出Markdown/CSV/HTML；或将当前清单/路线、来源和核实任务追加到原生草稿，由用户确认发送。Agent可继续补充县域馆、开放公告和路书。

馆址详情可以看来源、收藏、加入清单或请Agent核实；“我的馆单”保存参观笔记，“路书与结果”回顾导出、路书和待确认更新。Agent结果先作为候选，用户确认才更新馆址。直接写output文件不会自动进入结果库，需在工作台保存登记。

## 数据与离线能力

- 包含**5,535条真实的2019年官方历史名录**，不是当前全国完整目录。等级/免费字段按历史年份理解。
- CSV包含城市、详细地址、坐标、展品、官网/公众号、开放时间及状态等列；官方基线未提供的字段留空，**尚未全量补齐地址和动态状态**。
- 初始苏州5馆址，4机构。高德搜索、用户确认及Agent核实可持续补全本机馆址，不覆盖私人旅行与笔记。
- 离线可检索名录、编辑已确认清单和路线、导出；地图和在线检索需要联网及用户自己的高德Web服务Key。100km为直线半径，不是道路里程。
- SQLite存私人事实，CSV/JSON用于基线、交换和可重建快照；数据库和演示旅行不打包。

## 本机使用与配置

要求Node.js ≥22.13（开发验证22.19；目标Desktop内置24.17），DSH具备register / isActive / ownsSession / ensureSession等工作台能力。运行期无需Python、外部数据库或自行安装React。

```bash
git clone https://github.com/xyb-openharness-dsh-plugins/find-museum.git
cd find-museum
npm run build
npm run dev
# 打开 http://127.0.0.1:4390/
```

首次保存时选择资料目录和旅行父目录。取消不会创建空旅行。已有旅行打开时不自动新建会话；新建旅行成功后请求Desktop建立该旅行文件夹的原生会话。独立浏览器预览只有提示词预览，原生会话需在Desktop里使用。

“数据与配置”提供高德Key申请指引及连接检查：[控制台](https://console.amap.com/dev/key/app)、[官方申请指南](https://lbs.amap.com/api/webservice/guide/create-project/get-key)。选择**Web服务**类型，按平台要求开通服务并检查配额，不混用Web端JS API Key。

Key仅存`~/.config/find-museum/local-secrets.json`，权限0600，不写网页、项目、Git或包。底图由本机服务代理高德静态地图，Leaflet提供拖动、缩放、点位和站序连线，停止操作后刷新底图。底图、馆址统一GCJ-02，保留图面署名；失败时馆单仍可使用。

## Desktop安装与版本

使用Release提供的`find-museum.tgz`，或本机打包。安装必须指向Desktop真实Profile，不能误装到CLI默认的另一套`~/.dsh`。目标环境、命令及安装副本核对见[安装与发布](docs/project/RELEASE.md)。安装后若需要重启，由用户完整退出再打开；未重启不宣称已加载。

```bash
npm run build
npm run check
npm test
npm run check:data
npm run pack:release
```

安装包的`package.json`、客户端版本及Release tag保持一致。检测结果、实际安装/加载状态和未验证项见[验收记录](docs/project/ACCEPTANCE.md)。公开市场收录是单独步骤，本仓库Release不等于已进入工作台市场。

## 开发入口

- [规格](docs/SPEC.md)、[任务](docs/TASKS.md)、[功能清单](docs/project/FEATURE-INVENTORY.csv)、[原型对照](docs/project/PARITY.csv)
- [数据结构](docs/project/SCHEMA.md)、[Desktop适配](docs/project/DESKTOP-ADAPTATION.md)、[交接](docs/project/HANDOFF.md)
- [开发经验](docs/LESSONS.md)、[官方规范快照](reference/official/development-2026-10-09.md)
- [旅行规划技能](skills/museum-route-planner/SKILL.md)：作为任务模板随旅行复制，不声称自动注册搜索工具。

由社区`xyb-workbench-starter`初始化。UI以已确认原型为基线，使用taste / frontend-design辅助；新的三步流程和4–8小时原则是用户确认的调整。感谢小x宝社区、dataelement社区与相关开发者的经验和贡献。

第三方组件与数据归属见[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES.md)。包当前标为UNLICENSED，不因此改变第三方组件的各自许可。
