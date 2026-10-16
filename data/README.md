# 数据说明

- `processed/museums-national.csv`：2019年度全国博物馆官方历史名录，5,535条，32个省级分组（含兵团）。来源为中国政府网公开PDF；序号完整性与省份合并单元格边界已校验。不是当前全国完整名录。
- `processed/venues-suzhou.csv` / JSON：5个高德POI馆址的试点补充。机构与馆址分开，本馆/西馆不重复算两家国家名录机构。馆址坐标是GCJ-02。
- `processed/catalog-manifest.json`：来源、原文件与CSV哈希、数量及限制。
- `raw/`：开发采集证据，原PDF及行政区划匹配表。原文件不随插件打包。

字段含等级与年份、城市/区县、详细地址、坐标/坐标系、匹配状态、主题/展品、官网/公众号介绍与链接、常规开放时间、动态状态与有效区间。基础名录没有这些旅行字段时留空；全国目录当前没有全量坐标，不把省市中心坐标伪装为馆址。

`city_candidate`来自名称和行政区划字典的推断，与核实过的`city`分开；县域候选同理。数据年、采集日、公告有效日分别记录。试点`opening_status=unknown`，因为POI常规时间不足以证明出行当天开放。公众号介绍尚未逐馆核实，保持空值。

复现：Python开发环境需PyMuPDF，运行`python3 scripts/import-national.py`和`python3 scripts/build-pilot.py`。运行期不应依赖这两个开发脚本。行政区划候选字典来自modood/Administrative-divisions-of-China，许可见raw/administrative-license.txt；馆方页面摘要仅用于有来源的本地研究，公开分发前核对每个数据源的使用条件。地图供应商POI的长期保存和公开分发条件需在具体发布方案中核对。
