import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { createRequire } from 'node:module';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '../..');
const pagesDir = path.resolve(repoRoot, 'shared/pages');
const pagesJsonPath = path.resolve(repoRoot, 'Pages/pages.json');
const decksDir = path.resolve(repoRoot, 'Pages/decks');

let require;
for (const base of [dir, process.env.NODE_PATH, '/Users/joozo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']) {
  if (!base) continue;
  try {
    const r = createRequire(path.join(base, '_loader.cjs'));
    r.resolve('playwright');
    require = r;
    break;
  } catch {}
}
if (!require) throw new Error('Playwright not found in bundled dependencies');
const { chromium } = require('playwright');

const CURATED = [
  // cover
  { cat: 'cover', id: 'umc-cover', deck: 'UMC', sid: 's1', title: '微网通联业务介绍 · 封面', tags: ['封面', '业务介绍', '云通信', '深色'] },
  { cat: 'cover', id: 'corp-cover', deck: 'Corp', sid: 's1', title: '微网通联业务与全业务介绍 · 封面', tags: ['封面', '新媒体', '智慧车场', '深色'] },
  // section
  { cat: 'section', id: 'umc-sec-about', deck: 'UMC', sid: 's3', title: 'PART 01 · 公司介绍', tags: ['章节', '公司介绍', '深色'] },
  { cat: 'section', id: 'umc-sec-business', deck: 'UMC', sid: 's11', title: 'PART 02 · 业务介绍', tags: ['章节', '业务介绍', '深色'] },
  { cat: 'section', id: 'umc-sec-cases', deck: 'UMC', sid: 's24', title: 'PART 03 · 典型案例', tags: ['章节', '典型案例', '深色'] },
  { cat: 'section', id: 'corp-sec-clients', deck: 'Corp', sid: 's27', title: 'PART 03 · 服务客户', tags: ['章节', '服务客户', '深色'] },
  // content
  { cat: 'content', id: 'umc-about-profile', deck: 'UMC', sid: 's4', title: '公司简介 · 定位与优势', tags: ['公司介绍', '简介', '定位'] },
  { cat: 'content', id: 'umc-about-qualification', deck: 'UMC', sid: 's7', title: '公司资质 · 权威技术资质保障', tags: ['公司介绍', '资质', '认证'] },
  { cat: 'content', id: 'umc-about-network', deck: 'UMC', sid: 's8', title: '服务团队 · 全网营销与客户网络', tags: ['服务网络', '本地服务', '网格'] },
  { cat: 'content', id: 'umc-biz-matrix', deck: 'UMC', sid: 's12', title: '产品矩阵 · 云通信一体化服务', tags: ['产品矩阵', '云通信', '矩阵'] },
  { cat: 'content', id: 'umc-biz-gmp', deck: 'UMC', sid: 's13', title: 'GMP · 本地化部署消息平台概览', tags: ['GMP', '私有化', '消息平台'] },
  { cat: 'content', id: 'umc-biz-gmp-feat', deck: 'UMC', sid: 's14', title: 'GMP · 平台功能与消息调度', tags: ['GMP', '多通道', '功能架构'] },
  { cat: 'content', id: 'umc-biz-sms', deck: 'UMC', sid: 's15', title: '企业短信 · 验证码/通知/营销', tags: ['短信', '触达', '三网'] },
  { cat: 'content', id: 'umc-biz-umc', deck: 'UMC', sid: 's16', title: 'UMC 云通信服务 · 基础设施与容灾', tags: ['UMC', '双机房', '容灾高可用'] },
  { cat: 'content', id: 'umc-biz-voice-auth', deck: 'UMC', sid: 's17', title: '语音验证 · 短信到不了的场景语音兜底', tags: ['语音', '验证码', '兜底'] },
  { cat: 'content', id: 'umc-biz-voice-line', deck: 'UMC', sid: 's18', title: '语音线路 · 运营商级语音通道', tags: ['语音线路', 'TTS', '通话通道'] },
  { cat: 'content', id: 'umc-biz-5g', deck: 'UMC', sid: 's20', title: '5G 消息 · 全新的信息生态平台', tags: ['5G消息', 'Chatbot', '富媒体'] },
  { cat: 'content', id: 'umc-biz-rich', deck: 'UMC', sid: 's21', title: '富媒体消息 · 影音图文一体化', tags: ['富媒体', '视频短信', '超级短信'] },
  { cat: 'content', id: 'corp-biz-smart-parking', deck: 'Corp', sid: 's16', title: '智慧车场 · 业务介绍与运营模式', tags: ['智慧车场', 'SaaS', '场景运营'] },
  { cat: 'content', id: 'corp-biz-parking-system', deck: 'Corp', sid: 's17', title: '智慧车场 · 产品服务体系', tags: ['智慧车场', '产业链', '全场景'] },
  { cat: 'content', id: 'corp-biz-kuaitingfu', deck: 'Corp', sid: 's18', title: '快停付 SaaS · 车场四大痛点直击', tags: ['快停付', '出入口', '支付解决方案'] },
  { cat: 'content', id: 'push-biz-push', deck: 'Push', sid: 's28', title: '消息推送 · 全厂商通道与智能路由', tags: ['消息推送', 'APP', '厂商通道'] },
  // data
  { cat: 'data', id: 'umc-data-history', deck: 'UMC', sid: 's5', title: '发展历程 · 开拓进取砥砺前行', tags: ['发展历程', '大事记', '时间线'] },
  { cat: 'data', id: 'umc-data-honors', deck: 'UMC', sid: 's6', title: '公司荣誉 · 100+ 企业荣誉资质', tags: ['荣誉', '资质', '百项资质'] },
  { cat: 'data', id: 'umc-data-rd', deck: 'UMC', sid: 's9', title: '研发能力 · 亿级消息处理平台与99.99%', tags: ['研发实力', '高可用', '架构指标'] },
  { cat: 'data', id: 'umc-data-scale', deck: 'UMC', sid: 's10', title: '业务规模 · 99.9%到达率与400亿+年发量', tags: ['业务规模', '到达率', '400亿'] },
  { cat: 'data', id: 'corp-data-parking-scale', deck: 'Corp', sid: 's10', title: '智慧车场规模 · 160万+动销车位与变现闭环', tags: ['车场规模', '动销车位', '交易笔数'] },
  { cat: 'data', id: 'corp-data-complex', deck: 'Corp', sid: 's22', title: '车场综合体 2.0 · 标杆项目收益模型', tags: ['车场综合体', '新能源', '投资收益'] },
  { cat: 'data', id: 'push-data-ops', deck: 'Push', sid: 's29', title: '消息推送 · 精细化运营与全链路数据', tags: ['推送运营', 'A/B测试', '人群标签'] },
  // case
  { cat: 'case', id: 'umc-case-clients', deck: 'UMC', sid: 's26', title: '典型客户 · 5000+ 标杆企业生态', tags: ['客户案例', 'Logo墙', '跨行业'] },
  { cat: 'case', id: 'corp-case-xiaoju', deck: 'Corp', sid: 's24', title: '平台型战略合作 · 小桔充电', tags: ['标杆合作', '小桔充电', '数智充电'] },
  { cat: 'case', id: 'corp-case-darkcloud', deck: 'Corp', sid: 's25', title: 'SaaS型战略合作 · 达克云', tags: ['标杆合作', '达克云', '新能源SaaS'] },
  { cat: 'case', id: 'corp-case-shenghong', deck: 'Corp', sid: 's26', title: '基建型战略合作 · 盛弘股份', tags: ['标杆合作', '盛弘股份', '电力基建'] },
  { cat: 'case', id: 'corp-case-finance', deck: 'Corp', sid: 's29', title: '服务客户 · 金融通信政企生态', tags: ['金融案例', '运营商', '银行标杆'] },
  { cat: 'case', id: 'corp-case-internet', deck: 'Corp', sid: 's30', title: '服务客户 · 互联网与智慧出行', tags: ['互联网客户', '新能源车企', '智慧出行'] },
  // end
  { cat: 'end', id: 'umc-end-service', deck: 'UMC', sid: 's25', title: '极致服务理念 · 7×24 全天候保障', tags: ['服务理念', '7x24', '客户价值'] },
  { cat: 'end', id: 'corp-end-thanks', deck: 'Corp', sid: 's31', title: 'THANKS · 感谢聆听（企业版）', tags: ['封底', '联系我们', '深色'] },
  { cat: 'end', id: 'push-end-thanks', deck: 'Push', sid: 's27', title: 'THANKS · 感谢聆听（通信版）', tags: ['封底', '联系我们', '深色'] }
];

