# 公共页面库 + 组装导出功能站 · 实施方案

> 状态：2026-10-22 M1–M3 已完成；38 个公共页与 PDF 导出已验收。基础执行：Kimi；前端复核：Gemini；集成验收：Codex。详见 `Pages/ACCEPTANCE.md`。M4 为后续增强。

## 一、需求与结论

把各套 PPT 里做得好的页面沉淀为**公共页面**，做新 PPT 时按需拿取、组装，并导出 PDF。形态为一个随资料中心发布的 **Pages 功能站**：浏览页面库 → 勾选页面 → 排序组装 → 导出 PDF。

**结论：可行。复用现有 HTML 页面和 PDF 打印流程，新增页面入库、选页组装、方案存取与网页导出入口。** 依据：

1. 首批来源 UMC、Corp、Push 的幻灯页使用 `<section class="slide" id="sN">`，可提取正文、页面样式与资源依赖。2026-10-22 重新按 DOM 标签核实：分别为 25、31、29 页；初稿的 Corp 77、Push 73 是字符串匹配误计。
2. 多套资料共用海军蓝、通信蓝和品牌红等基础变量，但同一色值不能证明所有样式一致。公共层以正式 UMC 规范为准，逐页保留必需的版式规则，再通过实际渲染验收。
3. UMC 有可复用的导出源码：`UMC/build/export-deck.mjs` 的 Playwright 打印参数与 `normalize-pdf.py` 的中文字符映射修正。本项目会重新验收组装后的 PDF，不沿用旧文件的验收结论。
4. UMC 的 part-1/2/3.html 与 `assemble.mjs` 可参考；公共库还必须处理重复选页、页码重排、资源路径及跨页面样式隔离。

## 二、目录结构（新增三层，不动现有 deck）

```
shared/                        # 公共层（进 zip、进 git）
  design-system.css            # 唯一设计规范源：从 UMC index.html 内联 token 抽取
  page-contract.md             # 页面契约（见第四节）
  pages/                       # 公共页面库，按类别分目录
    cover/ section/ content/ data/ case/ end/
      <page-id>.html           # 一个真实幻灯页的完整文档，保留文字与矢量图；iframe 隔离样式
      <page-id>.png            # 缩略图，脚本生成
Pages/                         # 功能站（进 zip、进 git，随资料中心发布）
  index.html                   # 单页应用：页面库 / 组装条 / 预览导出 三视图
  studio.css  studio.js
  renderer.js                  # 网页预览与后端 PDF 共用的组装逻辑
  pages.json                   # 页面清单（脚本生成：id/标题/标签/来源deck/缩略图路径）
  decks/                       # 随站提供的示例方案 *.deck.json
Pages/build/                   # 本机脚本（进 git；pack.sh 显式排除，不进 zip）
  package.json                 # Playwright；PPTX 在 M4 单独实施
  serve.mjs                    # 本机网页与 PDF 导出接口，默认 127.0.0.1
  scan-pages.mjs               # 扫描 shared/pages → 生成 pages.json + 缩略图
  build-deck.mjs               # deck.json → 拼接 assembled.html（仿 UMC assemble.mjs）
  export-deck.mjs              # assembled.html → PDF/PPTX（由 UMC 同名脚本通用化）
  normalize-pdf.py             # 从 UMC 平移
  verify.py                    # 页数、文字覆盖、资源引用、清单同步校验
```

根目录 `index.html` 增加一张 "公共页面组装站" 导航卡片；`pack.sh` 排除 `Pages/build/`、`Pages/tests/`，构建产物不进发布包。完整仓库作为静态发布根，公共页使用的原素材一并保留。

## 三、功能站三个视图

1. **页面库**：缩略图网格，按类别（封面/章节/内容/数据/案例/结尾）、标签、来源 deck 过滤，支持标题搜索。
2. **组装条**：点击缩略图加入当前方案，支持重复选页、拖拽与上下移动排序、复制、移除、清空和撤销。草稿自动保存在本浏览器；命名方案保存在 localStorage，JSON 下载/导入用于备份和换电脑。静态网页不能直接写仓库目录，不显示虚假的“已保存到文件”。
3. **预览与导出**：单页及整册预览；页面中有实际可用的“导出 PDF”按钮。
   - 本机服务：页面调用 `/api/export`，Playwright 打印当前方案 → 中文文字映射修正 → 下载 PDF；不需要每次运行导出命令。
   - 纯静态托管：网页生成相同组装文档并打开打印，选择“另存为 PDF”。此模式无法运行 Python 后处理，验收时单列其中文字映射边界。
   - CLI 保留供构建维护使用，与网页共用 `renderer.js`，不作为日常操作前提。

## 四、页面契约（入库门槛，保证"拿取即用"）

`shared/page-contract.md` 写明并在 verify.py 中机检：

- 文档中恰为一个 `<section class="slide">`，舞台 1920×1080；组装时各页独立隔离，重复选页不会冲突。
- 品牌色/字体/公共字阶以 `shared/design-system.css` 为准；提取旧页允许保留必需的局部布局、图示颜色和装饰规则，不借入库重新设计源稿。
- 不依赖所在 deck 的全局 JS；动画类（reveal/floaty）遵循统一类名，导出脚本会强制终态。
- 公司/项目特定文案用 `{{var}}` 占位（M4 做变量填充表单），通用文案直接写死。
- 每页带元数据注释头（id、标题、标签、来源 deck、入库日期），scan-pages.mjs 据此生成清单。

## 五、分期与验收

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| M1 公共层 | 抽 design-system.css；建 shared/pages 六类目录；scan-pages.mjs 生成清单+缩略图；Pages 站只读网格上线 | 浏览器打开 Pages 站可浏览全部入库页；verify.py 通过 |
| M2 组装器 | 选页、拖拽排序、方案存取 deck.json、iframe 预览 | 保存的方案刷新后可恢复；预览页序与方案一致 |
| M3 导出 PDF | build-deck.mjs + export-deck.mjs 通用化 + normalize + verify | 对一首批方案导出 PDF：页数一致、文字可搜索复制、无缺失资源 |
| M4 增强 | `{{var}}` 变量填充表单；PPTX 导出跟进；内容页模板扩充 | PPTX 中标题/正文/页码为原生可编辑文本框 |

**首批入库**：从 UMC(25 页) + Corp(31 页) + Push(29 页) 精选 20–40 页，覆盖六类。Voice / GMP_Hospital / GMP_Quote 后续逐页检查规范与适配成本再收。

## 六、给 Kimi 的执行要点

1. 先读 `UMC/build/GUIDE.md` 与 `UMC/build/export-deck.mjs`，复用 PDF 打印参数和中文修正；将 UMC 固定页数/路径等参数化，不改 UMC 源文件。M1–M3 不引入 PPTX 依赖。
2. design-system.css 从 UMC index.html 头部 `:root` 原样抽取，不改任何色值字阶。
3. 每完成一个里程碑跑 `python3 Pages/build/verify.py`，验收标准以上表为准；构建成功不等于验收通过。
4. 不改动现有 deck 文件。只增公共库/功能站、首页入口与相关构建忽略项；不运行会打包并提交所有脏改动的 `publish.sh`。
5. 完成后更新本文件的"状态"行，并在根 `index.html` 加导航卡片。

## 七、待确认决策点（不阻塞 M1）

1. 站点位置：默认仓库内 `Pages/` 随资料中心发布。
2. 首批入库页面：默认由执行方按六类精选 20–40 页，用户可在 M1 浏览站上点名增删。
3. 导出范围：M3 先 PDF，PPTX 在 M4 跟进。

