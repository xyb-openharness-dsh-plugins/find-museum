# 寻馆 · Museum Atlas

在目的地城市发现大馆，也给周边100km内的县域馆、专题馆留一些时间。DSH Desktop 工作台：左侧65%为业务区，右侧保留唯一的原生Agent会话。

仓库：https://github.com/xyb-openharness-dsh-plugins/find-museum

## 使用流程

1. **搜索并建清单**：选择目的地，检索本地名录或高德POI；单选、多选、一键全选后加入旅行清单。这一步不分配时长或Day N。
2. **排序与调整**：打开“设计路书”的编排弹窗，拖拽或用上下箭头排序，选择Day 1–30。每馆4小时基本参观、6或8小时深度参观；每日统计不含交通和用餐。
3. **保存和回顾**：保存到“路书档案”，浏览冻结版本、继续设计，下载HTML/Markdown/CSV/JSON或复制摘要交给旅伴；也可将当前清单或指定档案追加到原生Agent草稿，由用户确认发送。Agent结果可登记为待确认附件。

没有旅行时可先在当前浏览器来源暂存清单，下一步再新建或选择旅行；暂存会明确标识尚未保存。

我的收藏支持博物馆、美食、景点、Citywalk，以及独立的“想去/去过”和笔记。特色小吃、本地餐馆、老字号、周边景点和Citywalk标签按需检索最多5个真实高德候选，单选、多选或全选后保存；不冒充大众点评榜单。博物馆4–8小时规则不套用餐饮和其他地点。手动添加的未定位地点仍可收藏和编排。

馆址详情可以看来源、收藏、加入清单或请Agent核实；“我的收藏”保存参观笔记，“路书档案”回顾导出、路书和待确认更新。Agent结果先作为候选，用户确认才更新馆址。直接写output文件不会自动进入结果库，需在工作台保存登记。

## 宋韵外观与路书

默认宋韵：仿宋、天青与浅绿、薄线和留白；顶栏可切换经典外观，旅行数据不随外观切换。风格合同见[宋代风格外观](docs/project/宋代风格外观.md)，传统建筑及器物意象素材见[SVG素材库](assets/song/README.md)。保留旧经典模板供对照。

档案下载前先查询高德最新POI常规开放时间与天气，显示变化、闭馆线索和未核实项；用户采纳后另存核实版，原路书不覆盖。天气覆盖旅行首尾各加一天；服务只提供当前及未来3天，范围外明确待更新。POI和常规时间不证明出行日一定开放，临时公告需馆方核实。

HTML路书含封面、Day N、介绍、展品、交通、开放时间、天气、清单与来源，可离线阅读和A4打印。[设计样稿](design/roadbook-guofeng-v0.1.html)使用标注时点的预报，不是实时页面。自动网络图片转文物线稿暂未实现，现有透明SVG为原创意象。

“和 Agent 定制 HTML 路书”准备所选冻结版本的上下文，先互动确认偏好，再使用当前会话真实可用的搜索/地图/审美工具补充介绍、文物及交通。只追加原生草稿；用户发送、审阅，再通过“登记 Agent 结果”保存。生成文件不会自动进入数据库。

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

“数据配置”提供高德Key申请指引及连接检查：[控制台](https://console.amap.com/dev/key/app)、[官方申请指南](https://lbs.amap.com/api/webservice/guide/create-project/get-key)。选择**Web服务**类型，按平台要求开通服务并检查配额，不混用Web端JS API Key。

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

第三方组件与数据归属见[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES.md)。项目自有代码采用MIT许可证，第三方组件和数据保持各自许可及归属，不因本项目MIT许可而改变。

## 0.2开发与市场投稿

0.2新增导航分布、下一步引导、配置折叠、跨类型收藏、按需推荐、冻结路书版本和分享。与真实界面共用代码的原型为`design/prototype-v0.2.html`（`npm run design`），保留0.1原型供对照。

市场发布提示词保存在[prompts/MARKET-PUBLISH.md](prompts/MARKET-PUBLISH.md)。按作者要求category为other，并在收录PR中建议新增“旅行”分类。具体前置检查见[市场发布检查](docs/project/MARKET-PUBLISH.md)。本机安装成功、实际打开、市场提交和已上架是不同状态，分别取证。
