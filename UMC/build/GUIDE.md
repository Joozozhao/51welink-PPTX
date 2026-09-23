# 片段创作指南（三位作者共用）

把微网通联 2026 业务介绍 PPT 的指定页面，从 PPTD DSL 源码**忠实地还原**为 HTML 幻灯片片段。

## 信息源（都在磁盘上，自己读）

- **DSL 源码（唯一权威）**：`../slides/NN.slide`（NN = 01–25，两位数）。PPTD JSX 方言：`<Slide>/<Box>/<Text>/<Image>`，全部绝对定位，画布 **1280×720**。数据数组（如 `const certs = [...]`）里的文本同样是正式内容，不得遗漏。
- **设计规范**：`../DESIGN.md`（配色/字阶/每页版式与约束）。
- **共享样式（必须使用，禁止重复定义）**：`design-system.css`。已含：品牌色变量、`.slide-head`（标题块）、`.kicker`、`.slide-title`、`.title-bar`、`.pageno`、`.card`、`.icon-tile`（含 .red/.navy/.dark 变体）、`.num`、`.reveal` 动效族、`.floaty`。
- **图片资源**：`assets/` 与 `assets/icons/`（先 `ls` 看可用文件）。

## 缩放规则（最重要）

DSL 中**一切**像素值 × 1.5 后才是舞台像素：坐标、宽高、字号、圆角、间距、描边。1280×720 → 1920×1080。

## 输出契约

- 输出文件：`part-N.html`（N=1/2/3），**纯片段**：若干个 `<section class="slide" id="s页码"> … </section>`，外加**一个** `<style>` 块放本片段的私有样式。
- 不要 `<!html>/<head>/<body>`，不要任何 `<script>`，不要引用 design-system.css（组装时统一引入）。
- **不要给 section 加 `active`/`visible` 类**（由播放器控制）。
- 私有样式的每条选择器必须以本页 section id 开头（例：`#s7 .cert-grid { … }`），防止跨片段串扰。
- 图片路径一律以 `assets/` 开头（片段最终会被组装进 `html-slides/index.html`）。
- 内容页（浅色底）统一结构：
  ```html
  <section class="slide" id="s7" style="background:var(--bg)">
    <div class="slide-head reveal">
      <div class="kicker">01 · 公司资质</div>
      <div class="slide-title">追求卓越 · 品质保证</div>
      <div class="title-bar"></div>
    </div>
    <!-- 页面主体，绝对定位 -->
    <div class="pageno">07 / 25</div>
  </section>
  ```
- **页码**：P2–P24 每页都要 `<div class="pageno">NN / 25</div>`（右下角，样式已有）。P1、P25 不要页码。**全片不要「微网通联 · 云通信业务介绍 2026」页脚文字**（用户已删除）。
- 封面/章节/封底（P1、P3、P11、P22、P25）用 `<section class="slide dark">`，自定义全屏版式。
- 图标：用 `assets/icons/<name>-<HEX>.png`（Font Awesome 实心，已按品牌色渲染，HEX 大写不带 #，如 `shield-halved-F02D4E.png`、`ring-2E6FE8.png`）。放进 `.icon-tile` 容器。禁止用 emoji 或外部图标库。
- 动效：给主要元素加 `class="reveal"`，用 `style="--d:0.15s"` 做阶梯延迟（0→0.45s 递增）；横向入场可用 `reveal reveal-left` / `reveal-right`；深色页的玻璃主体（地球/手机/盾牌）加 `floaty`。克制为主，不堆特效。
- 文字排版：西文/数字用 `var(--font-num)`（Archivo），巨型数字加 `.num`。中文正文字重 400–500，标题 700。

## 各页图片映射（AI 生成图，已在 assets/）

| 页 | 文件 | 用途 |
|---|---|---|
| P1、P25 | cover_hero.png | 全幅底图 + 深色渐变罩 |
| P2 | gen-toc-panel-flip.png | 目录左面板深色流光 |
| P3 | section_bg.png 底 + gen-ch1-globe.png | 玻璃地球（右，floaty） |
| P5 | gen-timeline-band.png | 底部红蓝流光横幅 |
| P11 | section_bg.png 底 + gen-ch2-phone.png | 玻璃手机 |
| P13 | gmp_dashboard.png | GMP 后台截图（不裁 UI） |
| P15 | sms_phone.png | 左 55% 大图 |
| P17 | gen-voice-wave.png | 左深色卡内声波 pill |
| P18 | gen-5g-card.png | 右卡 5G 光流填充 |
| P19 | rich_media.png | 左 55% 大图 |
| P20 | gen-scene-promo/service/content.png | 三张 3D 场景卡 |
| P22 | section_bg.png 底 + gen-ch3-shield.png | 玻璃盾牌 |
| P24 | client_01–24.png | 6×4 logo 墙（白底卡） |

logo_white.png / logo_dark.png / logo_since2008.png 按 DSL 引用。

## 禁止事项

- 禁止改动文案内容（以 DSL 为准，包括数据数组内的条目）；禁止 Lorem 占位。
- 禁止横向滚动、内容溢出 1920×1080；每页信息密度与 DSL 一致，不得自行删条目。
- 禁止 Inter/Roboto 等通用字体引入；字体由组装方统一加载。
- 禁止在片段里写页脚「微网通联 · 云通信业务介绍 2026」。

## 页面清单速览（版式约束详见 DESIGN.md 第 6 节）

P1 封面 hero / P2 目录三章 / P3 章节01 / P4 左文右卡(新三板红卡) / P5 横向时间轴7节点 / P6 荣誉奖卡栅格(10图标) / P7 资质徽章栅格(圆环+图标×6) / P8 服务网络大数字 6/34 / P9 研发能力 2×2 卡 / P10 巨型数字业务规模 / P11 章节02 / P12 左引导+2×3 产品矩阵 / P13 GMP 双栏55:45 / P14 GMP 三列功能 / P15 企业短信左图右文 / P16 UMC 六指标带 / P17 语音验证右流程 / P18 5G消息左特点右大卡 / P19 富媒体左图右文 / P20 三域场景卡+行业标签 / P21 一键认证左文右卡 / P22 章节03 / P23 极致服务 40:60 / P24 logo 墙 / P25 THANKS 封底
