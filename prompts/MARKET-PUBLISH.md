# 市场发布提示词

以下是作者提供的后续投稿指令；保存不代表验收或投稿已经完成。

---

我想将已有的 DSH Desktop 工作台https://github.com/xyb-openharness-dsh-plugins/find-museum投稿到公共工作台市场。请先核实工作台项目、最终可安装版本、本机安装实测结果和我有权公开的仓库；这条通用指令不代表这些前提已经完成。若项目或验收证据缺失，先说明并完成能做的检查，不要凭空声称已验证或直接提交。

先阅读并遵循工作台市场验收规范：https://dshdesktop.com/workbench/docs/market-acceptance.md 。它包含上传 GitHub、安装来源、上架资料、收录 PR 和验收清单。先确认要公开的仓库和内容，不得公开密钥、业务数据或未经授权的私有代码。确认投稿前提和公开范围后，按规范的上架流程，把代码提交到我自己的公开 GitHub 仓库，并根据项目已有的可安装来源选择仅源码、GitHub Release 或 npm 路径。先读取项目真实脚本和工具帮助，不要编造发布命令。

然后向 https://github.com/dataelement/awesome-dsh-workbench 提交一个 PR，只新增 data/workbenches/<owner>__<repo>.yml。格式以该仓库的 catalog/README.md 为准：url、name、category、description.zh 和 description.en 必填，screenshots 填 1–5 张我仓库里的真实截图地址，没有 npm 时可以填 tarball。category 填 other（其他），这是作者自己选的分类，不要改成别的。现有分类都不合适，请在 PR 描述里写一句“建议新增分类：旅行”，由市场维护者决定是否新增。不要填写版本、npm 包名或校验值，也不要修改生成的文件。使用我已经授权的 GitHub 网页或 gh；缺少登录或公开授权时，先完成能完成的部分，再准确说明缺什么。

提交前按规范第 6 节的验收清单逐项自查。提交 PR 就是进入审核，本机不保存投稿状态。只有拿到真实 PR URL 才能说“已提交”；PR 合并且市场目录能读到条目后才能说“已上架”。最后给我发布地址、PR URL、目录是否可见、验收证据和仍未完成的事项。
