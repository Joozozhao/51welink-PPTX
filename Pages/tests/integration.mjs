import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'output');
fs.mkdirSync(output, {recursive: true});
const base = process.env.PAGES_BASE_URL || 'http://127.0.0.1:4173/Pages/';
const origin = new URL(base).origin;
let playwright;
for (const anchor of [here, path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')]) {
  try {playwright = createRequire(path.join(anchor, '_test.cjs'))('playwright'); break;} catch {}
}
assert(playwright, 'Playwright is required for browser acceptance');
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !fs.existsSync(playwright.chromium.executablePath())) {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const name of fs.readdirSync(cache).filter(name => name.startsWith('chromium_headless_shell-')).sort().reverse()) {
      const candidate = path.join(cache, name, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
      if (fs.existsSync(candidate)) {executablePath = candidate; break;}
    }
  }
}
const browser = await playwright.chromium.launch(executablePath ? {executablePath} : {});
const checks = [];
const check = (name, details = true) => {checks.push({name, details}); console.log('PASS', name, typeof details === 'object' ? JSON.stringify(details) : details);};
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const response = await context.request.get(new URL('pages.json', base).href);
  assert.equal(response.status(), 200);
  const catalog = await response.json();
  assert.equal(catalog.schemaVersion, 1);
  assert(catalog.pages.length >= 20 && catalog.pages.length <= 40, 'Curated first library has 20-40 pages');
  assert.equal(new Set(catalog.pages.map(p => p.id)).size, catalog.pages.length);
  for (const category of ['cover', 'section', 'content', 'data', 'case', 'end']) assert(catalog.pages.some(p => p.category === category), category);
  check('catalog completeness', {pages: catalog.pages.length, sources: [...new Set(catalog.pages.map(p => p.source.deck))]});

  const pageEvidence = [];
  for (const item of catalog.pages) {
    const thumb = await context.request.get(new URL(item.thumbnail, base).href);
    assert.equal(thumb.status(), 200, item.id + ' thumbnail');
    assert((await thumb.body()).length > 1000, item.id + ' real thumbnail');
    const single = new URL(item.file, base); single.searchParams.set('page', '7'); single.searchParams.set('total', '9');
    await page.goto(single.href, {waitUntil: 'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('section.slide').count(), 1, item.id + ' exactly one native slide');
    const evidence = await page.evaluate(() => ({
      text: document.querySelector('section.slide').innerText,
      missingImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')),
      size: (() => {const r = document.querySelector('section.slide').getBoundingClientRect(); return {width: r.width, height: r.height};})()
    }));
    assert.deepEqual(evidence.missingImages, [], item.id + ' resources');
    assert(evidence.text.trim().length > 1, item.id + ' actual text');
    assert(Math.abs(evidence.size.width / evidence.size.height - 16 / 9) < .01, item.id + ' 16:9 stage');
    pageEvidence.push({id: item.id, ...evidence});
  }
  check('all public pages render without external requests or missing images', pageEvidence.length);

  const selection = [catalog.pages.find(p => p.category === 'cover'), ...['section', 'content', 'data', 'case', 'end'].map(category => catalog.pages.find(p => p.category === category))].map(p => p.id);
  for (const source of new Set(catalog.pages.map(p => p.source.deck))) {
    if (!selection.some(id => catalog.pages.find(p => p.id === id).source.deck === source)) selection.push(catalog.pages.find(p => p.source.deck === source).id);
  }
  selection.splice(3, 0, selection[2]);
  const deck = {schemaVersion: 1, title: '混合来源与重复选页验收', pages: selection};
  await page.goto(base, {waitUntil: 'networkidle'});
  const html = await page.evaluate(async ({deck, catalog, base}) => {
    const {buildDeckDocument} = await import(new URL('renderer.js', base).href);
    return buildDeckDocument(deck, catalog, {baseUrl: base});
  }, {deck, catalog, base});
  const assembled = await context.newPage();
  await assembled.setContent(html, {waitUntil: 'load'});
  await assembled.evaluate(() => window.__deckReady);
  const frames = assembled.frames().slice(1);
  assert.equal(frames.length, deck.pages.length, 'Every selected occurrence is isolated in its own frame');
  const printedText = [];
  for (let i = 0; i < frames.length; i++) {
    assert.equal(await frames[i].locator('section.slide').count(), 1);
    printedText.push(await frames[i].locator('section.slide').innerText());
  }
  await assembled.pdf({path: path.join(output, 'static-print.pdf'), printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false});
  fs.writeFileSync(path.join(output, 'expected-text.json'), JSON.stringify({deck, printedText}, null, 2));
  check('mixed-category and duplicate-page composition', deck.pages);

  const health = await context.request.get(origin + '/api/health');
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).pdfExport, true);
  const exported = await context.request.post(origin + '/api/export', {data: deck, timeout: 120000});
  if (exported.status() !== 200) throw new Error('PDF endpoint ' + exported.status() + ': ' + await exported.text());
  assert.match(exported.headers()['content-type'], /application\/pdf/);
  fs.writeFileSync(path.join(output, 'api-export.pdf'), await exported.body());
  const bundledPython = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
  const pdfCheck = spawnSync(fs.existsSync(bundledPython) ? bundledPython : 'python3', [path.join(here, 'verify-pdf.py')], {encoding:'utf8'});
  assert.equal(pdfCheck.status, 0, pdfCheck.stdout + pdfCheck.stderr);
  check('PDF export endpoint with actual page and text coverage', {bytes: (await exported.body()).length});
  for (const body of [{schemaVersion: 1, title: 'empty', pages: []}, {schemaVersion: 1, title: 'unknown', pages: ['../../.git/config']}, {schemaVersion: 1, title: 'too many', pages: Array(101).fill(selection[0])}]) {
    const invalid = await context.request.post(origin + '/api/export', {data: body});
    assert(invalid.status() >= 400 && invalid.status() < 500, 'Invalid input rejected before rendering');
  }
  const blockedOrigin = await context.request.post(origin + '/api/export', {data: deck, headers: {Origin: 'https://unrelated.invalid'}});
  assert.equal(blockedOrigin.status(), 403);
  for (const denied of ['/.git/config', '/.env', '/_tools/case_content.txt', '/UMC/.workbuddy/memory/']) {
    const deniedResponse = await context.request.get(origin + denied);
    assert([403, 404].includes(deniedResponse.status()), denied);
  }
  check('invalid selections, foreign origin and private paths rejected');

  assert.deepEqual(errors, [], 'No browser runtime errors');
  fs.writeFileSync(path.join(output, 'integration.json'), JSON.stringify({checks, pageEvidence}, null, 2));
} finally {await browser.close();}
