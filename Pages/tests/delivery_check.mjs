
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'output');
fs.mkdirSync(output, { recursive: true });

const base = process.env.PAGES_BASE_URL || 'http://127.0.0.1:4173/Pages/';

let playwright;
const searchPaths = [
  '/Users/joozo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
  here
];
for (const p of searchPaths) {
  try {
    playwright = createRequire(path.join(p, 'dummy.cjs'))('playwright');
    break;
  } catch {}
}
if (!playwright) {
  try {
    playwright = (await import('playwright')).default;
  } catch {}
}
assert(playwright, 'Playwright is required');

const executablePath = '/Users/joozo/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const browser = await playwright.chromium.launch({
  executablePath: fs.existsSync(executablePath) ? executablePath : undefined,
  headless: true
});

console.log('Browser launched successfully');

try {
  // 1. 1440px 桌面端视口测试
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('Navigating to', base);
  await page.goto(base, { waitUntil: 'networkidle' });

  // 检查横向无溢出
  const scrollWidth1440 = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth1440 = await page.evaluate(() => document.documentElement.clientWidth);
  console.log('1440px width check:', { scrollWidth1440, clientWidth1440 });
  assert(scrollWidth1440 <= clientWidth1440, '1440px horizontal overflow detected');

  await page.screenshot({ path: path.join(output, 'ui-1440-home.png'), fullPage: false });

  // 等待页面卡片加载
  await page.waitForSelector('.card', { state: 'visible' });
  const cards = await page.$$('.card');
  console.log('Found cards:', cards.length);
  assert.equal(cards.length, 38, 'Should load exactly 38 cards');

  // 测试加入页面与加入重复页
  // 点击第一张卡片的“加入”按钮两次
  const firstAddBtn = await page.$('.card:first-child button[data-testid="add-page"]');
  assert(firstAddBtn, 'First card add button exists');
  await firstAddBtn.click();
  await page.waitForTimeout(200);
  await firstAddBtn.click();
  await page.waitForTimeout(200);

  // 点击第二张卡片加入
  const secondAddBtn = await page.$('.card:nth-child(2) button[data-testid="add-page"]');
  assert(secondAddBtn, 'Second card add button exists');
  await secondAddBtn.click();
  await page.waitForTimeout(200);

  // 检查 deck-item 数量
  let deckItems = await page.$$('.deck-item');
  console.log('Deck items count:', deckItems.length);
  assert.equal(deckItems.length, 3, 'Should have 3 deck items (including duplicate)');

  // 在清单中点击复制 (duplicate) 按钮测试复制重复页
  const dupBtn = await page.$('.deck-item:first-child button[data-testid="duplicate-item"]');
  assert(dupBtn, 'duplicate button exists');
  await dupBtn.click();
  await page.waitForTimeout(200);

  deckItems = await page.$$('.deck-item');
  console.log('Deck items count after duplicate button:', deckItems.length);
  assert.equal(deckItems.length, 4, 'Should have 4 deck items after duplicating');

  // 测试上下排序
  const item1Title = await page.evaluate(() => document.querySelectorAll('.deck-item-title')[0].textContent.trim());
  const item2Title = await page.evaluate(() => document.querySelectorAll('.deck-item-title')[1].textContent.trim());
  console.log('Before move:', { item1Title, item2Title });

  // 点击第2个 item 的“上移”按钮
  const moveUpBtn = await page.$('.deck-item:nth-child(2) button[data-testid="move-up"]');
  assert(moveUpBtn, 'move up button should exist');
  await moveUpBtn.click();
  await page.waitForTimeout(200);

  const newItem1Title = await page.evaluate(() => document.querySelectorAll('.deck-item-title')[0].textContent.trim());
  console.log('After move up:', { newItem1Title });
  assert.equal(newItem1Title, item2Title, 'Item should move up');

  await page.screenshot({ path: path.join(output, 'ui-deck-assembled.png'), fullPage: false });

  // 测试整册预览
  const previewDeckBtn = await page.$('#preview-deck');
  assert(previewDeckBtn, 'preview-deck button should exist');
  await previewDeckBtn.click();
  await page.waitForSelector('#deck-preview-dialog[open]', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, 'ui-deck-preview.png'), fullPage: false });

  // 关闭整册预览
  const closePreviewBtn = await page.$('#deck-preview-dialog button[data-close]');
  if (closePreviewBtn) await closePreviewBtn.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const dialogHiddenAfterClose = await page.evaluate(() => {
    const dlg = document.getElementById('deck-preview-dialog');
    return window.getComputedStyle(dlg).display === 'none' && document.documentElement.scrollHeight <= document.documentElement.clientHeight;
  });
  assert(dialogHiddenAfterClose, 'Closed preview dialog must be display:none and not cause vertical page overflow');

  // 测试 JSON 导出
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-json')
  ]);
  const downloadPath = path.join(output, 'exported-deck.json');
  await download.saveAs(downloadPath);
  const jsonContent = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
  console.log('Exported JSON pages count:', jsonContent.pages.length);
  assert.equal(jsonContent.pages.length, 4, 'Exported JSON should have 4 pages');

  // 测试刷新恢复
  await page.reload({ waitUntil: 'networkidle' });
  const restoredItems = await page.$$('.deck-item');
  console.log('Restored deck items after reload:', restoredItems.length);
  assert.equal(restoredItems.length, 4, 'Should restore 4 deck items from localStorage');

  // 测试清空后导入 JSON
  await page.click('#clear-deck');
  await page.waitForTimeout(200);
  const clearedItems = await page.$$('.deck-item');
  assert.equal(clearedItems.length, 0, 'Deck should be cleared');

  // 设置文件上传并导入
  const fileInput = await page.$('#import-json-input');
  assert(fileInput, 'import input exists');
  await fileInput.setInputFiles(downloadPath);
  await page.waitForTimeout(400);

  const importedItems = await page.$$('.deck-item');
  console.log('Imported deck items count:', importedItems.length);
  assert.equal(importedItems.length, 4, 'Should import 4 deck items from JSON');

  await page.screenshot({ path: path.join(output, 'ui-1440-final.png'), fullPage: false });
  await context.close();

  // 2. 375px 移动端视口测试（无横向溢出）
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(base, { waitUntil: 'networkidle' });

  const scrollWidth375 = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth375 = await mobilePage.evaluate(() => document.documentElement.clientWidth);
  console.log('375px width check:', { scrollWidth375, clientWidth375 });
  assert(scrollWidth375 <= clientWidth375, '375px horizontal overflow detected: ' + scrollWidth375 + ' > ' + clientWidth375);

  await mobilePage.screenshot({ path: path.join(output, 'ui-375-home.png'), fullPage: false });

  // 打开移动端抽屉
  const toggleBtn = await mobilePage.$('#deck-toggle');
  if (toggleBtn) {
    await toggleBtn.click();
    await mobilePage.waitForTimeout(300);
    const scrollWidth375Drawer = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    console.log('375px drawer width check:', { scrollWidth375Drawer });
    assert(scrollWidth375Drawer <= 375, '375px drawer horizontal overflow');
    await mobilePage.screenshot({ path: path.join(output, 'ui-375-drawer.png'), fullPage: false });
  }

  await mobileContext.close();
  console.log('ALL PLAYWRIGHT TESTS PASSED!');
} finally {
  await browser.close();
}

