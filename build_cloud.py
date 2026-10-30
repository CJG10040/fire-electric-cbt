"""Append the optional cloud module without changing the original offline runtime."""
from pathlib import Path
import re
p=Path('cbt_v2/cbt.html')
s=p.read_text()
s=re.sub(r'\n/\*CLOUD_SYNC_START\*/.*?/\*CLOUD_SYNC_END\*/\n','',s,flags=re.S)
assert s.count('</script>')==1
code=Path('cloud_sync.js').read_text()
s=s.replace('</script>','\n/*CLOUD_SYNC_START*/\n'+code+'\n/*CLOUD_SYNC_END*/\n</script>')
p.write_text(s)
print('Optional cloud module embedded; offline core unchanged')
