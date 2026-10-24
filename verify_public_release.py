"""Verify a public release: no credentials/private progress, intact app/assets, reproducible SHA-256 manifest.
Run after git add. Use --write-manifest only when intentionally making a new release.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys

root = Path('.')
paths = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
paths = sorted(p for p in paths if p and p != 'release-manifest.json')
assert paths and 'cbt_v2/cbt.html' in paths
for name in paths:
    p = Path(name)
    assert not p.is_absolute() and '..' not in p.parts and not p.is_symlink(), name
    assert not any(part in {'.pi', '.user-files', '.git', 'extracted', '_jsdom', 'node_modules', '__pycache__'} for part in p.parts), name
    assert p.name not in {'.env', 'orig_cbt_data.json'}, name
    assert not p.name.startswith('.env.'), name
    assert p.suffix not in {'.pkl', '.zip', '.xlsx', '.key', '.pem'}, name
    assert p.stat().st_size < 100_000_000, name

progress = json.loads(Path('cbt_v2/cbt_data.json').read_text())
for k in ('wrong', 'history', 'solved', 'myNotes'):
    assert not progress.get(k), 'public template contains records: ' + k
assert progress['_savedAt'] is None and progress['_device'] == 'public-empty-template'
for k in ('wrong', 'solved', 'history'):
    assert not progress['sa'][k], 'public SA template contains records: ' + k

html = Path('cbt_v2/cbt.html').read_bytes()
assert hashlib.sha256(html).hexdigest() == '7aed881eea6104408e384b21788f60d0e0277c4d4f85fc8f5ba22827df4eb528', 'unexpected application version'
text = html.decode()
bank = json.loads(re.search(r'const DB\s*=\s*(\[\s*\{.*?\}\s*\]);', text, re.S).group(1))
assert len(bank) == 493
images = {f'cbt_v2/{q[f]}' for q in bank for f in ('qi', 'ai')}
assert len(images) == 986 and images <= set(paths)
assert all(Path(p).is_file() and Path(p).read_bytes().startswith(b'\xff\xd8') for p in images)
assert len([p for p in paths if p.startswith('downloads/') and p.endswith('.pdf')]) == 2
assert Path('index.html').is_file() and Path('.nojekyll').is_file()

# Values are checked in memory and never printed or written into the repository.
secrets = [v.encode() for k in ('GITHUB_TOKEN', 'VWORLD_API_KEY') if (v := os.environ.get(k)) and len(v) >= 12]
pat = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)')
records = []
for name in paths:
    data = Path(name).read_bytes()
    assert not any(s in data for s in secrets), 'credential value detected in: ' + name
    assert not pat.search(data), 'credential-like content detected in: ' + name
    records.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

manifest = {'release_date': '2026-10-24', 'application_sha256': hashlib.sha256(html).hexdigest(),
            'questions': 493, 'explanations': 379, 'images': 986, 'sa_occurrences': 447,
            'sa_clusters': 307, 'mnemonic_cards': 145, 'comparison_sets': 14,
            'private_progress_included': False, 'files': records}
mp = Path('release-manifest.json')
if '--write-manifest' in sys.argv:
    mp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
else:
    assert json.loads(mp.read_text(encoding='utf-8')) == manifest, 'release manifest drift; review before regenerating'
print(f'PASS public release: {len(paths)} manifest files; {sum(r["bytes"] for r in records):,} bytes; 986 images; PDFs 2; private progress EMPTY; credentials absent; manifest verified')
