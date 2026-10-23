"""Package the current presentation and reproducible sources without build caches."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
files = [root / name for name in ('index.html', 'UMC.pdf', 'UMC.pptx')]
files += sorted(p for p in (root / 'assets').rglob('*') if p.is_file() and not p.name.startswith('.'))
source_names = ('_top.html', '_bottom.html', 'slide-styles.html', 'part-1.html', 'part-2.html', 'part-3.html',
                'GUIDE.md', 'sync-sources.mjs', 'assemble.mjs', 'export-deck.mjs', 'make-pptx.mjs',
                'pack.py', 'package.json', 'verify.py', 'normalize-pdf.py')
files += [root / 'build' / name for name in source_names]
missing = [str(p) for p in files if not p.exists()]
if missing:
    raise FileNotFoundError('\n'.join(missing))
output = root / 'UMC.zip'
temporary = output.with_suffix('.zip.tmp')
with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, Path('UMC') / file.relative_to(root))
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert {'UMC/index.html', 'UMC/UMC.pptx', 'UMC/UMC.pdf'} <= names
    assert not any('.workbuddy' in n or 'node_modules' in n or 'generated/' in n for n in names)
temporary.replace(output)
print(f'{output.name}: {len(files)} files, {output.stat().st_size / 1024 / 1024:.1f} MB')
