# API 合同

API 前缀：/api/<项目唯一slug>；鉴权由宿主 connection 合同处理，不因 loopback 就跳过。

| 方法/路径 | 意图 | 输入字段/类型/约束 | 成功响应 | 错误码 | 读写实体 | 幂等/事务 |
| --- | --- | --- | --- | --- | --- | --- |
| GET /health | 版本与能力 | 无 | version/apiVersion/capabilities | capability_unavailable | 无 | 只读 |

通用字段：subject/project ID、occurredAt 的时区、单位、revision、来源 ref、reviewState、request ID。列出空记录、非法输入、主体不存在、取消、并发覆盖、服务不可用的实际响应。

读模型样例和写命令样例各一份。前端未知字段如何兼容？修改何时使快照过期？本地与外部能力错误如何区分？
