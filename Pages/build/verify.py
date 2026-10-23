import os, sys, json, re
from pathlib import Path

root = Path(__file__).resolve().parent.parent.parent
pages_dir = root / 'Pages'
shared_pages = root / 'shared' / 'pages'

print('== 1. 检验 pages.json 与 catalog.js 清单 ==')
pages_json_path = pages_dir / 'pages.json'
catalog_js_path = pages_dir / 'catalog.js'
assert pages_json_path.exists(), 'pages.json 不存在'
assert catalog_js_path.exists(), 'catalog.js 不存在'

catalog = json.loads(pages_json_path.read_text('utf-8'))
assert catalog_js_path.read_text('utf-8').strip().removeprefix('window.PAGES_CATALOG = ').removesuffix(';').strip() and json.loads(catalog_js_path.read_text('utf-8').strip().removeprefix('window.PAGES_CATALOG = ').removesuffix(';')) == catalog, 'catalog.js 与 pages.json 不同步'
assert catalog.get('schemaVersion') == 1, 'schemaVersion 必须为 1'
assert catalog.get('designSystemVersion') == 'welink-v1', 'designSystemVersion 错误'
pages = catalog.get('pages', [])
assert 20 <= len(pages) <= 40, f'入库页面数量应在 20-40 之间，当前为 {len(pages)}'

categories = {c['id'] for c in catalog.get('categories', [])}
required_cats = {'cover', 'section', 'content', 'data', 'case', 'end'}
assert required_cats.issubset(categories), f'六大分类未完全覆盖: {required_cats - categories}'

print(f'pages.json 清单正确，包含 {len(pages)} 页，覆盖 6 大分类。')

print('== 2. 检验页面文件与静态契约 ==')
banned_words = ['一键认证', '一健认证', '中间号', '聚WE', '聚WU']
for p in pages:
    f_path = (pages_dir / p['file']).resolve()
    assert (pages_dir / p['thumbnail']).exists(), f"{p['id']} 缩略图丢失"
    assert f_path.exists(), f"页面 HTML 丢失: {p['file']}"
    content = f_path.read_text('utf-8')
    assert '<section class="slide' in content, f"{p['id']} 缺少 slide section"
    assert '@page-id: ' + p['id'] in content, f"{p['id']} 缺少 @page-id 元信息注释"
    # 检查已移除业务（限定在 body 正文内）
    body_text = content[content.find('<body>'):] if '<body>' in content else content
    for bw in banned_words:
        assert bw not in body_text, f"{p['id']} 正文包含已移除业务词: {bw}"

print(f'全量 {len(pages)} 个单页 HTML 文件均存在，静态契约自检通过，无违规废弃业务。')

print('== 3. 检验 design-system.css 规范文件 ==')
ds_path = root / 'shared' / 'design-system.css'
assert ds_path.exists(), 'shared/design-system.css 不存在'
ds_content = ds_path.read_text('utf-8')
assert '--navy: #0A1F44;' in ds_content, '缺少核心 token --navy'
assert '--red: #F02D4E;' in ds_content, '缺少核心 token --red'
print('shared/design-system.css 规范源检验通过。')

print('== 4. 检验 example.deck.json 组装方案 ==')
deck_path = pages_dir / 'decks' / 'example.deck.json'
assert deck_path.exists(), 'example.deck.json 不存在'
deck = json.loads(deck_path.read_text('utf-8'))
assert deck.get('schemaVersion') == 1, 'deck.schemaVersion 必须为 1'
page_ids = set(p['id'] for p in pages)
for pid in deck.get('pages', []):
    assert pid in page_ids, f'方案引用未知页面: {pid}'
print(f'example.deck.json 正确，引用了 {len(deck.get("pages", []))} 页。')

print('All static verifications PASSED.')
