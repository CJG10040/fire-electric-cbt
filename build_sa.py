"""Fill the SA marker blocks in cbt_v2/cbt.html from sa_src/* and the freshly built bank (idempotent)."""
import json
import re
from pathlib import Path

import sa_final
import sa_memo_check
import sa_memo_lib

HTML = Path("cbt_v2/cbt.html")
html = HTML.read_text(encoding="utf-8")

items, clusters, meta = sa_final.build()
bank = sa_final.to_bank(items, clusters, meta)
# safety: ids are interpolated into inline handlers, keep them to a strict charset
assert all(re.fullmatch(r"k\d{4}_\d_\d{2}", c["k"]) for c in bank["clusters"])
assert all(re.fullmatch(r"m\d{4}_\d_\d{2}", o["id"]) for o in bank["occ"])
assert all(re.fullmatch(r"https://youtu\.be/[\w-]+", u) for u in bank["sources"].values())
data = json.dumps(bank, ensure_ascii=False, separators=(",", ":"))
assert not re.search(r"</script|<!--", data, re.I), "data would break the inline script"

# mnemonic content: validated against the bank (numbers / terms must exist in the source answers)
sa_memo_check.load_all()
memo_errors = sa_memo_lib.validate(items, clusters)
assert not memo_errors, "memo validation failed:\n" + "\n".join(memo_errors)
memo = sa_memo_lib.payload(items, clusters)
assert all(re.fullmatch(r"[a-z_]+", s["id"]) for s in memo["compares"])
known_k = {c["k"] for c in clusters}
assert all(k in known_k for c in memo["cards"] for k in c["ks"])
assert all(k in known_k for s in memo["compares"] for r in s["r"] for k in r["ks"])
assert {k for c in memo["cards"] for k in c["ks"]} == known_k, "every cluster needs a mnemonic card"
memo_json = json.dumps(memo, ensure_ascii=False, separators=(",", ":"))
assert not re.search(r"</script|<!--", memo_json, re.I)

js = Path("sa_src/sa.js").read_text(encoding="utf-8")
assert js.count("/*SA_DATA_START*/null/*SA_DATA_END*/") == 1 and js.count("/*SA_MEMO_START*/null/*SA_MEMO_END*/") == 1
js = js.replace("/*SA_DATA_START*/null/*SA_DATA_END*/", "/*SA_DATA_START*/" + data + "/*SA_DATA_END*/")
js = js.replace("/*SA_MEMO_START*/null/*SA_MEMO_END*/", "/*SA_MEMO_START*/" + memo_json + "/*SA_MEMO_END*/")
assert not re.search(r"</script|<!--", js, re.I)
css = Path("sa_src/sa.css").read_text(encoding="utf-8")
screens = Path("sa_src/sa_screens.html").read_text(encoding="utf-8")


def fill(text: str, start: str, end: str, payload: str) -> str:
    pat = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    assert len(pat.findall(text)) == 1, f"marker pair not found exactly once: {start}"
    return pat.sub(lambda m: start + payload + end, text)


html = fill(html, "/*SA_CSS_START*/", "/*SA_CSS_END*/", css)
html = fill(html, "<!--SA_SCREENS_START-->", "<!--SA_SCREENS_END-->", screens)
html = fill(html, "/*SA_JS_START*/", "/*SA_JS_END*/", js)
HTML.write_text(html, encoding="utf-8")
print(f"built: {len(bank['occ'])} occurrences, {len(bank['clusters'])} clusters; cbt.html {len(html.encode('utf-8')):,} bytes")