// Load deck sources cache
const deckSources = {};
for (const d of ['UMC', 'Corp', 'Push']) {
  const html = fs.readFileSync(path.join(repoRoot, d, 'index.html'), 'utf8');
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  deckSources[d] = { html, styles: styles.join('\n') };
}

console.log(`Extracting ${CURATED.length} pages into shared/pages/...`);

for (const item of CURATED) {
  const { cat, id, deck, sid, title, tags } = item;
  const catDir = path.join(pagesDir, cat);
  fs.mkdirSync(catDir, { recursive: true });

  const deckData = deckSources[deck];
  const sectionRegex = new RegExp("(<section class=\"slide[^\"]*\" id=\"" + sid + "\"[\\s\\S]*?<\/section>)");
  const match = deckData.html.match(sectionRegex);
  if (!match) throw new Error(`Could not find section ${sid} in ${deck}/index.html`);

  let sectionHtml = match[1];
  let styleCss = deckData.styles;

  const prefix = `../../../${deck}/`;
  sectionHtml = sectionHtml.replaceAll('src="assets/', `src="${prefix}assets/`)
                           .replaceAll("src='assets/", `src='${prefix}assets/`)
                           .replaceAll('src="images/', `src="${prefix}images/`)
                           .replaceAll("src='images/", `src='${prefix}images/`);
  styleCss = styleCss.replaceAll('url("assets/', `url("${prefix}assets/`)
                     .replaceAll("url('assets/", `url('${prefix}assets/`)
                     .replaceAll('url(assets/', `url(${prefix}assets/`)
                     .replaceAll('url("images/', `url("${prefix}images/`)
                     .replaceAll("url('images/", `url('${prefix}images/`)
                     .replaceAll('url(images/', `url(${prefix}images/`);

  const pageDoc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<!--
@page-id: ${id}
@title: ${title}
@category: ${cat}
@tags: ${tags.join(', ')}
@source: ${deck}/${sid}
@extracted: 2026-10-22
-->
<link rel="stylesheet" href="../../design-system.css">
<style>
${styleCss}

/* 独立舞台约束与终态强制 */
html, body {
    margin: 0; padding: 0;
    width: 1920px; height: 1080px;
    overflow: hidden;
    background: transparent;
}
.slide {
    display: block !important;
    position: absolute !important;
    inset: 0 !important;
    width: 1920px !important;
    height: 1080px !important;
    opacity: 1 !important;
    visibility: visible !important;
    transform: none !important;
}
.reveal, .floaty {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    animation: none !important;
}
.deck-download, .deck-progress, .deck-nav, .edit-toggle, .edit-hotzone, .edit-export, .edit-toast {
    display: none !important;
}
</style>
<style>/* Public page fit: full native canvas in previews, native size when printing. */
html, body {width:100%!important;height:100%!important;overflow:hidden!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.slide {transform:scale(var(--page-scale,1))!important;transform-origin:top left!important}
@media print {html,body{width:1920px!important;height:1080px!important}.slide{transform:none!important}}
</style>
</head>
<body>
${sectionHtml}
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var p = params.get('page');
  var t = params.get('total');
  if (p && t) {
    var el = document.querySelector('.pageno');
    if (el) el.textContent = String(p).padStart(2, '0') + ' / ' + String(t).padStart(2, '0');
  }
})();
</script>
<script src="../../page-runtime.js"></script>
</body>
</html>
`;

  fs.writeFileSync(path.join(catDir, `${id}.html`), pageDoc, 'utf8');
}

console.log('Generating pages.json and decks/example.deck.json...');

const catalog = {
  schemaVersion: 1,
  designSystemVersion: 'welink-v1',
  categories: [
    { id: 'cover', label: '封面' },
    { id: 'section', label: '章节' },
    { id: 'content', label: '内容' },
    { id: 'data', label: '数据' },
    { id: 'case', label: '案例' },
    { id: 'end', label: '结尾' }
  ],
  pages: CURATED.map(item => ({
    id: item.id,
    title: item.title,
    category: item.cat,
    tags: item.tags,
    source: { deck: item.deck, slideId: item.sid },
    file: `../shared/pages/${item.cat}/${item.id}.html`,
    thumbnail: `../shared/pages/${item.cat}/${item.id}.png`
  }))
};

fs.writeFileSync(pagesJsonPath, JSON.stringify(catalog, null, 2), 'utf8');

fs.mkdirSync(decksDir, { recursive: true });
const exampleDeck = {
  schemaVersion: 1,
  title: '微网通联精选业务汇报（示例方案）',
  pages: [
    'umc-cover',
    'umc-sec-about',
    'umc-about-profile',
    'umc-data-history',
    'umc-data-honors',
    'umc-data-scale',
    'umc-sec-business',
    'umc-biz-matrix',
    'umc-biz-gmp',
    'umc-biz-sms',
    'umc-biz-voice-line',
    'corp-biz-smart-parking',
    'corp-data-complex',
    'umc-sec-cases',
    'umc-case-clients',
    'corp-case-xiaoju',
    'umc-end-service',
    'corp-end-thanks'
  ]
};
fs.writeFileSync(path.join(decksDir, 'example.deck.json'), JSON.stringify(exampleDeck, null, 2), 'utf8');

fs.writeFileSync(path.join(repoRoot, 'Pages/catalog.js'), 'window.PAGES_CATALOG = ' + JSON.stringify(catalog) + ';\n');
if (process.argv.includes('--no-shots')) process.exit(0);
console.log('Capturing thumbnails with Playwright...');

let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !fs.existsSync(chromium.executablePath())) {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const name of fs.readdirSync(cache).filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse()) {
      const candidate = path.join(cache, name, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
      if (fs.existsSync(candidate)) { executablePath = candidate; break; }
    }
  }
}

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (let i = 0; i < CURATED.length; i++) {
    const item = CURATED[i];
    const filePath = path.join(pagesDir, item.cat, `${item.id}.html`);
    const thumbPath = path.join(pagesDir, item.cat, `${item.id}.png`);
    await page.goto(pathToFileURL(filePath).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: thumbPath });
    process.stdout.write(`
[${i + 1}/${CURATED.length}] Captured: ${item.id}`);
  }
  console.log('\nAll thumbnails captured successfully.');
} finally {
  await browser.close();
}
