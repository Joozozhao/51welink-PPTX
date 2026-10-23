// Visual preservation proof for one page of every category and source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'output', 'visual');
fs.mkdirSync(output, {recursive: true});
const runtime = createRequire(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_test.cjs'));
const {chromium} = runtime('playwright');
const {PNG} = runtime('pngjs');
const base = process.env.PAGES_BASE_URL || 'http://127.0.0.1:4173/Pages/';
const origin = new URL(base).origin;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !fs.existsSync(chromium.executablePath()) && fs.existsSync(cache)) {
  for (const entry of fs.readdirSync(cache).filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse()) {
    const candidate = path.join(cache, entry, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (fs.existsSync(candidate)) {executablePath = candidate; break;}
  }
}
const browser = await chromium.launch(executablePath ? {executablePath} : {});
try {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const catalog = await (await context.request.get(new URL('pages.json', base).href)).json();
  const chosen = new Map();
  for (const category of catalog.categories) {
    const item = catalog.pages.find(p => p.category === category.id);
    if (item) chosen.set(item.id, item);
  }
  for (const deck of new Set(catalog.pages.map(p => p.source.deck))) {
    const item = catalog.pages.find(p => p.source.deck === deck);
    chosen.set(item.id, item);
  }
  const page = await context.newPage();
  const report = [];
  for (const item of chosen.values()) {
    assert.match(item.source.slideId, /^s\d+$/);
    assert.match(item.source.deck, /^[A-Za-z_]+$/);
    await page.goto(origin + '/' + item.source.deck + '/index.html', {waitUntil: 'networkidle'});
    await page.addStyleTag({content: `
      *,*::before,*::after{animation:none!important;transition:none!important}
      .deck-stage{position:fixed!important;left:0!important;top:0!important;transform:none!important;width:1920px!important;height:1080px!important}
      .slide{display:none!important}
      #${item.source.slideId}{display:block!important;visibility:visible!important;opacity:1!important;transform:none!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important}
      .reveal,.floaty{opacity:1!important;transform:none!important}
      .pageno,.deck-download,.deck-progress,.deck-nav,.edit-toggle,.edit-hotzone,.edit-export,.edit-toast{visibility:hidden!important}
    `});
    await page.evaluate(() => document.fonts.ready);
    const source = path.join(output, item.id + '-source.png');
    await page.locator('#' + item.source.slideId).screenshot({path: source});
    await page.goto(new URL(item.file, base).href, {waitUntil: 'networkidle'});
    await page.addStyleTag({content: '.pageno{visibility:hidden!important}'});
    await page.evaluate(() => document.fonts.ready);
    const extracted = path.join(output, item.id + '-public.png');
    await page.locator('section.slide').screenshot({path: extracted});
    const a = PNG.sync.read(fs.readFileSync(source)), b = PNG.sync.read(fs.readFileSync(extracted));
    assert.equal(a.width, b.width); assert.equal(a.height, b.height);
    let different = 0;
    for (let i = 0; i < a.data.length; i += 4) if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i+1] - b.data[i+1]), Math.abs(a.data[i+2] - b.data[i+2])) > 20) different++;
    const ratio = different / (a.width * a.height);
    report.push({id: item.id, source: item.source, changedPixelRatio: ratio});
    console.log(item.id, 'changed pixel ratio', ratio.toFixed(6));
  }
  fs.writeFileSync(path.join(output, 'comparison.json'), JSON.stringify(report, null, 2));
  console.log('Screenshots and pixel comparison saved for visual review. Differences require inspection; pixel count alone is not acceptance.');
} finally {await browser.close();}
