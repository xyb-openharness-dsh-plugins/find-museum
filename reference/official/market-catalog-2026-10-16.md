# 工作台目录协议

一个 GitHub 仓库对应一个工作台条目，文件名为 `data/workbenches/<owner>__<repo>.yml`。仓库地址就是目录身份，不另外申请 ID；重命名或转移后应更新到当前主页，旧重定向地址不能重复收录。

## YAML 只保留目录编排信息

```yaml
url: https://github.com/owner/repo
name: 项目助手
nameEn: Project Assistant
category: productivity
description:
  zh: 帮助整理项目资料、跟进任务并生成工作报告。
  en: Organize project materials, track tasks, and generate work reports.
screenshots:
  - https://raw.githubusercontent.com/owner/repo/main/docs/images/overview.webp
  - https://raw.githubusercontent.com/owner/repo/main/docs/images/result.png
# 可选：明确选择预构建安装包；npm 仍优先。
# tarball: https://github.com/owner/repo/releases/latest/download/custom-workbench.tgz
```

| 字段 | 要求 |
| --- | --- |
| `url` | GitHub 仓库主页，与文件名一致 |
| `workbenchId` | 可选兼容字段；若已有 YAML 保留，值必须等于由仓库推导的 `wb-<owner>-<repo>`。新投稿省略。宿主不要求 `register({ id })` |
| `legacyWorkbenchIds` | 仅旧工作台身份迁移时使用的可选数组；保留现有条目的迁移值，新投稿通常省略 |
| `name` | 必填，中文市场展示名称，非空单行字符串 |
| `nameEn` | 可选，英文市场展示名称，非空单行字符串；旧条目缺失时客户端回退到 `name` |
| `category` | [七个分类](../data/categories.json)之一 |
| `description.zh` / `description.en` | 中英文均必填、非空单行；不接受未支持的语言键，不限制为恰好一句或固定字数 |
| `screenshots` | 1–5 个源仓库托管的完整 HTTPS 图片地址，第一张为封面 |
| `tarball` | 可选，同仓库 GitHub Release 的 `.tgz` / `.tar.gz` URL，不是安装命令 |

[完整 example](../examples/workbench.yml)直接使用正式 [Schema](../schema/workbench.schema.json)校验。不要填作者 ID、版本、源码 commit、npm 包名、校验值、验证记录或权限表。这些分别来自 GitHub、工作台包、自动探测及 PR 审核材料。新投稿不需声明运行时 ID。输入 YAML 没有独立 `schemaVersion`，输出目录保留机器协议版本。

## 安装来源：npm → Release → 源码

1. **npm**：从源码 `package.json.name` 发现包名。源码与 npm 最新发布版本的 `repository` 都指回该 GitHub 仓库才采用；下载包，校验 registry 的 SHA-512 integrity、包名、版本和可安装文件。输出精确版本、固定下载地址及 SHA-256，客户端不能重新解析 latest。
2. **Release**：无可用 npm 映射时，使用作者可选填写的 `tarball`。支持固定 tag 或 `latest/download/<作者指定的资源名>`；后者解析为指定资源的固定 tag 下载地址。检查实际包并计算校验值，不按附件数量或文件名惯例猜测安装包。
3. **源码**：无可用 npm 映射且未声明 tarball 时，使用仓库默认分支解析出的完整 commit，检查实际入口及 bundle patch。仓库中存在 Release 不会隐式改变此选择。

已声明 tarball 缺失或校验失败、npm/网络暂不可验证时，停止本次候选发布并保留上一线上目录；不静默改用另一个安装源。作者可通过 PR 修正或删除 tarball。暂不支持逐条缓存或降级。

## 信息来源

- 名称：作者填写的中文 `name` 与英文 `nameEn`，用于市场列表页展示；均为非空单行字符串，不被仓库名或包名覆盖。旧条目没有 `nameEn` 时客户端使用 `name`。
- 简介由 YAML 的 `description.zh` 和 `description.en` 提供，离线预览和在线目录均保留两种语言，不使用 GitHub About 或 manifest 覆盖。
- 仓库身份、作者归属和许可证：GitHub 仓库元数据。
- 包名、版本、安装地址和校验值：源码与选中发布包的 `package.json`。

