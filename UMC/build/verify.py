"""Verify the published slide sources, native PPTX text, searchable PDF and ZIP."""
from pathlib import Path
from collections import Counter
import html
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
folder = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root
source = (root / 'index.html').read_text()
slides = re.findall(r'<section\b[\s\S]*?</section>', source)
assert len(slides) == 25, 'HTML slide count'
assert not re.search(r'一[键健]认证|中间号|聚(?:WE|WU)', source, re.I)
parts = ['_top.html', 'slide-styles.html', 'part-1.html', 'part-2.html', 'part-3.html', '_bottom.html']
assert source == '\n'.join((root / 'build' / name).read_text() for name in parts), 'Sources out of sync'
for i, slide in enumerate(slides, 1):
    label = re.search(r'class="pageno">(\d+) / (\d+)', slide)
    if label:
        assert tuple(map(int, label.groups())) == (i, 25), f'Page label {i}'

normalize = lambda text: Counter(re.sub(r'\s+', '', text))
expected = [normalize(html.unescape(re.sub(r'<[^>]*>', '', slide))) for slide in slides]
with zipfile.ZipFile(folder / 'UMC.pptx') as archive:
    assert archive.testzip() is None, 'PPTX archive integrity'
    names = [n for n in archive.namelist() if re.fullmatch(r'ppt/slides/slide\d+.xml', n)]
    assert len(names) == 25
    total = 0
    for i, text in enumerate(expected, 1):
        tree = ET.fromstring(archive.read(f'ppt/slides/slide{i}.xml'))
        items = [e.text or '' for e in tree.iter() if e.tag.endswith('}t')]
        assert items, f'No editable text on slide {i}'
        assert normalize(''.join(items)) == text, f'PPTX text coverage slide {i}'
        total += len(items)
    source_file = root / 'assets/clients/sources.json'
    if source_file.exists():
        logos = json.loads(source_file.read_text())['logos']
        vectors = [logo for logo in logos if logo['status'] == 'svg']
        last_slide = ET.fromstring(archive.read('ppt/slides/slide25.xml'))
        svg_blips = [e for e in last_slide.iter() if e.tag == '{http://schemas.microsoft.com/office/drawing/2016/SVG/main}svgBlip']
        assert len(svg_blips) == len(vectors), 'PPTX customer SVG count'
        embedded_svg = [archive.read(name) for name in archive.namelist() if name.startswith('ppt/media/') and name.endswith('.svg')]
        for logo in vectors:
            assert (root / logo['file']).read_bytes() in embedded_svg, f'Missing native SVG: {logo["name"]}'
        print(f'Customer logos: {len(vectors)} native SVG images in PPTX')
print(f'PPTX: 25 slides; {total} native text runs; exact text coverage')
pdf = PdfReader(folder / 'UMC.pdf')
assert len(pdf.pages) == 25
for i, (page, text) in enumerate(zip(pdf.pages, expected), 1):
    extracted = page.extract_text() or ''
    assert normalize(extracted) == text, f'PDF text coverage slide {i}'
print('PDF: 25 pages; exact Unicode text coverage, including Chinese')
refs = set(re.findall(r'(?:src|href)=[\'"]([^\'"]+)', source))
refs.update(re.findall(r'url\([\'"]?([^\)\'\"]+)', source))
for ref in refs:
    if ref.startswith(('http:', 'https:', 'data:', '#')):
        continue
    if folder != root and ref == 'UMC.zip':
        continue
    assert (root / ref).exists(), f'Missing resource: {ref}'
if folder == root:
    with zipfile.ZipFile(root / 'UMC.zip') as archive:
        assert archive.testzip() is None
        for name in ('index.html', 'UMC.pptx', 'UMC.pdf'):
            assert archive.read('UMC/' + name) == (root / name).read_bytes(), f'ZIP stale file: {name}'
print('HTML: sources synchronized; page labels and resource links valid')
