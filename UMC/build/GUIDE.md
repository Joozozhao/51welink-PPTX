# UMC 演示文件维护

当前正式版本为 **25 页**，保持现有文案与设计。入口为 `../index.html`，对应下载文件为 `../UMC.pptx`、`../UMC.pdf` 和 `../UMC.zip`。

## 源文件与组装

- `_top.html`：完整 HTML 头部、公共样式及舞台起始标签。
- `slide-styles.html`：所有页面的私有样式，按原始顺序保存。
- `part-1.html`：第 1–9 页。
- `part-2.html`：第 10–20 页，包含语音线路两页。
- `part-3.html`：第 21–25 页。
- `_bottom.html`：舞台结束标签、播放器、编辑器与下载入口。

直接修改 `index.html` 后，运行 `node build/sync-sources.mjs`，把正式版本同步至片段。
修改片段后，运行 `node build/assemble.mjs` 生成 `index.html`；组装会校验总页数、连续页码和已移除业务。
上述命令均在 UMC 目录运行。

`design-system.css`、`_chrome.css`、`_new-slides.html` 是历史参考，当前组装不再读取，避免引入旧版内容。

## 导出与打包

本机构建脚本优先使用已安装的 Codex 工作区依赖。其他电脑可在 build 目录执行 `npm install`，并按 Playwright 指引安装浏览器。Python 导出后处理和验证需要 `pypdf`。

1. `node build/export-deck.mjs`：将当前页面导出到 `build/generated/`。
2. 验证 `build/generated/UMC.pptx`、`build/generated/UMC.pdf` 后，复制到 UMC 根目录替换同名文件。
3. `python3 build/verify.py`：检查正式文件的页数、文字覆盖、资源引用和源片段同步情况。
4. `python3 build/pack.py`：生成独立可用的 `UMC.zip`，包含页面、全部资源、两种导出文件及当前构建源码。

PPTX 中正文、标题、数字、页码均为原生文本框，可在 PowerPoint 中选择和编辑。为保留网页设计，装饰、背景、图像及卡片外观保留为页面背景图；图片中原有文字仍属于图片。文本框按原排版行拆分，字体使用 Arial / Heiti SC，其他电脑可能需要安装字体或指定中文替代字体。
PDF 从 HTML 直接打印，并修正浏览器字体的中文字符映射，具有可搜索、复制的真实文字层。
ZIP 不包含自身、旧截图、构建缓存、备份、依赖目录和个人工作记录。

`make-pptx.mjs` 已转至同一导出入口，不再使用截图生成整页图片 PPTX。导出后需分别进行内容检查、可编辑性检查和渲染检查，不能以生成成功替代验收。