这些信息随定期探测刷新。修改 GitHub About、发布新包或更新原路径图片都不需要目录 PR。双语名称、分类、双语介绍和截图顺序属于市场编排，无法可靠地从 repo 元数据获取，因此保留在 YAML。

源码默认分支可能比正式 npm/Release 版本更新，因此不要求二者版本相同。目录唯一键是仓库 `owner/repo`；运行时 ID 由宿主按仓库身份派生。目录输出的 `workbenchId` 仍为 `wb-<owner>-<repo>`，仅供旧消费者兼容，不代表插件必须传 `register({ id })`。输入若保留该字段，目录构建检查其与派生值一致。

## 截图标准

- 截图声明仅在 YAML，不从 README、`screenshots.json` 或 manifest 补充。
- 图片上传到条目对应的源仓库，YAML 填完整 HTTPS 地址，不接受相对路径。推荐 `https://raw.githubusercontent.com/owner/repo/<ref>/path/image.webp`；也接受 `https://github.com/owner/repo/blob/<ref>/path/image.webp`，探测时转换为 raw 直链。
- 图片地址可使用分支、tag 或 commit；需要固定图片内容时建议填写 commit 地址。截图引用独立于源码安装 commit，不自动改写为默认分支版本。
- 1–5 张静态 PNG/JPEG/WebP；单张不超过 2 MiB，总像素不超过 16 MiPixels。校验真实格式、扩展名、完整解码与大小。
- 不允许本地路径、HTTP 明文地址、其他仓库或第三方托管地址、凭据、查询参数、片段、编码逃逸或重复图片地址；同一图片的 blob/raw 两种写法也视为重复。
- 第一张为封面，按列表顺序显示，辅助文本由工作台名称和图片序号生成。
- 建议横向 16:9、宽度至少 1280px；比例不是硬门槛，展示端等比适配。
- 必须是真实产品画面，拥有素材使用权，不含凭据、个人信息或客户数据。截图必须从最终可安装版本中实拍，图片内容应与用户实际安装版本相符，由作者维护、人工抽查。

修改图片内容或发布版本无需目录 PR；双语名称、双语介绍、图片地址、顺序、分类、仓库地址或 tarball 选择改变时更新 YAML。

## 包与宿主

当前只支持仓库根目录的一个工作台，暂不支持 monorepo 子目录。源码根目录及最终选中的 npm/Release 包都以 `package.json` 为安装事实源：必须包含完整 SemVer 版本、指回条目仓库的 `repository`、安全的 `dsh.bundle.patch`、注入 `dsh-desktop-workbenches` 的客户端声明，以及安全且真实存在的 `exports["./client"]`。无需额外维护 `workbench.json`；展示名称和双语简介来自目录 YAML，兼容 `workbenchId` 由仓库身份派生，布局和行为由插件加载后注册。

包不超过 8 MiB，解包不执行代码，拒绝越界和链接；单文件不超过 8 MiB、解包总大小不超过 64 MiB，并限制文件数。源码安装要求 bundle patch 与客户端入口已经存在，目录构建不替作者编译。能力和权限字符串不作为可信安全声明；需要权限控制时应由宿主提供并执行真实授权协议。

包的静态检查由本仓库的 `scripts/probe-lib.mjs` 和 `npm run check` 执行；运行时 ID 和注册协议以目标 Desktop 版本的 `dsh-desktop-workbenches/client.js` 为准。静态检查通过不代表所有 Desktop 发布版本兼容，投稿仍需记录实际验证的宿主版本；目录消费者接入和安装需独立验收。

## 客户端索引

`npm run probe` 解析安装优先级并校验，在 runner 的 `data/index.json` 生成客户端索引，输出 `distribution`、实际版本、源码 commit、`updatedAt`、兼容 `workbenchId`、图片 URL、校验值及探测状态。`updatedAt` 是默认分支最新 commit 的提交者时间，规范化为 UTC ISO 时间；GitHub 未返回有效时间时为 `null`。旧版索引可缺少该字段。它与统计采集时间 `metrics.*.checkedAt` 不同，也不表示 npm 或 Release 的发布时间。不要把这些生成字段抄回 YAML。

