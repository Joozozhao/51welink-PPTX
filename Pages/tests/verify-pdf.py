"""Independent PDF acceptance: real pages, text, order and aspect ratio."""
from collections import Counter
from pathlib import Path
import json
import re
import sys
import unicodedata
from pypdf import PdfReader

folder = Path(__file__).resolve().parent / 'output'
model = json.loads((folder / 'expected-text.json').read_text())
files = [Path(value) for value in sys.argv[1:]] or [folder / 'api-export.pdf', folder / 'static-print.pdf']
radicals = str.maketrans({'⻓': '长', '⻛': '风', '⻔': '门', '⻋': '车'})


def normalize(value, compatibility):
    if compatibility:
        value = ''.join(unicodedata.normalize('NFKC', c) if 0x2E80 <= ord(c) <= 0x2FFF else c for c in value).translate(radicals)
    return Counter(re.sub(r'\s+|\u200b|\u00ad', '', value))


for file in files:
    reader = PdfReader(file)
    assert len(reader.pages) == len(model['deck']['pages']), f'{file.name}: actual page count'
    compatibility = file.name == 'static-print.pdf'
    for number, (page, expected) in enumerate(zip(reader.pages, model['printedText']), 1):
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        assert abs(width / height - 16 / 9) < 0.001, f'{file.name}: aspect ratio page {number}'
        extracted = page.extract_text() or ''
        assert extracted.strip(), f'{file.name}: native searchable text page {number}'
        actual_counts = normalize(extracted, compatibility)
        expected_counts = normalize(expected, False)
        missing = expected_counts - actual_counts
        extra = actual_counts - expected_counts
        assert not missing and not extra, f'{file.name}: page {number} text coverage: missing {dict(missing)}, extra {dict(extra)}'
    print(f'PASS {file.name}: {len(reader.pages)} actual 16:9 pages, correct order and full native text coverage' + (' (compatibility radicals normalized for comparison)' if compatibility else ' (exact Chinese Unicode)'))
