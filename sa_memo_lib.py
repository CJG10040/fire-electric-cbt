"""Registry + validation for the 암기법 content (cards and number-comparison sets).

Every number-with-unit and every decimal / ≥10 number that appears in a mnemonic must also occur in the
source question/answer text of the cluster(s) it is attached to, and each card's `must` tokens must be found
there too. So mnemonics can never silently drift away from the 정리본 data.
"""
from __future__ import annotations
import html
import re
import unicodedata

CARDS: list[dict] = []
COMPARES: list[dict] = []


def card(refs, hook, lines, trap=None, must=(), ok_nums=()):
    CARDS.append(dict(refs=[refs] if isinstance(refs, str) else list(refs), hook=hook, lines=list(lines), trap=trap,
                      must=list(must), ok_nums=list(ok_nums)))


def compare(cid, title, hook, intro, rows, lines=(), ok_nums=()):
    """rows: (label, value, ref(s), must-tokens, note)"""
    COMPARES.append(dict(id=cid, title=title, hook=hook, intro=intro, lines=list(lines), ok_nums=list(ok_nums),
                         rows=[dict(label=r[0], value=r[1], refs=[r[2]] if isinstance(r[2], str) else list(r[2]),
                                    must=list(r[3]), note=(r[4] if len(r) > 4 else "")) for r in rows]))


# ---------------------------------------------------------------- text helpers
def squash(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)  # unify OHM SIGN / ㎏ / fullwidth variants before matching
    return re.sub(r"[\s,]+", "", s)


def strip_markup(s: str) -> str:
    return re.sub(r"\*\*|\{\{|\}\}", "", s)


def to_html(s: str) -> str:
    t = html.escape(s, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"\{\{(.+?)\}\}", r'<mark class="sa-mk">\1</mark>', t)
    return t


UNITS = r"(?:m²|㎡|m|cm|mm|kVA|MΩ|Ω|V|A|W|분|초|dB|lx|mA|Ah|Hz|℃|°|%|층|회|개월|시간|배|가닥)"
NUM = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)(?![\w]*\d)")


def numbers_needing_source(text: str, years: set[str] | None = None) -> set[str]:
    """Numbers that must be backed by the data: decimals, >= 10, or any number directly followed by a unit.
    A number followed by '년' is an exam year and is checked against the years of the attached clusters."""
    plain = re.sub(r"\s+", "", strip_markup(text))
    plain = re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", plain)  # thousands separators only
    need = set()
    for m in re.finditer(r"(\d+(?:\.\d+)?)", plain):
        v = m.group(1)
        tail = plain[m.end():m.end() + 3]
        if tail.startswith("년") and re.fullmatch(r"20\d\d", v):
            if years is not None and v not in years:
                need.add("YEAR:" + v)
            continue
        if "." in v or int(v) >= 10 or re.match(UNITS, tail):
            need.add(v)
    return need


def years_for(refs, cl_by_key, occ_by_id) -> set[str]:
    return {occ_by_id[o]["y"] for k in refs if k in cl_by_key for o in cl_by_key[k]["m"]}


def pool_for(refs, cl_by_key, occ_by_id) -> str:
    parts = []
    for k in refs:
        for oid in cl_by_key[k]["m"]:
            o = occ_by_id[oid]
            parts.append(o["qt"] + " " + o["at"])
    return squash(" ".join(parts))


def validate(items, clusters) -> list[str]:
    cl_by_key = {c["k"]: c for c in clusters}
    occ_by_id = {i["id"]: i for i in items}
    errs: list[str] = []
    seen_card_refs: dict[str, int] = {}

    def check(where, refs, texts, musts, ok_nums):
        for k in refs:
            if k not in cl_by_key:
                errs.append(f"{where}: unknown cluster {k}")
                return
        pool = pool_for(refs, cl_by_key, occ_by_id)
        years = years_for(refs, cl_by_key, occ_by_id)
        for tok in musts:
            if squash(tok) not in pool:
                errs.append(f"{where}: must-token not in source: {tok!r}")
        for t in texts:
            for v in numbers_needing_source(t, years):
                if v in ok_nums:
                    continue
                if v.startswith("YEAR:"):
                    errs.append(f"{where}: year {v[5:]} is not an exam year of these questions ({t[:40]!r})")
                elif v not in pool:
                    errs.append(f"{where}: number {v} not found in source ({t[:40]!r})")

    for c in CARDS:
        where = "card " + "/".join(c["refs"])
        for k in c["refs"]:
            seen_card_refs[k] = seen_card_refs.get(k, 0) + 1
        texts = [c["hook"], *c["lines"]] + ([c["trap"]] if c["trap"] else [])
        check(where, c["refs"], texts, c["must"], c["ok_nums"])
        if not c["must"]:
            errs.append(where + ": needs at least one must-token")
        if len(c["hook"]) > 70:
            errs.append(where + ": hook too long")
    for k, n in seen_card_refs.items():
        if n > 1:
            errs.append(f"cluster {k} has {n} cards (merge them)")
    ids = set()
    for s in COMPARES:
        if s["id"] in ids:
            errs.append("duplicate compare id " + s["id"])
        ids.add(s["id"])
        for r in s["rows"]:
            where = f"compare {s['id']} row {r['label']}"
            check(where, r["refs"], [r["value"], r["note"]], r["must"], s["ok_nums"])
            if not r["must"]:
                errs.append(where + ": needs a must-token")
        # the set-level text may only reuse numbers present in its own rows' sources
        refs = sorted({k for r in s["rows"] for k in r["refs"]})
        pool_ok = [k for k in refs if k in cl_by_key]
        if pool_ok:
            pool = pool_for(pool_ok, cl_by_key, occ_by_id)
            years = years_for(pool_ok, cl_by_key, occ_by_id)
            for t in [s["hook"], s["intro"], *s["lines"]]:
                for v in numbers_needing_source(t, years):
                    if v in s["ok_nums"]:
                        continue
                    if v.startswith("YEAR:"):
                        errs.append(f"compare {s['id']}: year {v[5:]} not an exam year of the rows ({t[:40]!r})")
                    elif v not in pool:
                        errs.append(f"compare {s['id']}: number {v} in set text not in any row source ({t[:40]!r})")
    return errs


def payload(items, clusters) -> dict:
    """Compact JSON for the app: one entry per card (ks = every cluster it explains) and per compare set."""
    cards = [dict(ks=list(c["refs"]), h=to_html(c["hook"]), l=[to_html(x) for x in c["lines"]],
                  t=(to_html(c["trap"]) if c["trap"] else "")) for c in CARDS]
    comps = []
    for s in COMPARES:
        comps.append(dict(id=s["id"], t=s["title"], h=to_html(s["hook"]), i=to_html(s["intro"]), l=[to_html(x) for x in s["lines"]],
                          r=[dict(lb=to_html(r["label"]), v=to_html(r["value"]), n=to_html(r["note"]), ks=list(r["refs"])) for r in s["rows"]]))
    return dict(cards=cards, compares=comps)
