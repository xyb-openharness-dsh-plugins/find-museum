# 结果交换合同 · schemaVersion 1

路书包括：旅行条件、Day N、用户安排的馆址顺序、每馆亮点与是否在展、4小时基本参观或6–8小时深度参观、交通证据、开放/预约待办、备选和来源索引。不要规划1–2小时打卡，不要求出发时刻。

工作台当前接收**完整馆址候选**，不是任意字段补丁。输入 `schemaVersion: 1`、当前 `tripId`、当前 `inputRevision` 与 `venues` 数组（1–30项）。每个馆址必填：

| 字段 | 约束 |
| --- | --- |
| id | 稳定馆址ID，字母数字、点、横线、下划线；更新既有馆址沿用原ID |
| museumId | 机构ID；分馆不重复造机构，无法确认时保留独立研究ID |
| name / address | 核实的馆名和详细地址 |
| longitude / latitude | 真实数值；不得把城市中心当馆址 |
| crs | 当前地图要求 GCJ-02，其他坐标先通过高德核实 |
| sourceUrl | 实际HTTP(S)来源，不能填写占位链接 |
| openingStatus | unknown / open / closed / partial / seasonal |

可选：city、province、district、county、themes、intro、featuredExhibits、exhibitSource、officialUrl、introSource、reservationUrl、wechatName、wechatUrl、wechatIntro、grade、gradeAsOf、openingHours、checkedAt、publishedAt、validFrom、validTo、statusNote。

非unknown状态必须有核实时间和真实的生效起止日期（YYYY-MM-DD）；日期不能倒置。常规开馆时间不能推出当前开放；当前日期不等于公告有效日。历史等级保留年份，无法访问的公众号留空。

工作台提示词中附带当前旅行ID/revision；数值示例只能说明结构，必须换成查证值。导入后先预览候选，用户确认才更新本地馆址。旅行已变更时拒绝旧revision，重新读取后再提交；过期候选仍可拒绝。搜索多选的第二步由用户显式确认后，馆址和路线在同一事务中写入。

路书可输出 Markdown / HTML / 纯文本，用户用“保存路书”登记为文件和结果记录。Agent直接写output文件不会自动被监听或登记。不能直接修改SQLite；route.json和input/selected-museums.json是只读生成快照。
