"""Cloud is additive/optional; original questions, functions and offline runtime remain byte-identical."""
from pathlib import Path
import re,subprocess,os
html=Path('cbt_v2/cbt.html').read_text()
pattern=r'\n/\*CLOUD_SYNC_START\*/\n(.*?)\n/\*CLOUD_SYNC_END\*/\n'
parts=re.findall(pattern,html,flags=re.S)
assert len(parts)==1
assert parts[0]==Path('cloud_sync.js').read_text()
baseline=subprocess.check_output(['git','show','f70eee508e9f53d689e76e37c9b1e4e7fb0cb289:cbt_v2/cbt.html']).decode()
assert re.sub(pattern,'',html,flags=re.S)==baseline,'offline core or historical data changed'
assert html.count('</script>')==1
assert parts[0].count('fetch(')==1
assert 'credentials:\'omit\'' in parts[0] and 'baseVersion:' in parts[0]
for name in ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GITHUB_TOKEN']:
    secret=os.environ.get(name)
    if secret:
        for p in [Path('cbt_v2/cbt.html'),Path('cloud_sync.js'),Path('server/worker.mjs')]:
            assert secret not in p.read_text(),'credential value included in public output'
print('PASS optional cloud marker/source, byte-identical original core, 493 questions/SA/undo preserved, no service credential values')
