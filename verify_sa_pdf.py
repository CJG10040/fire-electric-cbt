#!/usr/bin/env python3
"""PDF 검증: 모든 카드 훅/줄, 비교표 행이 PDF 텍스트에 존재하고, 폰트가 임베드되며, 글자 깨짐(□/U+FFFD)이 없는지 확인."""
import re, subprocess, sys, unicodedata, pickle
from pathlib import Path
import build_sa_pdf as b
import sa_memo_lib

outdir = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
main = outdir / "소방설비산업기사_단답암기노트_인쇄용.pdf"
prac = outdir / "소방설비산업기사_숫자비교_연습지_인쇄용.pdf"

def text(p):
    return subprocess.run(["pdftotext", str(p), "-"], capture_output=True, text=True, check=True).stdout

def norm(s):
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[\s\-]+", "", s)   # pdftotext drops hyphens at line breaks

items, clusters, memo, by_id, cl = b.load_data()
fonts = b.Fonts()
T = norm(text(main))
P = norm(text(prac))
# strip every label / note / title (they may legitimately contain a value as a substring) before the leak check
P_rest = P
for s in sorted(memo["compares"], key=lambda s: -len(s["t"])):
    for frag in [s["t"]] + [x for r in s["r"] for x in (r["lb"], r["n"])]:
        w = norm(fonts.clean(b.plain(frag)))
        if w:
            P_rest = P_rest.replace(w, "")
miss = []
for c in memo["cards"]:
    for frag in [c["h"], *c["l"], c["t"]]:
        if not frag:
            continue
        want = norm(fonts.clean(b.plain(frag)))
        if want and want not in T:
            miss.append(("card", c["ks"][0], want[:40]))
for s in memo["compares"]:
    for r in s["r"]:
        for frag in (r["lb"], r["v"]):
            want = norm(fonts.clean(b.plain(frag)))
            if want not in T:
                miss.append(("cmp", s["id"], want[:40]))
            if frag == r["lb"] and r["n"] and len(norm(fonts.clean(b.plain(r["n"])))) > 6 and norm(fonts.clean(b.plain(r["n"]))) in P:
                miss.append(("prac-note-leak", s["id"], r["n"][:30]))
            if frag == r["lb"] and want not in P:
                miss.append(("prac-label", s["id"], want[:40]))
            if frag == r["v"] and len(want) > 4 and want in P_rest:
                miss.append(("prac-leak", s["id"], want[:40]))   # 연습지에 정답이 새면 안 됨
bad = [ch for ch in set(text(main) + text(prac)) if ch in "\ufffd□☒"]
fnt = subprocess.run(["pdffonts", str(main)], capture_output=True, text=True).stdout
not_emb = [l for l in fnt.splitlines()[2:] if l.split()[-5] != "yes"]
pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(main)], capture_output=True, text=True).stdout).group(1))
assert not miss, f"missing in PDF text: {miss[:8]} (+{len(miss)})"
assert not bad, f"broken glyphs: {bad}"
assert not not_emb, not_emb
print(f"PASS: {len(memo['cards'])} cards + {len(memo['compares'])} compare sets present in text; practice sheet has no answers; fonts embedded; {pages} pages")
