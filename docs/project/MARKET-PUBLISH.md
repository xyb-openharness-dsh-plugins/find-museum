# 公共工作台市场发布入口

作者原始指令：[MARKET-PUBLISH.md](../../prompts/MARKET-PUBLISH.md)。保存提示词不代表已经投稿。

## 固定投稿内容

- 仓库：xyb-openharness-dsh-plugins/find-museum，作者已授权公开源码和安装包。
- category：other；PR描述必须包含“建议新增分类：旅行”。
- 只新增data/workbenches/xyb-openharness-dsh-plugins__find-museum.yml，不改生成文件。
- 最终字段按catalog/README.md：url/name/category/description.zh/en、1–5张仓库内最终安装版本的真实Desktop截图，可填tarball；不填版本、npm包名或校验值。
- 无npm路径，优先经过下载核对的GitHub Release固定附件。预发布不能依赖releases/latest/download作为稳定来源；准备好正式发布后再使用latest，或使用明确tag地址。

## 2026-10-16投稿检查

已保存当日官方市场验收规范与目录合同到reference/official。开发前已有0.1.0预发布，不以旧包证据冒充0.2验收。当前源码MIT已获作者确认；第三方归属继续保留。

| 官方第6节 | 当前状态 |
| --- | --- |
| 最终安装来源、版本、包检查与实际打开证据 | 0.2.5构建、包检查和本机安装见[验收记录](ACCEPTANCE-0.2.5.md) |
| 公开仓库、许可证、无Key与用户数据 | 仓库公开且采用MIT；私密内容检查通过 |
| 可用安装来源且包<8MiB | 0.2.5发布包6,177,304 bytes；包内运行和私密内容检查通过 |
| 开发规范4–7节目录、归属、模式、侧栏、图标 | 用户确认全部实机验收通过，详见[验收记录](ACCEPTANCE-0.2.5.md) |
| 收录YAML与真实截图 | 沿用仓库已有真实工作台截图，投稿条目仅新增一条YAML |
| PR仅新增一条YAML且描述验收平台 | 已提交 [PR #57](https://github.com/dataelement/awesome-dsh-workbench/pull/57)，仅新增一条YAML |

## 尚不能声称的状态

PR #57已提交，等待市场维护者审核；合并和目录实际读取后才记“已上架”。本机不存投稿状态，本文只是开发与验收说明。
