/**
 * Pages/renderer.js — 组装导出渲染器（浏览器 / Node 通用 ESM，纯字符串拼装，无 DOM 依赖）。
 */

export const RENDERER_VERSION = 'welink-v1';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function indexCatalog(catalog) {
  const pages = Array.isArray(catalog) ? catalog : catalog && catalog.pages;
  if (!Array.isArray(pages)) throw new Error('catalog 缺少 pages 数组');
  const byId = new Map();
  for (const page of pages) {
    if (!page || typeof page.id !== 'string' || typeof page.file !== 'string') {
      throw new Error('catalog 页面条目缺少 id/file');
    }
    if (byId.has(page.id)) throw new Error('catalog 页面 id 重复: ' + page.id);
    byId.set(page.id, page);
  }
  return byId;
}

export function validateDeck(deck, catalog) {
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) throw new Error('deck 必须是 JSON 对象');
  if (deck.schemaVersion !== 1) throw new Error('deck.schemaVersion 必须为 1');
  if (!Array.isArray(deck.pages)) throw new Error('deck.pages 必须是页面 id 数组');
  if (deck.pages.length < 1 || deck.pages.length > 100) {
    throw new Error('deck.pages 长度必须在 1-100 之间，当前 ' + deck.pages.length);
  }
  if (deck.title !== undefined && (typeof deck.title !== 'string' || deck.title.length > 160)) throw new Error('方案名称必须是不超过160字的文字');
  const byId = indexCatalog(catalog);
  for (const id of deck.pages) {
    if (typeof id !== 'string' || !byId.has(id)) throw new Error('未知页面 id: ' + String(id));
  }
  return byId;
}


function readyForDeck() {
  var frames = Array.from(document.querySelectorAll('.frame iframe'));
  function wait(frame) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {finish(new Error('页面加载超时：' + frame.title));}, 30000);
      function finish(error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', message);
        frame.removeEventListener('load', inspect);
        if (error) reject(error); else resolve();
      }
      function message(event) {
        if (event.source !== frame.contentWindow || !event.data || event.data.type !== 'welink-page-ready') return;
        finish(event.data.ok ? null : new Error(event.data.error || '页面资源无法加载'));
      }
      function inspect() {
        try {
          var doc = frame.contentDocument;
          if (doc && doc.querySelector('section.slide')) {
            var ready = frame.contentWindow.__pageReady;
            if (ready && typeof ready.then === 'function') ready.then(function () {finish();}, finish);
            else if (doc.readyState === 'complete') {
              var missing = Array.from(doc.images).filter(function (img) {return !img.complete || !img.naturalWidth;});
              if (missing.length) finish(new Error('页面图片缺失：' + frame.title));
              else doc.fonts.ready.then(function () {finish();}, finish);
            }
          }
        } catch (_) { /* file: previews report readiness through postMessage */ }
        frame.contentWindow.postMessage({type:'welink-page-check'}, '*');
      }
      window.addEventListener('message', message);
      frame.addEventListener('load', inspect);
      inspect();
    });
  }
  return Promise.all(frames.map(wait)).then(function () {
    return new Promise(function (resolve) {requestAnimationFrame(function () {requestAnimationFrame(resolve);});});
  }).then(function () {document.documentElement.dataset.ready = 'true';}, function (error) {
    document.getElementById('render-error').textContent = error.message;
    throw error;
  });
}

export function buildDeckDocument(deck, catalog, {baseUrl} = {}) {
  const base = baseUrl || new URL('.', import.meta.url).href;
  const byId = validateDeck(deck, catalog);
  const title = (deck.title || '未命名方案').trim() || '未命名方案';
  const allowed = new URL('../shared/pages/', base).href;
  const frames = deck.pages.map((id, index) => {
    const page = byId.get(id);
    const src = new URL(page.file, base);
    if (!src.href.startsWith(allowed) || !['file:', 'http:', 'https:'].includes(src.protocol)) throw new Error('页面路径不在公共库内：' + id);
    src.searchParams.set('page', String(index + 1));
    src.searchParams.set('total', String(deck.pages.length));
    return '<div class="frame" data-page-id="' + escapeAttr(id) + '" data-index="' + (index + 1) + '"><iframe src="' + escapeAttr(src.href) + '" title="第 ' + (index + 1) + ' 页 · ' + escapeAttr(page.title || id) + '"></iframe></div>';
  }).join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{background:#2e3446;font-family:"PingFang SC",sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}.deck-ui{color:#e8ecf4;padding:28px 4vw 0}.deck-ui h1{font-size:22px}.deck-ui p{font-size:14px;margin-top:8px}.frame{width:min(1200px,92vw);aspect-ratio:16/9;margin:28px auto 44px;background:white;overflow:hidden;box-shadow:0 18px 48px #0006}.frame iframe{width:100%;height:100%;border:0;display:block}
@media print{@page{size:1920px 1080px;margin:0}html,body{width:1920px;background:white}.deck-ui{display:none!important}.frame{width:1920px!important;height:1080px!important;aspect-ratio:auto;margin:0!important;box-shadow:none;break-after:page;page-break-after:always;overflow:hidden}.frame:last-of-type{break-after:auto;page-break-after:auto}}
</style></head><body><header class="deck-ui"><h1>${escapeHtml(title)}</h1><p>共 ${deck.pages.length} 页</p><p id="render-error" role="alert"></p></header>${frames}<script>window.__deckReady=(${readyForDeck.toString()})();window.__deckReady.catch(function(){});</script></body></html>`;
}
