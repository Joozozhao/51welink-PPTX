#!/usr/bin/env node
/**
 * export-deck.mjs — 从 deck.json 导出可搜索文字层 PDF（通用化管线）
 * 复用 UMC 验证过的打印参数、页面尺寸与 normalize-pdf.py 字符映射修复。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildDeckDocument, validateDeck } from '../renderer.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.dirname(dir);
const root = path.dirname(pagesDir);

let require_;
for (const base of [dir, process.env.NODE_PATH, '/Users/joozo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']) {
  if (!base) continue;
  try {
    const r = createRequire(path.join(base, '_loader.cjs'));
    r.resolve('playwright');
    require_ = r;
    break;
  } catch {}
}
if (!require_) {
  console.error('Playwright module not found');
  process.exit(1);
}
const { chromium } = require_('playwright');

export async function exportDeckToPdf(deck, catalog, options = {}) {
  const outputRoot = options.outputDir || path.join(dir, 'generated');
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputDir = options.uniqueJob ? fs.mkdtempSync(path.join(outputRoot, 'export-')) : outputRoot;

  const byId = validateDeck(deck, catalog);
  const total = deck.pages.length;
  const baseUrl = options.baseUrl || 'http://pages.local/Pages/';
  const html = buildDeckDocument(deck, catalog, { baseUrl });

  const safeName = Array.from((deck.title || 'deck').replace(/[/\\?%*:|"<>]/g, '_').trim()).slice(0, 48).join('') || 'deck';
  const htmlPath = path.join(outputDir, safeName + '.assembled.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

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

  const browser = await chromium.launch(executablePath ? {executablePath} : {});
  const pdfPath = path.join(outputDir, safeName + '.raw.pdf');
  const finalPdfPath = path.join(outputDir, safeName + '.pdf');

  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    });

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Fulfill the document and its local assets under one HTTP origin. This
    // preserves Chromium's normal security and prevents blank cross-origin prints.
    const renderUrl = new URL('__assembled__.html', baseUrl).href;
    const renderOrigin = new URL(renderUrl).origin;
    const canonicalRoot = fs.realpathSync(root);
    const contentTypes = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.gif':'image/gif','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.href === renderUrl) {await route.fulfill({contentType:'text/html; charset=utf-8', body:html}); return;}
      if (url.origin !== renderOrigin) {await route.abort(); return;}
      try {
        const pathname = decodeURIComponent(url.pathname);
        if (!/^\/(shared\/|UMC\/assets\/|Corp\/(images|assets)\/|Push\/assets\/)/.test(pathname) || pathname.split('/').some(p => p.startsWith('.'))) throw new Error('Resource path outside library');
        const target = fs.realpathSync(path.resolve(canonicalRoot, '.' + pathname));
        if (!target.startsWith(canonicalRoot + path.sep)) throw new Error('Resource escapes root');
        await route.fulfill({contentType:contentTypes[path.extname(target)] || 'application/octet-stream', body:fs.readFileSync(target)});
      } catch (error) {errors.push(error.message + ': ' + url.pathname); await route.fulfill({status:404, body:'Resource missing'});}
    });
    await page.goto(renderUrl, {waitUntil:'load', timeout:30000});
    await page.evaluate(() => window.__deckReady);

    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: true
    });

    if (errors.length) {
      throw new Error('页面渲染出错：' + errors.join('; '));
    }
  } finally {
    await browser.close();
  }

  // 运行 normalize-pdf.py 修正 CJK 字体映射
  const normalizeScript = path.join(dir, 'normalize-pdf.py');
  const bundledPy = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
  const pythonBin = process.env.PYTHON_BIN || (fs.existsSync(bundledPy) ? bundledPy : 'python3');

  fs.copyFileSync(pdfPath, finalPdfPath);
  const normRes = spawnSync(pythonBin, [normalizeScript, finalPdfPath], { encoding: 'utf8' });
  if (normRes.status !== 0) {
    throw new Error('PDF 中文文字映射修正失败：' + normRes.stderr);
  } else {
    console.log(normRes.stdout.trim());
  }

  fs.unlinkSync(pdfPath);
  return finalPdfPath;
}

// 命令行入口
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const inputFile = process.argv[2] || path.join(pagesDir, 'decks', 'example.deck.json');
  const resolved = path.resolve(process.cwd(), inputFile);
  const deck = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(pagesDir, 'pages.json'), 'utf8'));

  console.log('Exporting deck: ' + resolved + ' (' + deck.pages.length + ' pages)...');
  exportDeckToPdf(deck, catalog)
    .then(pdf => console.log('Successfully exported PDF: ' + pdf))
    .catch(err => {
      console.error('Export failed:', err);
      process.exit(1);
    });
}
