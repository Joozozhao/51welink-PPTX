
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.dirname(dir);
const root = path.dirname(pagesDir);
const sharedPages = path.join(root, 'shared', 'pages');

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
if (!require_) throw new Error('未找到 playwright');
const { chromium } = require_('playwright');

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

const catalog = JSON.parse(fs.readFileSync(path.join(pagesDir, 'pages.json'), 'utf8'));
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const entry of catalog.pages) {
    const htmlFile = path.resolve(pagesDir, entry.file);
    const pngFile = path.resolve(pagesDir, entry.thumbnail);
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: pngFile });
    console.log('thumbnail done:', entry.id);
  }
} finally {
  await browser.close();
}
