"""Parse the 단답·서술 markdown into structured occurrences (one per ### item)."""
from __future__ import annotations
import html as _html
import json
import re
from pathlib import Path

MD_PATH = Path("소방설비산업기사 전기편 실기 기출 문제 및 정답 정리.md")

# ---------------------------------------------------------------- LaTeX -> Unicode
_SUP = {"2": "²", "3": "³"}


def latex_to_text(expr: str) -> str:
    s = expr
    s = re.sub(r"\\text\{([^}]*)\}", r"\1", s)
    s = s.replace("\\Omega", "Ω").replace("\\mu", "μ").replace("\\%", "%")
    s = re.sub(r"\^\{?([23])\}?", lambda m: _SUP[m.group(1)], s)
    s = s.replace("\\,", " ").replace("\\ ", " ")
    s = re.sub(r"\s+", " ", s).strip()
    if "\\" in s or "{" in s or "}" in s:
        raise ValueError("unconverted LaTeX: " + expr)
    return s


def fix_math(text: str) -> str:
    return re.sub(r"\$([^$]+)\$", lambda m: latex_to_text(m.group(1)), text)


# ---------------------------------------------------------------- inline / block render
def inline_html(text: str) -> str:
    t = _html.escape(fix_math(text), quote=False)
    t = re.sub(r"`([^`]+)`", r'<span class="sa-code">\1</span>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])", r"<i>\1</i>", t)
    return t


def inline_plain(text: str) -> str:
    t = fix_math(text)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])", r"\1", t)
    return t


LIST_RE = re.compile(r"^(\s*)([*\-]|\d+\.)\s+(.*)$")


def render_block(lines: list[str]) -> tuple[str, str]:
    """Render markdown-ish lines to (html, plain). Supports nested lists, blockquotes, paragraphs."""
    html_parts: list[str] = []
    plain_parts: list[str] = []
    stack: list[tuple[int, str]] = []  # (indent, tag)

    def close_to(indent: int):
        while stack and stack[-1][0] >= indent:
            html_parts.append(f"</li></{stack.pop()[1]}>")

    quote: list[str] = []

    def flush_quote():
        nonlocal quote
        if quote:
            html_parts.append('<div class="sa-quote">' + "<br>".join(inline_html(x) for x in quote) + "</div>")
            plain_parts.extend(inline_plain(x) for x in quote)
            quote = []

    for raw in lines:
        if not raw.strip():
            continue
        qm = re.match(r"^(\s*)>\s?(.*)$", raw)
        if qm:
            close_to(0)
            quote.append(qm.group(2))
            continue
        flush_quote()
        lm = LIST_RE.match(raw)
        if lm:
            indent = len(lm.group(1))
            tag = "ol" if lm.group(2)[0].isdigit() else "ul"
            body = lm.group(3)
            if stack and indent > stack[-1][0]:
                html_parts.append(f"<{tag} class=\"sa-l\"><li>")
                stack.append((indent, tag))
            else:
                while stack and stack[-1][0] > indent:
                    html_parts.append(f"</li></{stack.pop()[1]}>")
                if stack and stack[-1][0] == indent and stack[-1][1] == tag:
                    html_parts.append("</li><li>")
                else:
                    close_to(indent)
                    html_parts.append(f"<{tag} class=\"sa-l\"><li>")
                    stack.append((indent, tag))
            num = lm.group(2) if lm.group(2)[0].isdigit() else ""
            if num:
                # keep the original number visible (answers often cite 1./2./3.)
                html_parts.append(f'<span class="sa-no">{num}</span> ')
            html_parts.append(inline_html(body))
            plain_parts.append((num + " " if num else "") + inline_plain(body))
        else:
            close_to(0)
            html_parts.append('<p class="sa-p">' + inline_html(raw.strip()) + "</p>")
            plain_parts.append(inline_plain(raw.strip()))
    flush_quote()
    close_to(0)
    return "".join(html_parts), "\n".join(plain_parts)


