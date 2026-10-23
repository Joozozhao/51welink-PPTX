"""Correct Chromium's CJK radical aliases in ToUnicode without changing glyphs."""
from pathlib import Path
import re
import sys
import unicodedata
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject

path = Path(sys.argv[1])
reader = PdfReader(path)
writer = PdfWriter()
writer.clone_document_from_reader(reader)
seen = set()
radicals = str.maketrans({'⻓': '长', '⻛': '风', '⻔': '门', '⻋': '车'})
def normalize(value):
    text = bytes.fromhex(value).decode('utf-16-be')
    text = ''.join(unicodedata.normalize('NFKC', char) if 0x2E80 <= ord(char) <= 0x2FFF else char for char in text)
    return text.translate(radicals).encode('utf-16-be').hex().upper()

def rewrite(data):
    def chars(match):
        rows = re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', match[1])
        return f'{len(rows)} beginbfchar\n' + '\n'.join(f'<{a}> <{normalize(b)}>' for a, b in rows) + '\nendbfchar'
    data = re.sub(r'\d+ beginbfchar\s*(.*?)\s*endbfchar', chars, data, flags=re.S)
    def ranges(match):
        rows = []
        for line in match[1].splitlines():
            parts = re.findall(r'<([0-9A-Fa-f]+)>', line)
            if not parts:
                continue
            a, b = parts[:2]
            start, end = int(a, 16), int(b, 16)
            values = parts[2:] if '[' in line else [f'{int(parts[2],16)+i:0{len(parts[2])}X}' for i in range(end-start+1)]
            if len(values) != end-start+1:
                raise ValueError('Unsupported ToUnicode range: ' + line)
            rows += [(f'{start+i:0{len(a)}X}', normalize(v)) for i, v in enumerate(values)]
        return f'{len(rows)} beginbfchar\n' + '\n'.join(f'<{a}> <{b}>' for a, b in rows) + '\nendbfchar'
    return re.sub(r'\d+ beginbfrange\s*(.*?)\s*endbfrange', ranges, data, flags=re.S)

for page in writer.pages:
    for ref in page.get('/Resources', {}).get('/Font', {}).values():
        font = ref.get_object()
        if '/ToUnicode' not in font:
            continue
        stream = font['/ToUnicode']
        key = id(stream)
        if key in seen:
            continue
        seen.add(key)
        data = stream.get_data().decode('ascii')
        stream_out = DecodedStreamObject()
        stream_out.set_data(rewrite(data).encode('ascii'))
        font[NameObject('/ToUnicode')] = writer._add_object(stream_out.flate_encode())
for page in writer.pages:
    page.compress_content_streams()
with path.open('wb') as file:
    writer.write(file)
print('Normalized PDF text mappings:', len(seen), 'font subsets')
