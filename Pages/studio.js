/* ============================================================
   公共页面组装站 · studio.js
   纯前端实现：
   - 页面库：GET ./pages.json，缩略图网格 + 分类/来源/标签/搜索
   - 组装：加入（可重复）、拖拽与键盘排序、复制、移除、清空（5 秒撤销）
   - 方案：命名 / localStorage 自动保存 / 刷新恢复 / 命名另存 / JSON 导入导出
   - 预览：单页 dialog iframe、整册 dialog iframe 序列（?page=N&total=T）
   - 导出：/api/health + /api/export 可用时本机一键下载 PDF；
           静态站回退为 renderer.js 构造打印文档，等 __deckReady 后 window.print()
   安全：所有外部数据只经 textContent 注入；无 eval；导入 JSON 结构校验。
   ============================================================ */
(function () {
  'use strict';

  var MAX_PAGES = 100;
  var LS_DRAFT = 'pages-studio.v1:draft';
  var LS_SCHEMES = 'pages-studio.v1:schemes';
  var UNDO_MS = 5000;
  var HEALTH_TIMEOUT_MS = 4000;
  var DECK_READY_TIMEOUT_MS = 45000;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var els = {};
  var EL_IDS = [
    'cat-list', 'cat-count-all', 'filter-source', 'filter-tag', 'filter-search',
    'filter-clear', 'filter-empty-clear', 'result-count', 'ds-version',
    'catalog-loading', 'catalog-error', 'catalog-error-msg', 'catalog-retry', 'catalog-error-actions',
    'library-empty', 'filter-empty', 'page-grid',
    'deck-panel', 'panel-close', 'panel-backdrop', 'deck-toggle', 'deck-count-toggle',
    'deck-title', 'autosave-status', 'storage-warning', 'deck-empty', 'deck-list', 'deck-count',
    'export-pdf', 'export-mode', 'preview-deck', 'export-json', 'import-json', 'import-json-input', 'clear-deck',
    'save-scheme', 'scheme-form', 'scheme-name', 'scheme-cancel', 'scheme-list',
    'page-preview-dialog', 'page-preview-title', 'page-preview-meta', 'page-preview-frame',
    'deck-preview-dialog', 'deck-preview-title', 'deck-preview-body',
    'toasts', 'status-live'
  ];

  var state = {
    catalog: null,          // pages.json 原始对象
    pageById: new Map(),
    filters: { q: '', category: 'all', source: 'all', tag: 'all' },
    deck: { title: '', pages: [] },   // pages: 有序 pageId 数组，允许重复
    schemes: {},            // name -> { title, pages, savedAt }
    exportMode: 'checking', // checking | api | print
    rendererPromise: null,
    storageOK: true,
    dragIndex: null
  };

  /* ---------------- 通用工具 ---------------- */

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function timeStr(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  }

  function dateTimeStr(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  function announce(msg) {
    // 变更文本触发 aria-live 朗读
    els['status-live'].textContent = '';
    setTimeout(function () { els['status-live'].textContent = msg; }, 30);
  }

  function baseUrl() { return new URL('./', location.href); }

  function pageFileUrl(p, pageNo, total) {
    var u = new URL(p.file, baseUrl());
    if (pageNo != null) {
      u.searchParams.set('page', String(pageNo));
      u.searchParams.set('total', String(total));
    }
    return u.href;
  }

  function pageThumbUrl(p) {
    if (!p.thumbnail || typeof p.thumbnail !== 'string') return null;
    return new URL(p.thumbnail, baseUrl()).href;
  }

  function safeFileName(s) {
    var v = String(s || '未命名方案').replace(/[\/:*?"<>|\x00-\x1f]/g, '_').trim();
    return (v || '未命名方案').slice(0, 80);
  }

  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 4000);
  }

  function setBusy(btn, busy, busyText, idleText) {
    if (busy) {
      btn.dataset.idleText = idleText || btn.textContent;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = busyText || '处理中…';
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (btn.dataset.idleText) btn.textContent = btn.dataset.idleText;
    }
  }

  /* ---------------- 本地存储（失败可见） ---------------- */

  function lsGet(key) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }

  function lsSet(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      storageFail();
      return false;
    }
  }

  function storageFail() {
    if (!state.storageOK) return;
    state.storageOK = false;
    els['storage-warning'].hidden = false;
    toast('本地存储不可用：方案不会被自动保存', { type: 'error' });
  }

  function saveDraft() {
    var ok = lsSet(LS_DRAFT, {
      title: state.deck.title,
      pages: state.deck.pages,
      savedAt: new Date().toISOString()
    });
    if (ok) {
      els['autosave-status'].textContent = '已自动保存到当前浏览器 ' + timeStr();
    }
  }
  var saveDraftDebounced = debounce(saveDraft, 300);

  function loadDraft() {
    var d = lsGet(LS_DRAFT);
    if (d && Array.isArray(d.pages)) {
      state.deck.title = typeof d.title === 'string' ? d.title : '';
      state.deck.pages = d.pages.filter(function (x) { return typeof x === 'string'; }).slice(0, MAX_PAGES);
    }
  }

  /* ---------------- Toast（含 5 秒撤销） ---------------- */

  function toast(msg, opts) {
    opts = opts || {};
    var duration = opts.duration || (opts.action ? UNDO_MS : 4000);
    var t = document.createElement('div');
    t.className = 'toast' + (opts.type ? ' toast-' + opts.type : '');
    t.dataset.testid = 'toast';
    t.setAttribute('role', 'status');

    var span = document.createElement('span');
    span.className = 'toast-msg';
    span.textContent = msg;
    t.appendChild(span);

    var dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      t.classList.add('hide');
      setTimeout(function () { t.remove(); }, 220);
    }

    if (opts.action) {
      var act = document.createElement('button');
      act.type = 'button';
      act.className = 'toast-action';
      act.dataset.testid = opts.action.testid || 'toast-action';
      act.textContent = opts.action.label;
      act.addEventListener('click', function () { opts.action.fn(); dismiss(); });
      t.appendChild(act);
    }

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.dataset.testid = 'toast-close';
    close.setAttribute('aria-label', '关闭提示');
    close.textContent = '✕';
    close.addEventListener('click', dismiss);
    t.appendChild(close);

    els.toasts.appendChild(t);
    setTimeout(dismiss, duration);
  }

  /* ---------------- URL Query 双向同步（q/category/source/tag） ---------------- */

  function readQuery() {
    var sp = new URLSearchParams(location.search);
    state.filters.q = sp.get('q') || '';
    state.filters.category = sp.get('category') || 'all';
    state.filters.source = sp.get('source') || 'all';
    state.filters.tag = sp.get('tag') || 'all';
  }

  function writeQuery() {
    var sp = new URLSearchParams();
    var f = state.filters;
    if (f.q) sp.set('q', f.q);
    if (f.category !== 'all') sp.set('category', f.category);
    if (f.source !== 'all') sp.set('source', f.source);
    if (f.tag !== 'all') sp.set('tag', f.tag);
    var qs = sp.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function filtersActive() {
    var f = state.filters;
    return !!(f.q || f.category !== 'all' || f.source !== 'all' || f.tag !== 'all');
  }

  function setFilter(patch) {
    Object.keys(patch).forEach(function (k) { state.filters[k] = patch[k]; });
    writeQuery();
    renderGrid();
  }

  function clearFilters() {
    els['filter-search'].value = '';
    els['filter-source'].value = 'all';
    els['filter-tag'].value = 'all';
    setFilter({ q: '', category: 'all', source: 'all', tag: 'all' });
    syncCategoryActive();
    els['filter-search'].focus();
  }

  /* ---------------- 页面库加载 ---------------- */

  function showState(name) {
    var map = {
      loading: els['catalog-loading'],
      error: els['catalog-error'],
      libraryEmpty: els['library-empty'],
      filterEmpty: els['filter-empty'],
      grid: els['page-grid']
    };
    Object.keys(map).forEach(function (k) { map[k].hidden = k !== name; });
  }

  function validateCatalog(data) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.pages)) {
      throw new Error('pages.json 格式不符合约定（需要 schemaVersion: 1 与 pages 数组）');
    }
    data.pages = data.pages.filter(function (p) {
      return p && typeof p.id === 'string' && typeof p.file === 'string';
    });
    if (!Array.isArray(data.categories)) data.categories = [];
    return data;
  }

  function indexPages() {
    state.pageById = new Map();
    state.catalog.pages.forEach(function (p) { state.pageById.set(p.id, p); });
  }

  function fetchCatalog() {
    showState('loading');
    els['result-count'].textContent = '';
    fetch('./pages.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        return res.json();
      })
      .then(function (data) {
        state.catalog = validateCatalog(data);
        indexPages();
        els['ds-version'].textContent = state.catalog.designSystemVersion || '';
        buildFilterControls();
        renderGrid();
        renderDeck(); // 清单中的标题/缺失标记随目录刷新
      })
      .catch(function (e) {
        console.error('[pages-studio] 页面库加载失败', e);
      var isFileProtocol = location.protocol === 'file:';
      var actions = els['catalog-error-actions'];
      if (actions) {
        actions.innerHTML = '';
        if (isFileProtocol) {
          var link = document.createElement('a');
          link.href = 'http://127.0.0.1:4173/Pages/';
          link.className = 'btn btn-primary';
          link.style.textDecoration = 'none';
          link.textContent = '进入本地服务 http://127.0.0.1:4173/Pages/';
          actions.appendChild(link);
        }
      }
        els['catalog-error-msg'].textContent =
        isFileProtocol
          ? '当前为本地文件预览，请通过下方的本机服务入口打开页面库。已有方案可通过 JSON 导入。'
          : ('无法读取 ./pages.json（' + e.message + '）。请确认服务已启动且清单已生成。');
        showState('error');
      });
  }

  /* ---------------- 筛选控件 ---------------- */

  function categories() {
    var cats = state.catalog.categories;
    if (cats.length) return cats;
    var seen = new Map();
    state.catalog.pages.forEach(function (p) {
      var c = p.category || 'other';
      if (!seen.has(c)) seen.set(c, { id: c, label: c });
    });
    return Array.from(seen.values());
  }

  function catLabel(id) {
    var found = categories().filter(function (c) { return c.id === id; })[0];
    return found ? (found.label || found.id) : (id || '未分类');
  }

  function sourceOf(p) {
    return (p.source && typeof p.source.deck === 'string') ? p.source.deck : '未知来源';
  }

  function buildFilterControls() {
    var pages = state.catalog.pages;
    var counts = {};
    pages.forEach(function (p) {
      var c = p.category || 'other';
      counts[c] = (counts[c] || 0) + 1;
    });
    els['cat-count-all'].textContent = String(pages.length);

    // 分类按钮
    var list = els['cat-list'];
    Array.prototype.slice.call(list.querySelectorAll('li[data-dynamic]')).forEach(function (li) { li.remove(); });
    categories().forEach(function (c) {
      var li = document.createElement('li');
      li.dataset.dynamic = '1';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-item';
      btn.dataset.testid = 'filter-category';
      btn.dataset.category = c.id;
      var label = document.createElement('span');
      label.className = 'cat-label';
      label.textContent = c.label || c.id;
      var count = document.createElement('span');
      count.className = 'cat-count';
      count.textContent = String(counts[c.id] || 0);
      btn.appendChild(label);
      btn.appendChild(count);
      li.appendChild(btn);
      list.appendChild(li);
    });

    // 来源
    var sources = [];
    var seenSrc = new Set();
    pages.forEach(function (p) {
      var s = sourceOf(p);
      if (!seenSrc.has(s)) { seenSrc.add(s); sources.push(s); }
    });
    sources.sort();
    fillSelect(els['filter-source'], sources, '全部来源');

    // 标签
    var tags = new Set();
    pages.forEach(function (p) {
      if (Array.isArray(p.tags)) {
        p.tags.forEach(function (t) { if (typeof t === 'string' && t) tags.add(t); });
      }
    });
    fillSelect(els['filter-tag'], Array.from(tags).sort(), '全部标签');

    // 用 URL 中的值还原控件（非法值回落到 all）
    if (!categories().some(function (c) { return c.id === state.filters.category; })) {
      state.filters.category = 'all';
    }
    if (sources.indexOf(state.filters.source) < 0) state.filters.source = 'all';
    if (!tags.has(state.filters.tag) && state.filters.tag !== 'all') state.filters.tag = 'all';

    els['filter-search'].value = state.filters.q;
    els['filter-source'].value = state.filters.source;
    els['filter-tag'].value = state.filters.tag;
    syncCategoryActive();
    writeQuery();
  }

  function fillSelect(sel, values, allLabel) {
    sel.textContent = '';
    var all = document.createElement('option');
    all.value = 'all';
    all.textContent = allLabel;
    sel.appendChild(all);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
    sel.disabled = false;
  }

  function syncCategoryActive() {
    var btns = els['cat-list'].querySelectorAll('[data-category]');
    Array.prototype.forEach.call(btns, function (b) {
      var active = b.dataset.category === state.filters.category;
      b.classList.toggle('is-active', active);
      if (active) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  /* ---------------- 页面库网格 ---------------- */

  function applyFilters() {
    var f = state.filters;
    var q = f.q.trim().toLowerCase();
    return state.catalog.pages.filter(function (p) {
      if (f.category !== 'all' && (p.category || 'other') !== f.category) return false;
      if (f.source !== 'all' && sourceOf(p) !== f.source) return false;
      if (f.tag !== 'all' && !(Array.isArray(p.tags) && p.tags.indexOf(f.tag) >= 0)) return false;
      if (q && !(typeof p.title === 'string' && p.title.toLowerCase().indexOf(q) >= 0)) return false;
      return true;
    });
  }

  function buildCard(p) {
    var card = document.createElement('article');
    card.className = 'card';
    card.dataset.testid = 'page-card';
    card.dataset.pageId = p.id;

    // 缩略图（点击 = 单页预览）
    var thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'card-thumb';
    thumb.dataset.testid = 'preview-page';
    thumb.setAttribute('aria-label', '预览页面：' + (p.title || p.id));
    var thumbUrl = pageThumbUrl(p);
    if (thumbUrl) {
      var img = new Image();
      img.loading = 'lazy';
      img.alt = '';
      img.src = thumbUrl;
      img.addEventListener('error', function () {
        thumb.textContent = '';
        thumb.appendChild(thumbFallback(p));
      });
      thumb.appendChild(img);
    } else {
      thumb.appendChild(thumbFallback(p));
    }
    thumb.addEventListener('click', function () { openPagePreview(p); });
    card.appendChild(thumb);

    var body = document.createElement('div');
    body.className = 'card-body';

    var h3 = document.createElement('h3');
    h3.className = 'card-title';
    h3.dataset.testid = 'page-card-title';
    h3.textContent = p.title || p.id;
    body.appendChild(h3);

    var meta = document.createElement('p');
    meta.className = 'card-meta';
    var cat = document.createElement('span');
    cat.className = 'card-cat';
    cat.textContent = catLabel(p.category);
    var src = document.createElement('span');
    src.textContent = sourceOf(p) + (p.source && p.source.slideId ? ' · ' + p.source.slideId : '');
    meta.appendChild(cat);
    meta.appendChild(src);
    body.appendChild(meta);

    if (Array.isArray(p.tags) && p.tags.length) {
      var tagRow = document.createElement('p');
      tagRow.className = 'card-tags';
      p.tags.slice(0, 4).forEach(function (t) {
        var chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = t;
        tagRow.appendChild(chip);
      });
      body.appendChild(tagRow);
    }

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-primary btn-small btn-block';
    add.dataset.testid = 'add-page';
    add.setAttribute('aria-label', '加入方案：' + (p.title || p.id));
    add.textContent = '加入方案';
    body.appendChild(add);

    card.appendChild(body);
    return card;
  }

  function thumbFallback(p) {
    var d = document.createElement('span');
    d.className = 'thumb-fallback';
    d.textContent = '缩略图缺失 · ' + p.id;
    return d;
  }

  function renderGrid() {
    if (!state.catalog) return;
    var total = state.catalog.pages.length;
    if (!total) { showState('libraryEmpty'); els['result-count'].textContent = ''; return; }

    var list = applyFilters();
    els['page-grid'].textContent = '';
    var frag = document.createDocumentFragment();
    list.forEach(function (p) { frag.appendChild(buildCard(p)); });
    els['page-grid'].appendChild(frag);

    showState(list.length ? 'grid' : 'filterEmpty');
    els['result-count'].textContent =
      '共 ' + total + ' 页' + (filtersActive() ? ' · 匹配 ' + list.length + ' 页' : '');
    els['filter-clear'].hidden = !filtersActive();
  }

  /* ---------------- 组装清单 ---------------- */

  function updateActionStates() {
    var n = state.deck.pages.length;
    els['deck-count'].textContent = String(n);
    els['deck-count-toggle'].textContent = String(n);
    els['deck-empty'].hidden = n > 0;
    els['deck-list'].hidden = n === 0;
    els['export-pdf'].disabled = n === 0 || state.exportMode === 'checking';
    els['preview-deck'].disabled = n === 0;
    els['export-json'].disabled = n === 0;
    els['clear-deck'].disabled = n === 0;
    els['save-scheme'].disabled = n === 0;
  }

  function buildDeckItem(id, i) {
    var p = state.pageById.get(id);
    var li = document.createElement('li');
    li.className = 'deck-item' + (p ? '' : ' is-missing');
    li.dataset.testid = 'deck-item';
    li.dataset.index = String(i);
    li.dataset.pageId = id;
    li.draggable = true;
    li.tabIndex = 0;
    li.setAttribute('aria-label', '第 ' + (i + 1) + ' 页：' + (p ? (p.title || p.id) : id));

    var no = document.createElement('span');
    no.className = 'deck-no';
    no.textContent = String(i + 1);
    li.appendChild(no);

    var meta = document.createElement('div');
    meta.className = 'deck-meta';
    var title = document.createElement('span');
    title.className = 'deck-item-title';
    title.textContent = p ? (p.title || p.id) : id;
    var sub = document.createElement('span');
    sub.className = 'deck-item-sub';
    sub.textContent = p ? (catLabel(p.category) + ' · ' + sourceOf(p)) : '页面库清单中不存在此页';
    meta.appendChild(title);
    meta.appendChild(sub);
    li.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'deck-actions';
    actions.appendChild(iconBtn('↑', '上移第 ' + (i + 1) + ' 页', 'move-up', 'up', i === 0));
    actions.appendChild(iconBtn('↓', '下移第 ' + (i + 1) + ' 页', 'move-down', 'down', i === state.deck.pages.length - 1));
    actions.appendChild(iconBtn('⧉', '复制第 ' + (i + 1) + ' 页', 'duplicate-item', 'dup', state.deck.pages.length >= MAX_PAGES));
    actions.appendChild(iconBtn('✕', '移除第 ' + (i + 1) + ' 页', 'remove-item', 'remove', false, true));
    li.appendChild(actions);
    return li;
  }

  function iconBtn(glyph, label, testid, act, disabled, danger) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn' + (danger ? ' danger' : '');
    b.dataset.testid = testid;
    b.dataset.act = act;
    b.setAttribute('aria-label', label);
    b.textContent = glyph;
    b.disabled = !!disabled;
    return b;
  }

  function renderDeck(focusSpec) {
    var list = els['deck-list'];
    list.textContent = '';
    var frag = document.createDocumentFragment();
    state.deck.pages.forEach(function (id, i) { frag.appendChild(buildDeckItem(id, i)); });
    list.appendChild(frag);
    updateActionStates();

    if (focusSpec) {
      var items = list.children;
      var idx = Math.min(focusSpec.index, items.length - 1);
      var item = items[idx];
      if (item) {
        var target = focusSpec.act && focusSpec.act !== 'item'
          ? item.querySelector('[data-act="' + focusSpec.act + '"]')
          : item;
        (target || item).focus();
      }
    }
  }

  function focusItem(i) {
    var items = els['deck-list'].children;
    if (!items.length) return;
    var idx = Math.max(0, Math.min(i, items.length - 1));
    items[idx].focus();
  }

  function pageTitleOf(id) {
    var p = state.pageById.get(id);
    return p ? (p.title || p.id) : id;
  }

  function addPage(id) {
    if (state.deck.pages.length >= MAX_PAGES) {
      toast('一个方案最多 ' + MAX_PAGES + ' 页，无法继续加入', { type: 'error' });
      return;
    }
    state.deck.pages.push(id);
    saveDraft();
    renderDeck();
    var n = state.deck.pages.length;
    toast('已加入「' + pageTitleOf(id) + '」（第 ' + n + ' 页）', { type: 'success' });
    announce('已加入第 ' + n + ' 页：' + pageTitleOf(id));
  }

  function moveItem(from, to, focusAct) {
    var n = state.deck.pages.length;
    if (to < 0 || to >= n || from === to) return;
    var moved = state.deck.pages.splice(from, 1)[0];
    state.deck.pages.splice(to, 0, moved);
    saveDraft();
    renderDeck({ index: to, act: focusAct || 'item' });
    announce('第 ' + (from + 1) + ' 页已移动到第 ' + (to + 1) + ' 位');
  }

  function duplicateItem(i) {
    if (state.deck.pages.length >= MAX_PAGES) {
      toast('一个方案最多 ' + MAX_PAGES + ' 页，无法复制', { type: 'error' });
      return;
    }
    state.deck.pages.splice(i + 1, 0, state.deck.pages[i]);
    saveDraft();
    renderDeck({ index: i + 1, act: 'dup' });
    toast('已复制第 ' + (i + 1) + ' 页', { type: 'success' });
    announce('已复制第 ' + (i + 1) + ' 页');
  }

  function removeItem(i) {
    var id = state.deck.pages[i];
    state.deck.pages.splice(i, 1);
    saveDraft();
    renderDeck();
    focusItem(i);
    toast('已移除「' + pageTitleOf(id) + '」', {
      action: {
        label: '撤销', testid: 'toast-undo',
        fn: function () {
          state.deck.pages.splice(Math.min(i, state.deck.pages.length), 0, id);
          saveDraft();
          renderDeck({ index: Math.min(i, state.deck.pages.length - 1) });
          announce('已撤销移除');
        }
      }
    });
    announce('已移除第 ' + (i + 1) + ' 页，5 秒内可撤销');
  }

  function clearDeck() {
    var n = state.deck.pages.length;
    if (!n) return;
    var snapshot = state.deck.pages.slice();
    state.deck.pages = [];
    saveDraft();
    renderDeck();
    toast('已清空全部 ' + n + ' 页', {
      action: {
        label: '撤销', testid: 'toast-undo',
        fn: function () {
          state.deck.pages = snapshot;
          saveDraft();
          renderDeck();
          announce('已撤销清空');
        }
      }
    });
    announce('已清空方案，5 秒内可撤销');
  }

  /* ---------------- 拖拽排序 ---------------- */

  function clearDropMarks() {
    var marked = els['deck-list'].querySelectorAll('.drop-before, .drop-after');
    Array.prototype.forEach.call(marked, function (el) {
      el.classList.remove('drop-before', 'drop-after');
    });
  }

  function onDragStart(e) {
    var li = e.target.closest('.deck-item');
    if (!li) return;
    state.dragIndex = Number(li.dataset.index);
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(state.dragIndex)); } catch (err) { /* noop */ }
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    var li = e.target.closest('.deck-item');
    if (li) {
      var r = li.getBoundingClientRect();
      var after = e.clientY > r.top + r.height / 2;
      li.classList.add(after ? 'drop-after' : 'drop-before');
    }
  }

  function onDrop(e) {
    e.preventDefault();
    clearDropMarks();
    if (state.dragIndex == null) return;
    var from = state.dragIndex;
    state.dragIndex = null;
    var li = e.target.closest('.deck-item');
    var to;
    if (li) {
      var r = li.getBoundingClientRect();
      var after = e.clientY > r.top + r.height / 2;
      to = Number(li.dataset.index) + (after ? 1 : 0);
    } else {
      to = state.deck.pages.length;
    }
    if (to > from) to -= 1;
    if (to !== from) moveItem(from, to);
  }

  function onDragEnd() {
    state.dragIndex = null;
    clearDropMarks();
    var dragging = els['deck-list'].querySelectorAll('.dragging');
    Array.prototype.forEach.call(dragging, function (el) { el.classList.remove('dragging'); });
  }

  /* ---------------- 键盘排序（Alt+↑/↓ 移动，↑/↓ 移动焦点） ---------------- */

  function onDeckKeydown(e) {
    var li = e.target.closest('.deck-item');
    if (!li) return;
    var i = Number(li.dataset.index);
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveItem(i, i + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (!e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(i - 1);
    } else if (!e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(i + 1);
    }
  }

  /* ---------------- 命名方案（localStorage，仅本浏览器） ---------------- */

  function loadSchemes() {
    var s = lsGet(LS_SCHEMES);
    state.schemes = (s && typeof s === 'object' && !Array.isArray(s)) ? s : {};
  }

  function renderSchemes() {
    var ul = els['scheme-list'];
    ul.textContent = '';
    var names = Object.keys(state.schemes).sort(function (a, b) {
      return String(state.schemes[b].savedAt || '').localeCompare(String(state.schemes[a].savedAt || ''));
    });
    if (!names.length) {
      var empty = document.createElement('li');
      empty.className = 'scheme-empty';
      empty.textContent = '暂无命名方案。调整好页序后可「另存当前方案」。';
      ul.appendChild(empty);
      return;
    }
    names.forEach(function (name) {
      var sch = state.schemes[name];
      var li = document.createElement('li');
      li.className = 'scheme-row';
      li.dataset.testid = 'scheme-row';

      var info = document.createElement('div');
      info.className = 'scheme-info';
      var nm = document.createElement('span');
      nm.className = 'scheme-name';
      nm.textContent = name;
      var meta = document.createElement('span');
      meta.className = 'scheme-meta';
      var count = Array.isArray(sch.pages) ? sch.pages.length : 0;
      meta.textContent = count + ' 页 · ' + (sch.savedAt ? dateTimeStr(sch.savedAt) : '未知时间');
      info.appendChild(nm);
      info.appendChild(meta);
      li.appendChild(info);

      var load = document.createElement('button');
      load.type = 'button';
      load.className = 'btn btn-small';
      load.dataset.testid = 'scheme-load';
      load.textContent = '载入';
      load.setAttribute('aria-label', '载入方案 ' + name);
      load.addEventListener('click', function () { loadScheme(name); });
      li.appendChild(load);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.dataset.testid = 'scheme-delete';
      del.textContent = '✕';
      del.setAttribute('aria-label', '删除方案 ' + name);
      del.addEventListener('click', function () { deleteScheme(name); });
      li.appendChild(del);

      ul.appendChild(li);
    });
  }

  function saveSchemeAs(name) {
    var existed = Object.prototype.hasOwnProperty.call(state.schemes, name);
    state.schemes[name] = {
      title: state.deck.title || name,
      pages: state.deck.pages.slice(),
      savedAt: new Date().toISOString()
    };
    if (lsSet(LS_SCHEMES, state.schemes)) {
      toast((existed ? '已覆盖保存' : '已保存') + '方案「' + name + '」到当前浏览器', { type: 'success' });
    }
    renderSchemes();
  }

  function loadScheme(name) {
    var sch = state.schemes[name];
    if (!sch) return;
    var snapshot = { title: state.deck.title, pages: state.deck.pages.slice() };
    state.deck.title = typeof sch.title === 'string' ? sch.title : name;
    state.deck.pages = (Array.isArray(sch.pages) ? sch.pages : [])
      .filter(function (x) { return typeof x === 'string'; })
      .slice(0, MAX_PAGES);
    els['deck-title'].value = state.deck.title;
    saveDraft();
    renderDeck();
    toast('已载入方案「' + name + '」', {
      type: 'success',
      action: {
        label: '撤销', testid: 'toast-undo',
        fn: function () {
          state.deck.title = snapshot.title;
          state.deck.pages = snapshot.pages;
          els['deck-title'].value = snapshot.title;
          saveDraft();
          renderDeck();
        }
      }
    });
    announce('已载入方案 ' + name + '，共 ' + state.deck.pages.length + ' 页');
  }

  function deleteScheme(name) {
    var sch = state.schemes[name];
    if (!sch) return;
    delete state.schemes[name];
    lsSet(LS_SCHEMES, state.schemes);
    renderSchemes();
    toast('已删除方案「' + name + '」', {
      action: {
        label: '撤销', testid: 'toast-undo',
        fn: function () {
          state.schemes[name] = sch;
          lsSet(LS_SCHEMES, state.schemes);
          renderSchemes();
        }
      }
    });
  }

  /* ---------------- JSON 导入 / 导出 ---------------- */

  function deckPayload() {
    return {
      schemaVersion: 1,
      title: state.deck.title.trim() || '未命名方案',
      pages: state.deck.pages.slice(),
      meta: { app: 'pages-studio', savedAt: new Date().toISOString() }
    };
  }

  function exportJson() {
    if (!state.deck.pages.length) {
      toast('方案为空，请先加入页面', { type: 'error' });
      return;
    }
    var payload = deckPayload();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, safeFileName(payload.title) + '.deck.json');
    toast('已下载方案 JSON（' + payload.pages.length + ' 页）', { type: 'success' });
  }

  function importJsonFile(file) {
    file.text().then(function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        toast('导入失败：JSON 解析错误（' + e.message + '）', { type: 'error' });
        return;
      }
      if (!data || !Array.isArray(data.pages)) {
        toast('导入失败：JSON 中缺少 pages 数组', { type: 'error' });
        return;
      }
      if (data.schemaVersion !== undefined && data.schemaVersion !== 1) {
        toast('提示：方案 schemaVersion=' + data.schemaVersion + '，已按 v1 尽力导入', { duration: 6000 });
      }
      var ids = data.pages.filter(function (x) { return typeof x === 'string'; });
      var known = ids, unknown = 0;
      if (state.catalog) {
        known = ids.filter(function (id) { return state.pageById.has(id); });
        unknown = ids.length - known.length;
      } else {
        toast('页面库尚未加载，导入的页面未做校验', { duration: 6000 });
      }
      if (!known.length) {
        toast('导入失败：没有可识别的页面 id', { type: 'error' });
        return;
      }
      var truncated = 0;
      if (known.length > MAX_PAGES) {
        truncated = known.length - MAX_PAGES;
        known = known.slice(0, MAX_PAGES);
      }

      var snapshot = { title: state.deck.title, pages: state.deck.pages.slice() };
      state.deck.title = typeof data.title === 'string' ? data.title.slice(0, 120) : '';
      state.deck.pages = known;
      els['deck-title'].value = state.deck.title;
      saveDraft();
      renderDeck();

      var msg = '已导入 ' + known.length + ' 页';
      if (unknown) msg += '，忽略 ' + unknown + ' 个清单外页面';
      if (truncated) msg += '，超出 ' + MAX_PAGES + ' 页上限部分已截断 ' + truncated + ' 页';
      toast(msg, {
        type: 'success',
        duration: 6000,
        action: {
          label: '撤销', testid: 'toast-undo',
          fn: function () {
            state.deck.title = snapshot.title;
            state.deck.pages = snapshot.pages;
            els['deck-title'].value = snapshot.title;
            saveDraft();
            renderDeck();
          }
        }
      });
      announce(msg);
    }).catch(function (e) {
      toast('导入失败：' + e.message, { type: 'error' });
    });
  }

  /* ---------------- 预览 ---------------- */

  function showDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function openPagePreview(p) {
    els['page-preview-title'].textContent = p.title || p.id;
    var tags = Array.isArray(p.tags) && p.tags.length ? ' · 标签：' + p.tags.join(' / ') : '';
    els['page-preview-meta'].textContent = catLabel(p.category) + ' · 来源 ' + sourceOf(p) + tags;
    els['page-preview-frame'].src = pageFileUrl(p, 1, 1);
    showDialog(els['page-preview-dialog']);
  }

  function openDeckPreview() {
    var ids = state.deck.pages;
    if (!ids.length) {
      toast('方案为空，请先加入页面', { type: 'error' });
      return;
    }
    var total = ids.length;
    els['deck-preview-title'].textContent = (state.deck.title || '未命名方案') + ' · 共 ' + total + ' 页';
    var body = els['deck-preview-body'];
    body.textContent = '';
    ids.forEach(function (id, i) {
      var p = state.pageById.get(id);
      var fig = document.createElement('figure');
      fig.className = 'deck-preview-figure';
      var cap = document.createElement('figcaption');
      cap.textContent = (i + 1) + ' / ' + total + ' · ' + pageTitleOf(id);
      fig.appendChild(cap);
      if (p) {
        var frame = document.createElement('iframe');
        frame.title = '第 ' + (i + 1) + ' 页：' + (p.title || p.id);
        frame.src = pageFileUrl(p, i + 1, total);
        fig.appendChild(frame);
      } else {
        var miss = document.createElement('div');
        miss.className = 'deck-preview-missing';
        miss.textContent = '页面库清单中不存在此页：' + id;
        fig.appendChild(miss);
      }
      body.appendChild(fig);
    });
    showDialog(els['deck-preview-dialog']);
  }

  /* ---------------- PDF 导出 ---------------- */

  function setExportMode(mode) {
    state.exportMode = mode;
    var el = els['export-mode'];
    el.dataset.mode = mode;
    if (mode === 'api') {
      el.textContent = '本机服务已连接：一键下载 PDF（含中文文字层修正）';
    } else if (mode === 'print') {
      el.textContent = '静态模式：将打开打印视图，请在打印对话框选择「另存为 PDF」';
    } else {
      el.textContent = '正在检测导出方式…';
    }
    updateActionStates();
  }

  function checkApi() {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, HEALTH_TIMEOUT_MS);
    fetch('/api/health', { cache: 'no-store', signal: ctl.signal })
      .then(function (res) {
        clearTimeout(timer);
        var ct = res.headers.get('content-type') || '';
        if (!res.ok || ct.indexOf('json') < 0) { setExportMode('print'); return null; }
        return res.json().then(function (j) {
          setExportMode(j && j.pdfExport === true ? 'api' : 'print');
        });
      })
      .catch(function () {
        clearTimeout(timer);
        setExportMode('print');
      });
  }

  function filenameFromDisposition(disposition) {
    if (!disposition) return null;
    var star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (star) {
      try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch (e) { /* fall through */ }
    }
    var plain = /filename="?([^";]+)"?/i.exec(disposition);
    return plain ? plain[1].trim() : null;
  }

  function getRenderer() {
    if (!state.rendererPromise) {
      state.rendererPromise = import('./renderer.js')
        .then(function (m) {
          if (!m || typeof m.buildDeckDocument !== 'function') {
            throw new Error('renderer.js 未导出 buildDeckDocument');
          }
          return m;
        })
        .catch(function (e) {
          state.rendererPromise = null; // 允许重试
          console.error('[pages-studio] renderer 加载失败', e);
          throw new Error('组装器 renderer.js 尚未就绪，请稍后重试');
        });
    }
    return state.rendererPromise;
  }

  function waitDeckReady(w, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var waitingPromise = false;
      (function poll() {
        if (w.closed) {
          var e = new Error('打印窗口已被关闭');
          e.silent = true;
          reject(e);
          return;
        }
        try {
          var r = w.__deckReady;
          if (r === true || (w.document && w.document.documentElement && w.document.documentElement.dataset.ready === 'true')) {
            resolve();
            return;
          }
          if (!waitingPromise && r && typeof r.then === 'function') {
            waitingPromise = true;
            r.then(function () {
              resolve();
            }, function (err) {
              reject(err || new Error('页面资源渲染失败'));
            });
          }
        } catch (err) { /* 跨域防御 */ }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('等待页面渲染超时（' + Math.round(timeoutMs / 1000) + ' 秒）'));
          return;
        }
        setTimeout(poll, 150);
      })();
    });
  }

  function exportViaApi(payload) {
    var btn = els['export-pdf'];
    setBusy(btn, true, '正在导出…', '导出 PDF');
    fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        var ct = res.headers.get('content-type') || '';
        if (res.ok && ct.indexOf('application/pdf') >= 0) {
          return res.blob().then(function (blob) {
            var name = filenameFromDisposition(res.headers.get('content-disposition'))
              || safeFileName(payload.title) + '.pdf';
            downloadBlob(blob, name);
            toast('PDF 已下载到本机', { type: 'success' });
          });
        }
        return res.json()
          .catch(function () { return null; })
          .then(function (j) {
            var detail = j && j.error ? String(j.error) : 'HTTP ' + res.status;
            throw new Error(detail);
          });
      })
      .catch(function (e) {
        toast('本机导出失败：' + e.message + '。可重试，或再次点击使用打印方式', { type: 'error', duration: 8000 });
        setExportMode('print'); // 下次点击走打印回退
      })
      .finally(function () {
        setBusy(btn, false);
        updateActionStates();
      });
  }

  function exportViaPrint(payload) {
    if (!state.catalog) {
      toast('页面库尚未加载成功，无法生成打印文档', { type: 'error' });
      return;
    }
    // 同步打开窗口，避免被弹窗拦截
    var w = window.open('', '_blank');
    if (!w) {
      toast('浏览器拦截了弹出窗口，请允许本站的弹窗后重试', { type: 'error', duration: 8000 });
      return;
    }
    w.document.write(
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>准备打印…</title></head>' +
      '<body><p style="font:16px/1.8 -apple-system,PingFang SC,Microsoft YaHei,sans-serif;padding:3em;color:#1B2A4A">' +
      '正在准备打印文档，请稍候…</p></body></html>'
    );
    var btn = els['export-pdf'];
    setBusy(btn, true, '正在准备打印…', '导出 PDF');
    getRenderer()
      .then(function (m) {
        var html = m.buildDeckDocument(payload, state.catalog, { baseUrl: baseUrl().href });
        if (w.closed) return null;
        w.document.open();
        w.document.write(html);
        w.document.close();
        return waitDeckReady(w, DECK_READY_TIMEOUT_MS).then(function () {
          w.focus();
          w.print();
          toast('已打开打印视图，请选择「另存为 PDF」', { type: 'success', duration: 6000 });
        });
      })
      .catch(function (e) {
        if (e && e.silent) return; // 用户自己关了窗口
        if (!w.closed) {
          w.document.body.textContent = '生成打印文档失败：' + e.message;
        }
        toast('生成打印文档失败：' + e.message, { type: 'error', duration: 8000 });
      })
      .finally(function () {
        setBusy(btn, false);
        updateActionStates();
      });
  }

  function onExportPdf() {
    if (!state.deck.pages.length) {
      toast('方案为空，请先加入页面', { type: 'error' });
      return;
    }
    if (state.exportMode === 'checking') return; // 按钮此时为 disabled，防御双保险
    var payload = deckPayload();
    if (state.exportMode === 'api') exportViaApi(payload);
    else exportViaPrint(payload);
  }

  /* ---------------- 移动端抽屉 ---------------- */

  function setPanelOpen(open) {
    document.body.classList.toggle('panel-open', open);
    els['panel-backdrop'].hidden = !open;
    els['deck-toggle'].setAttribute('aria-expanded', String(open));
    if (open) els['panel-close'].focus();
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    // 筛选
    els['filter-search'].addEventListener('input', debounce(function () {
      setFilter({ q: els['filter-search'].value });
    }, 200));
    els['filter-source'].addEventListener('change', function () {
      setFilter({ source: els['filter-source'].value });
    });
    els['filter-tag'].addEventListener('change', function () {
      setFilter({ tag: els['filter-tag'].value });
    });
    els['cat-list'].addEventListener('click', function (e) {
      var btn = e.target.closest('[data-category]');
      if (!btn) return;
      setFilter({ category: btn.dataset.category });
      syncCategoryActive();
    });
    els['filter-clear'].addEventListener('click', clearFilters);
    els['filter-empty-clear'].addEventListener('click', clearFilters);
    els['catalog-retry'].addEventListener('click', fetchCatalog);

    // 网格：加入方案
    els['page-grid'].addEventListener('click', function (e) {
      var add = e.target.closest('[data-testid="add-page"]');
      if (!add) return;
      var card = add.closest('[data-page-id]');
      if (!card) return;
      addPage(card.dataset.pageId);
    });

    // 方案标题（自动保存）
    els['deck-title'].addEventListener('input', function () {
      state.deck.title = els['deck-title'].value;
      saveDraftDebounced();
    });

    // 清单：按钮操作 + 拖拽 + 键盘
    els['deck-list'].addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var li = btn.closest('.deck-item');
      var i = Number(li.dataset.index);
      if (btn.dataset.act === 'up') moveItem(i, i - 1, 'up');
      else if (btn.dataset.act === 'down') moveItem(i, i + 1, 'down');
      else if (btn.dataset.act === 'dup') duplicateItem(i);
      else if (btn.dataset.act === 'remove') removeItem(i);
    });
    els['deck-list'].addEventListener('dragstart', onDragStart);
    els['deck-list'].addEventListener('dragover', onDragOver);
    els['deck-list'].addEventListener('drop', onDrop);
    els['deck-list'].addEventListener('dragend', onDragEnd);
    els['deck-list'].addEventListener('keydown', onDeckKeydown);

    els['clear-deck'].addEventListener('click', clearDeck);

    // 命名方案
    els['save-scheme'].addEventListener('click', function () {
      els['scheme-form'].hidden = false;
      els['scheme-name'].value = state.deck.title || '';
      els['scheme-name'].focus();
    });
    els['scheme-cancel'].addEventListener('click', function () {
      els['scheme-form'].hidden = true;
    });
    els['scheme-form'].addEventListener('submit', function (e) {
      e.preventDefault();
      var name = els['scheme-name'].value.trim();
      if (!name) {
        toast('请填写方案名称', { type: 'error' });
        els['scheme-name'].focus();
        return;
      }
      saveSchemeAs(name);
      els['scheme-form'].hidden = true;
    });

    // JSON 导入导出
    els['export-json'].addEventListener('click', exportJson);
    els['import-json'].addEventListener('click', function () {
      els['import-json-input'].click();
    });
    els['import-json-input'].addEventListener('change', function () {
      var f = els['import-json-input'].files && els['import-json-input'].files[0];
      els['import-json-input'].value = '';
      if (f) importJsonFile(f);
    });

    // 预览与导出
    els['preview-deck'].addEventListener('click', openDeckPreview);
    els['export-pdf'].addEventListener('click', onExportPdf);

    // 对话框关闭
    Array.prototype.forEach.call(document.querySelectorAll('.preview-dialog'), function (dlg) {
      Array.prototype.forEach.call(dlg.querySelectorAll('[data-close]'), function (btn) {
        btn.addEventListener('click', function () { dlg.close(); });
      });
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg) dlg.close(); // 点击背板关闭
      });
    });
    els['page-preview-dialog'].addEventListener('close', function () {
      els['page-preview-frame'].src = 'about:blank';
    });
    els['deck-preview-dialog'].addEventListener('close', function () {
      els['deck-preview-body'].textContent = '';
    });

    // 移动端抽屉
    els['deck-toggle'].addEventListener('click', function () { setPanelOpen(true); });
    els['panel-close'].addEventListener('click', function () { setPanelOpen(false); });
    els['panel-backdrop'].addEventListener('click', function () { setPanelOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('panel-open')) {
        setPanelOpen(false);
      }
    });
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    EL_IDS.forEach(function (id) { els[id] = document.getElementById(id); });
    bindEvents();
    readQuery();
    loadDraft();
    els['deck-title'].value = state.deck.title;
    loadSchemes();
    renderSchemes();
    renderDeck();
    fetchCatalog();
    checkApi();
  }

  init();
})();
