# 公共页面契约（welink-v1）

入库页面位于 `shared/pages/<category>/<page-id>.html`，必须满足：

1. **自包含单页**：完整 HTML 文档，恰含一个 `<section class="slide">`，舞台 1920×1080。
   页面私有样式内联，资源使用仓库相对路径（`../../../<Deck>/...`），不依赖所在 deck 的全局 JS。
2. **静态终态**：不依赖播放器脚本即可呈现最终状态（`.reveal`/`.floaty` 等动效类由页面内
   覆写样式强制为终态），截图、打印、组合导出结果一致。
3. **iframe 隔离**：页面之间互不共享 DOM/CSS 作用域；组合时由 Pages/renderer.js 逐页 iframe 装载。
4. **设计规范**：颜色/字体/字阶来自 `shared/design-system.css`（welink-v1 token）同源抽取，
   不新增硬编码品牌色，不新增 Google Fonts / CDN 依赖。
5. **页码覆写**：页面内 `.pageno` 默认保留来源 deck 原始页码；组合时通过
   `?page=N&total=T` 查询参数覆写为 "NN / TT" 格式（页面内置脚本处理）。
6. **元数据头**：HTML 首部注释包含 `@page-id / @title / @category / @tags / @source / @extracted`，
   `Pages/build/scan-pages.mjs` 据此与选页清单生成 `Pages/pages.json`。
7. **事实文案不改**：抽取只改路径与隔离覆写，不改动任何正文、数字与品牌文案；
   已移除业务（一键认证、中间号、聚WU 等）所在页面不入库。

类别：`cover 封面 / section 章节 / content 内容 / data 数据 / case 案例 / end 结尾`。