`data/index.json` 不提交；GitHub Actions 将整个 `data/` 目录上传为 Pages artifact，因此发布后索引位于站点根路径 `/index.json`。全部探测通过后才替换 Pages 部署。首次收录经过人工审核，后续发版由作者负责并自动探测；这不意味着每个后续版本经过人工审核或安全审计。


正式 JSON 由 [catalog.schema.json](../schema/catalog.schema.json)校验，版本保持 `schemaVersion: 2`。版本 2 输出保留必填的 `workbenchId` 兼容字段，由仓库身份派生；新 YAML 不必填写。宿主的规范身份为仓库 `owner/repo`，消费者应以 `id` 为条目身份，不能要求插件显式传入 `register({ id })`：

| 安装类型 `distribution.type` | 消费者必须读取的目标 |
| --- | --- |
| `npm` | `name`、精确 `version`、`url`、`integrity` 与 `sha256` |
| `github-release` | 固定 `url`、`version`、`sha256` |
| `github-source` | 仓库 `url` 与完整 `commit` |

三种类型都包含实际版本；消费者按 type 分支处理，不能从描述或命令字符串反推安装目标，不能遇到损坏包后悄悄换来源。顶层条目版本必须与选中安装版本一致，仓库身份、源码 commit 和截图所属仓库有跨字段校验。未知字段及非成功探测结果不能进入正式输出。候选探测阶段和正式发布前都执行同一输出校验。

投稿和客户端索引是两个契约，前者不携带版本字段；后者变更不兼容结构时必须升级 schemaVersion，并说明消费者迁移。

## 平台采集的统计（可选扩展）

发布条目新增可选 `metrics`，由目录发布任务采集，不允许作者在 YAML 填写：

```json
{
  "metrics": {
    "githubStars": { "value": 12, "checkedAt": "2026-09-21T03:23:00.000Z", "status": "ok" },
    "npmDownloads30d": { "value": 45, "checkedAt": "2026-09-21T03:23:00.000Z", "status": "ok", "start": "2026-08-22", "end": "2026-09-20" },
    "githubReleaseDownloads": { "value": 12, "checkedAt": "2026-09-21T03:23:00.000Z", "status": "ok" }
  }
}
```

- `githubStars` 来自 GitHub REST 仓库的 `stargazers_count`，不是平台点赞数。
- `npmDownloads30d` 仅查询已通过安装来源校验的 npm 包；截至 UTC 昨天的 30 天窗口，不是安装量、活跃用户或独立用户数。不累计 GitHub Release 下载。
- `githubReleaseDownloads` 仅用于 `github-release` 分发：累计该仓库所有已发布（非草稿）Release 中、与分发地址同名的安装包文件的 `download_count`，版本升级后总数不清零。它是下载次数，同样不是安装量或用户数；旧目录可能没有这个字段。
- `ok` 表示成功采集或仍在缓存有效期内；`stale` 保留最后成功值及其原始采集时间、下载窗口；`unavailable` 表示没有可用值；`not_applicable` 用于分发方式不适用的下载统计（非 npm 的 `npmDownloads30d`、非 GitHub Release 的 `githubReleaseDownloads`）。
- 无值时 `value` 和 `checkedAt` 均为 `null`；真实的 0 保留为数字 0。客户端不能把未知值转换成 0；过期数据应显示更新时间，排序不能把未知当成零下载。
- `metrics` 缺失的旧目录仍符合 v1；使用旧版严格 Schema 的客户端需要同步此可选字段定义，再消费新版目录。安装字段没有变化。统计不可用不等于工作台安装探测失败。

实现借鉴 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的集中采集、失败保留和明确日期窗口；本目录复用已验证的 npm 分发身份，按仓库/包去重，逐包限速请求，不复制其 README 解析或模糊仓库匹配。
