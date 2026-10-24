"""Static checks for the 단답·서술 mode embedded in cbt_v2/cbt.html (called by verify_cbt.py --sa)."""
from __future__ import annotations
import json
import re
from collections import Counter
from html.parser import HTMLParser

import sa_parse


class _Balance(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.err = [], None

    def handle_starttag(self, tag, attrs):
        if tag != "br":
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1] != tag:
            self.err = (tag, list(self.stack))
        else:
            self.stack.pop()


def run(html: str, root):
    m = re.search(r"/\*SA_DATA_START\*/(.*?)/\*SA_DATA_END\*/", html, re.S)
    assert m, "SA data block missing"
    bank = json.loads(m.group(1))
    occ, clusters = bank["occ"], bank["clusters"]
    assert len(occ) == 447 and len(clusters) == 307, (len(occ), len(clusters))
    assert len(bank["topics"]) == 14 and len(bank["sources"]) == 17

    # --- bank equals a fresh parse of the markdown (no drift between source and app)
    items, meta = sa_parse.parse()
    by_md = {it["id"]: it for it in items}
    assert set(by_md) == {o["id"] for o in occ}, "occurrence id set differs from the markdown"
    for o in occ:
        it = by_md[o["id"]]
        assert o["qh"] == it["qh"] and o["ah"] == it["ah"], "text drift for " + o["id"]
        assert (o["y"], o["r"], o["n"], o["t"]) == (it["y"], it["r"], it["n"], it["t"])
    per_block = Counter(f"{o['y']}_{o['r'] or 0}" for o in occ)
    assert dict(per_block) == meta["declared"], "per-exam counts differ from the declared 문항 수"
    assert bank["sources"] == meta["sources"]

    # --- markup / content hygiene
    for o in occ:
        for f in ("qh", "ah"):
            p = _Balance()
            p.feed(o[f])
            assert not p.err and not p.stack, (o["id"], f, p.err, p.stack)
            assert "$" not in o[f] and "\\" not in o[f] and "**" not in o[f], (o["id"], f)
            assert "<script" not in o[f].lower()
        assert o["qh"].strip() and o["ah"].strip(), o["id"]

    # --- the quiz view hides titles that would reveal the answer
    import sa_final
    for o in occ:
        assert bool(o["ht"]) == sa_final.title_leaks(by_md[o["id"]]), "title-leak flag mismatch " + o["id"]
    assert sum(o["ht"] for o in occ) >= 5

    # --- cluster invariants
    ids = [i for c in clusters for i in c["m"]]
    assert len(ids) == len(set(ids)) == 447
    occ_by = {o["id"]: o for o in occ}
    for c in clusters:
        assert c["rep"] == c["m"][0] and c["rep"] in occ_by
        blocks = [f"{occ_by[i]['y']}_{occ_by[i]['r'] or 0}" for i in c["m"]]
        assert len(blocks) == len(set(blocks)), "same exam twice in " + c["k"]
        assert all(occ_by[i]["c"] == c["k"] for i in c["m"])
        order = [(occ_by[i]["y"], occ_by[i]["r"] or "0") for i in c["m"]]
        assert order == sorted(order, reverse=True), "members not newest-first in " + c["k"]
        assert 0 <= c["tp"] < 14
    assert sum(1 for c in clusters if len(c["m"]) > 1) == 83
    assert max(len(c["m"]) for c in clusters) == 9

    # --- UI wiring present
    for token in ('data-screen="sa"', 'data-screen="sa-wrong"', 'id="screen-sa"', 'id="screen-sa-quiz"', 'id="screen-sa-result"', 'id="screen-sa-wrong"',
                  "function saStart", "function saGrade", "function saRenderWrong", "function normalizeSA", "function _persistSA", "'cbt_sa_v1'",
                  "_version: 3", "sa:      STORE.sa", "if(name==='sa') saRenderHub();", "if(name==='sa-wrong') saRenderWrong();"):
        assert token in html, "missing: " + token
    assert html.count("showScreen('sa')") >= 1 and html.count("showScreen('sa-wrong')") >= 2

    # --- isolation: SA code never touches the old stores, the old exam engine never touches sa
    js = re.search(r"/\*SA_JS_START\*/(.*?)/\*SA_JS_END\*/", html, re.S).group(1)
    code = re.sub(r"/\*SA_DATA_START\*/.*?/\*SA_DATA_END\*/", "null", js, flags=re.S)
    code = re.sub(r"(?m)^\s*//[^\n]*$|\s//\s[^\n]*$", "", code)  # drop comment-only text before scanning
    for bad in (r"STORE\.wrong", r"STORE\.solved", r"STORE\.history", r"\baddWrong\(", r"\bremoveWrong\(", r"\bsaveWrong\(", r"\bgetWrong\(", r"\baddHistory\(", r"\baddSolved\(",
                r"\blaunchQuiz\(", r"(?<![A-Za-z_])STATE\.", r"\bfetch\s*\("):
        assert not re.search(bad, code), "SA code must not use " + bad
    fe = re.search(r"function finishExam\(.*?\n}\n\nfunction renderResultList", html, re.S).group(0)
    assert "STORE.sa" not in fe and "_persistSA" not in fe
    for fn in ("addWrong", "removeWrong", "clearWrongNote", "startWrongExam", "renderWrongNote"):
        body = re.search(r"function " + fn + r"\b.*?\n}\n", html, re.S).group(0)
        assert "STORE.sa" not in body, fn + " must not touch sa"
    # --- 🧠 mnemonic notebook: embedded content == validated source content (numbers/terms checked against the bank)
    mm = re.search(r"/\*SA_MEMO_START\*/(.*?)/\*SA_MEMO_END\*/", html, re.S)
    assert mm, "SA memo block missing"
    memo = json.loads(mm.group(1))
    import sa_final
    import sa_memo_check
    import sa_memo_lib
    items2, clusters2, _ = sa_final.build()
    sa_memo_check.load_all()
    errs = sa_memo_lib.validate(items2, clusters2)
    assert not errs, "memo validation errors: " + "; ".join(errs[:5])
    assert sa_memo_lib.payload(items2, clusters2) == memo, "embedded memo differs from the validated source"
    assert len(memo["compares"]) == 14 and len(memo["cards"]) >= 100
    assert {k for c in memo["cards"] for k in c["ks"]} == {c["k"] for c in clusters}, "cards must cover every cluster"
    assert sum(len(c["ks"]) for c in memo["cards"]) == 307, "a cluster appears in more than one card"
    for c in memo["cards"]:
        for frag in [c["h"], *c["l"], c["t"]]:
            p = _Balance()
            p.feed(frag)
            assert not p.err and not p.stack and "<script" not in frag.lower(), frag[:50]
    for s in memo["compares"]:
        for frag in [s["h"], s["i"], *s["l"], *[r["lb"] + r["v"] + r["n"] for r in s["r"]]]:
            p = _Balance()
            p.feed(frag)
            assert not p.err and not p.stack, frag[:50]
    for token in ("data-screen=\"sa-memo\"", 'id="screen-sa-memo"', "function saRenderMemo", "function saMemoBox", "function saFlashNext", "if(name==='sa-memo') saRenderMemo();"):
        assert token in html, "missing: " + token
    assert len(html.encode("utf-8")) < 2_000_000
    print("  SA: 447 occurrences -> 307 clusters; text identical to markdown; markup balanced; cluster/isolation/wiring checks passed")
