# 0.2.2验收

- 四份新SVG完成XML/viewBox检查，4391服务读取4份资源均为200和image/svg+xml。
- 实际浏览器打开档案页全页截图，冬梅位于正常文档流右下角留白，不遮挡正文与操作；其他三个页面对应资源已绑定，未逐页获取截图。
- build/check、49项Node22自动测试、实际tgz解包运行和凭据扫描通过。
- 包含58文件，488337字节，SHA-256：82eb49f4efb98a39f2bbc37303173ccceb0d2cfa569b6a7a8718fb515ffa24de。
- 安装到Desktop web Profile，17个关键文件与源码一致、15个依赖可解析；内置Node24.17加载已安装服务入口，48条路由注册及health/目录检查通过。该检查鉴权使用测试替身，不能代替真实Desktop会话。安装前Profile备份在~/.config/find-museum/backups/desktop-v0.2.2-*。
- 4390/4391开发服务已更新，原资料根保留。Classic与打印隐藏装饰。
- Desktop运行中是否热加载新版未验证，仍保留上轮原生会话/重启恢复/市场截图待验项。预发布不等同市场上架。