def split_item_body(body: list[str]) -> tuple[list[str], list[str]]:
    """Return (question_lines, answer_lines) with the leading '* **문제:**' / '* **정답:**' marker content kept."""
    q_idx = a_idx = None
    for i, l in enumerate(body):
        if re.match(r"^\*\s+\*\*문제:\*\*", l) and q_idx is None:
            q_idx = i
        elif re.match(r"^\*\s+\*\*정답:\*\*", l) and a_idx is None:
            a_idx = i
    if q_idx is None or a_idx is None or a_idx < q_idx:
        raise ValueError("missing 문제/정답 marker")

    def clean(seg: list[str], marker: str) -> list[str]:
        out = []
        first = re.sub(r"^\*\s+\*\*" + marker + r":\*\*\s*", "", seg[0])
        if first.strip():
            out.append(first.strip())
        for l in seg[1:]:
            if l.strip() == "---":
                continue
            out.append(l[2:] if l.startswith("  ") else l)
        return out

    q = clean(body[q_idx:a_idx], "문제")
    a = clean(body[a_idx:], "정답")
    return q, a


def parse(md_path: Path = MD_PATH) -> tuple[list[dict], dict]:
    lines = md_path.read_text(encoding="utf-8").split("\n")
    items: list[dict] = []
    sources: dict[str, str] = {}
    declared: dict[str, int] = {}
    year = rnd = None
    for l in lines:
        m = re.match(r"^# .*?\((\d{4})년\s*(?:(\d)회\s*)?기출\)", l)
        if m:
            year, rnd = m.group(1), m.group(2) or ""
            continue
        m = re.match(r"^\*\s+\*\*출처 영상:\*\*\s*\[(.*?)\]\((.*?)\)", l)
        if m:
            sources[f"{year}_{rnd or 0}"] = m.group(2)
            continue
        m = re.match(r"^\*\s+\*\*문항 수:\*\*\s*총\s*(\d+)문항", l)
        if m:
            declared[f"{year}_{rnd or 0}"] = int(m.group(1))
            continue
        m = re.match(r"^### (\d+)\.\s*(.*?)\s*`\((\d+):(\d+)(?::(\d+))?\)`\s*$", l)
        if m:
            h, mi, se = (int(m.group(3)), int(m.group(4)), int(m.group(5))) if m.group(5) else (0, int(m.group(3)), int(m.group(4)))
            items.append({"y": year, "r": rnd, "n": int(m.group(1)), "t": m.group(2).strip(), "sec": h * 3600 + mi * 60 + se, "body": []})
            continue
        if l.startswith("### "):
            raise ValueError("unparsed item header: " + l)
        if items and not l.startswith("# "):
            items[-1]["body"].append(l)

    for it in items:
        key = f"{it['y']}_{it['r'] or 0}"
        it["id"] = f"m{it['y']}_{it['r'] or 0}_{it['n']:02d}"
        it["key"] = key
        q_lines, a_lines = split_item_body(it.pop("body"))
        it["qh"], it["qt"] = render_block(q_lines)
        it["ah"], it["at"] = render_block(a_lines)
        pm = re.search(r"아래(?: 항목)? 중\s*(\d+)\s*가지", it["at"])
        it["pick"] = int(pm.group(1)) if pm else 0
        blank = bool(re.search(r"\(\s*[①-⑩㉠-㉩가-하]\s*\)|\(\s{2,}\)|\([가-하]\)", it["qt"])) or "빈칸" in it["t"]
        if blank:
            it["kind"] = "빈칸"
        elif it["pick"]:
            it["kind"] = "택일"
        elif len(re.sub(r"\s+", "", it["at"])) <= 45:
            it["kind"] = "단답"
        else:
            it["kind"] = "서술"
    # consistency with declared counts
    counts: dict[str, int] = {}
    for it in items:
        counts[it["key"]] = counts.get(it["key"], 0) + 1
    return items, {"sources": sources, "declared": declared, "counts": counts}


if __name__ == "__main__":
    items, meta = parse()
    print(len(items), "items")
    mismatch = {k: (v, meta["declared"].get(k)) for k, v in meta["counts"].items() if meta["declared"].get(k) != v}
    print("count mismatches vs declared:", mismatch)
    print("sources:", len(meta["sources"]), "declared blocks:", len(meta["declared"]))
    from collections import Counter
    print(Counter(i["kind"] for i in items))
    for k in ("m2024_3_0" + "2", "m2024_1_06"):
        it = next(i for i in items if i["id"] == k)
        print(k, it["t"], "|", it["kind"], it["pick"]); print(it["qh"][:600]); print(it["ah"][:400])
    assert not any("$" in i["qt"] + i["at"] + i["qh"] + i["ah"] for i in items)
    assert not any("\\" in i["qt"] + i["at"] for i in items)
    json.dump(items, open("sa_items.json", "w", encoding="utf-8"), ensure_ascii=False)
