"""Validate additive law payload and prove source bank/answers/mnemonics unchanged.
This is a content-fidelity/build test, NOT an independent legal opinion.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import sa_final
import sa_law

html = Path('cbt_v2/cbt.html').read_text(encoding='utf-8')
def block(text, name):
    m = re.search(r'/\*'+name+r'_START\*/(.*?)/\*'+name+r'_END\*/',text,re.S)
    assert m, name
    return json.loads(m.group(1))

bank=block(html,'SA_DATA')
memo=block(html,'SA_MEMO')
law=block(html,'SA_LAW')
items,clusters,_=sa_final.build()
expected=sa_law.payload(items,clusters)
assert law==expected, 'embedded law payload drift'
assert set(law['review'])=={c['k'] for c in bank['clusters']}
assert sum(law['counts'].values())==307
assert all(set(n['ks']) <= set(law['review']) for n in law['notes'])
assert law['asOf']=='2026-10-25'
raw=json.dumps([(o['id'],o['qh'],o['ah']) for o in bank['occ']],ensure_ascii=False,separators=(',',':'))
assert hashlib.sha256(raw.encode()).hexdigest()==law['sourceAnswerSHA256']
offline_html=re.sub(r'\n/\*CLOUD_SYNC_START\*/.*?/\*CLOUD_SYNC_END\*/\n','',html,flags=re.S)
assert not re.search(r'<script[^>]+src=|\bfetch\s*\(',offline_html,re.I)
assert html.count('</script>')==html.count('</body>')==html.count('</html>')==1
assert all(n['change_on'] for n in law['notes'] if n['status']=='amendment')

# Git baseline (latest published release). A file argument also works outside Git.
if len(sys.argv)>1:
    baseline=Path(sys.argv[1]).read_text(encoding='utf-8')
else:
    baseline=subprocess.check_output(['git','show','686bda9287733712fc6003f8fe2c2b3611d007ea:cbt_v2/cbt.html']).decode()
assert block(baseline,'SA_DATA')==bank, 'historical questions/answers/IDs/clusters changed'
assert block(baseline,'SA_MEMO')==memo, 'historical memorization data changed'
def without_sa(t):
    t=re.sub(r'\n/\*CLOUD_SYNC_START\*/.*?/\*CLOUD_SYNC_END\*/\n','',t,flags=re.S)
    for a,b in [('/*SA_CSS_START*/','/*SA_CSS_END*/'),('<!--SA_SCREENS_START-->','<!--SA_SCREENS_END-->'),('/*SA_JS_START*/','/*SA_JS_END*/')]:
        t=re.sub(re.escape(a)+r'.*?'+re.escape(b),a+b,t,flags=re.S)
    return t
assert without_sa(baseline)==without_sa(html), 'unrelated image-CBT, grading, progress or undo code changed'

byid={n['id']:n for n in law['notes']}
assert '직상 4개' in ' '.join(byid['alarm_floors']['lines'])
assert '백색 = 80℃ 미만' in ' '.join(byid['detector_color']['lines'])
assert '1회선당 50MΩ' in ' '.join(byid['receiver_insulation']['lines'])
assert '1,440V' in ' '.join(byid['receiver_insulation']['lines'])
assert '3kVA' in ' '.join(byid['socket_product_install']['lines'])
assert law['review']['k2019_0_01']['status']=='pending'
assert law['review']['k2013_0_01']['status']=='checked', 'visually verified height table drift'
assert law['review']['k2015_0_04']['status']=='checked', 'visually verified area table drift'
assert law['counts']['pending']==14
assert len({k for n in law['notes'] if n['status'] in {'amendment','correction','supplement'} for k in n['ks']})==54
assert '5%/m 미만' in ' '.join(byid['height_20_table']['lines'])
assert '25mm 이상' in ' '.join(byid['power_wiring_table']['lines'])
assert '축적기능을 갖지 않도록' in ' '.join(byid['smoke_travel_table']['lines'])
assert '제1호부터 제5호까지 외의 건축물' in ' '.join(byid['exit_factory_table']['lines'])
assert byid['construction_alarm']['change_on']=='2023-07-01'
assert law['review']['k2016_0_06']['status']=='pending'
assert law['review']['k2013_0_16']['status']=='pending'
import base64
table=law['tables']['height']
assert set(table['links'])=={'k2013_0_01','k2013_0_20','k2019_0_24'}
image=base64.b64decode(table['src'].split(',',1)[1],validate=True)
assert image==Path('sa_src/law_tables/height.gif').read_bytes()
assert hashlib.sha256(image).hexdigest()==table['sha256']
assert table['source']=='t203' and law['sources']['t203']['effective']=='2026-03-01'
assert '5%/m' in table['links']['k2013_0_20']
print('PASS additive law:',len(law['notes']),'notes;',law['counts'],'; 447 source answers, 307 clusters, 145 cards, image-CBT and undo byte-preserved outside SA blocks')
