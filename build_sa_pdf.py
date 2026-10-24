#!/usr/bin/env python3
"""단답 암기노트 인쇄용 PDF 생성.

내용은 CBT 안에 들어가는 것과 동일한 sa_memo_* 모듈(빌드 시 정리본 정답과 자동 대조됨)에서 가져온다.
산출물
  - 소방설비산업기사_단답암기노트_인쇄용.pdf          표지 · 시험 직전 훅 요약 · 숫자 비교표 14 · 암기법 카드 145장(주제별)
  - 소방설비산업기사_숫자비교_연습지_인쇄용.pdf      정답 칸을 비운 비교표(손으로 써 보는 연습지)

폰트: Noto Sans CJK KR(Regular/Bold) 을 사용 글자만 서브셋 → TrueType 변환 후 reportlab 에 등록(CFF 직접 등록 불가).
사용: python3 build_sa_pdf.py [--outdir DIR]
"""
from __future__ import annotations
import argparse
import html as htmllib
import io
import pickle
import re
import sys
from datetime import date
from pathlib import Path

from fontTools import subset
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTCollection, TTFont, newTable
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLTTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, NextPageTemplate, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

import sa_final
import sa_memo_check
import sa_memo_lib

FONT_DIR = Path("/usr/share/fonts/noto")
NAVY = colors.HexColor("#1f3a5f")
FIRE = colors.HexColor("#c0392b")
GRAY = colors.HexColor("#4d5a66")
LINE = colors.HexColor("#b8c2cc")
ZEBRA = colors.HexColor("#f3f5f7")
MARK = "#ffe58a"


# ---------------------------------------------------------------- data
def load_data():
    items, clusters, _ = pickle.load(open("sa_final.pkl", "rb"))
    sa_memo_check.load_all()
    errs = sa_memo_lib.validate(items, clusters)
    if errs:
        sys.exit("memo validation failed:\n" + "\n".join(errs[:10]))
    memo = sa_memo_lib.payload(items, clusters)
    by_id = {i["id"]: i for i in items}
    cl = {c["k"]: c for c in clusters}
    return items, clusters, memo, by_id, cl


# ---------------------------------------------------------------- fonts
def _kr_font(path: Path) -> TTFont:
    for f in TTCollection(str(path)).fonts:
        names = " ".join(n.toUnicode() for n in f["name"].names if n.nameID in (1, 4))
        if " KR" in names:
            return f
    raise RuntimeError("KR face not found in " + str(path))


def _otf_to_ttf(font: TTFont) -> None:
    order = font.getGlyphOrder()
    gs = font.getGlyphSet()
    quad = {}
    for name in order:
        pen = TTGlyphPen(gs)
        gs[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        quad[name] = pen.glyph()
    font["loca"] = newTable("loca")
    font["glyf"] = glyf = newTable("glyf")
    glyf.glyphOrder = order
    glyf.glyphs = quad
    del font["CFF "]
    if "VORG" in font:
        del font["VORG"]
    glyf.compile(font)
    hmtx = font["hmtx"]
    for name, g in glyf.glyphs.items():
        if hasattr(g, "xMin"):
            hmtx[name] = (hmtx[name][0], g.xMin)
    font["maxp"] = maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    maxp.maxTwilightPoints = maxp.maxStorage = maxp.maxFunctionDefs = maxp.maxInstructionDefs = 0
    maxp.maxStackElements = maxp.maxSizeOfInstructions = 0
    maxp.maxComponentElements = max((len(getattr(g, "components", []) or []) for g in glyf.glyphs.values()), default=0)
    maxp.compile(font)
    post = font["post"]
    post.formatType = 2.0
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = order
    font.sfntVersion = "\000\001\000\000"


def make_ttf(ttc: Path, chars: set[str]) -> bytes:
    font = _kr_font(ttc)
    opts = subset.Options()
    opts.layout_features = []
    opts.glyph_names = False
    opts.notdef_outline = True
    opts.name_IDs = [1, 2, 4, 6]
    opts.hinting = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    _otf_to_ttf(font)
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


class Fonts:
    """Cleans text so every character exists in the font, then registers subset TTFs."""

    def __init__(self):
        self.cmap = set(_kr_font(FONT_DIR / "NotoSansCJK-Regular.ttc").getBestCmap())
        self.dropped: dict[str, int] = {}

    SUBS = {"\ufe0f": "", "⚠": "※", "⏱": "", "⚡": "", "↔": "⇔", "₂": "2", "−": "-", "—": "-", "\u00a0": " "}

    def clean(self, s: str) -> str:
        out = []
        for ch in s:
            ch = self.SUBS.get(ch, ch)
            for c in ch:
                if c in "\n\t" or ord(c) in self.cmap:
                    out.append(c)
                else:
                    self.dropped[c] = self.dropped.get(c, 0) + 1
        return re.sub(r"[ ]{2,}", " ", "".join(out))

    def register(self, chars: set[str], outdir: Path):
        chars = {c for c in chars if ord(c) in self.cmap} | set(" ")
        for name, fn in (("NSK", "NotoSansCJK-Regular.ttc"), ("NSK-B", "NotoSansCJK-Bold.ttc")):
            data = make_ttf(FONT_DIR / fn, chars)
            pdfmetrics.registerFont(RLTTFont(name, io.BytesIO(data)))
        pdfmetrics.registerFontFamily("NSK", normal="NSK", bold="NSK-B", italic="NSK", boldItalic="NSK-B")


# ---------------------------------------------------------------- text helpers
def rl(fonts: Fonts, html: str) -> str:
    """CBT html fragment -> reportlab paragraph markup."""
    t = html.replace('<mark class="sa-mk">', f'<font backColor="{MARK}"><b>').replace("</mark>", "</b></font>")
    parts = re.split(r"(<[^>]+>)", t)
    out = []
    for p in parts:
        if p.startswith("<") and p.endswith(">"):
            out.append(p)
        else:
            out.append(htmllib.escape(fonts.clean(htmllib.unescape(p)), quote=False))
    return "".join(out)


def T(fonts: "Fonts", s: str) -> str:
    """Clean + escape a plain static/dynamic string for a Paragraph."""
    return htmllib.escape(fonts.clean(s).strip(), quote=False)


def plain(html: str) -> str:
    return htmllib.unescape(re.sub(r"<[^>]+>", "", html))


def styles():
    base = dict(fontName="NSK", textColor=colors.black, alignment=TA_LEFT)
    S = {}
    S["title"] = ParagraphStyle("title", fontName="NSK-B", fontSize=24, leading=32, textColor=NAVY, spaceAfter=6)
    S["sub"] = ParagraphStyle("sub", fontSize=11, leading=17, textColor=GRAY, **{k: v for k, v in base.items() if k != "textColor"})
    S["body"] = ParagraphStyle("body", fontSize=9.5, leading=15, **base)
    S["h1"] = ParagraphStyle("h1", fontName="NSK-B", fontSize=14, leading=19, textColor=NAVY, spaceBefore=2, spaceAfter=5)
    S["h2"] = ParagraphStyle("h2", fontName="NSK-B", fontSize=10.5, leading=14, textColor=colors.white, backColor=NAVY,
                             borderPadding=(2, 4, 2, 4), spaceBefore=4, spaceAfter=5)
    S["hook"] = ParagraphStyle("hook", fontName="NSK-B", fontSize=9.4, leading=13, textColor=NAVY, spaceAfter=1.5)
    S["line"] = ParagraphStyle("line", fontSize=7.9, leading=11, leftIndent=8, firstLineIndent=-8, textColor=colors.black, fontName="NSK")
    S["trap"] = ParagraphStyle("trap", fontSize=7.7, leading=10.6, textColor=FIRE, fontName="NSK", spaceBefore=1.5)
    S["meta"] = ParagraphStyle("meta", fontSize=6.8, leading=9, textColor=GRAY, fontName="NSK", spaceAfter=1.5)
    S["cell"] = ParagraphStyle("cell", fontSize=8.4, leading=11.5, fontName="NSK")
    S["cellb"] = ParagraphStyle("cellb", fontSize=8.6, leading=11.5, fontName="NSK-B", textColor=FIRE)
    S["cellh"] = ParagraphStyle("cellh", fontSize=8, leading=10.5, fontName="NSK-B", textColor=colors.white)
    S["note"] = ParagraphStyle("note", fontSize=7.4, leading=10.4, fontName="NSK", textColor=GRAY)
    S["tl"] = ParagraphStyle("tl", fontSize=8.2, leading=11.4, fontName="NSK", leftIndent=10, firstLineIndent=-10)
    S["hot"] = ParagraphStyle("hot", fontSize=9.2, leading=13.2, fontName="NSK", leftIndent=14, firstLineIndent=-14, spaceAfter=3.2)
    return S


# ---------------------------------------------------------------- document
class Doc(BaseDocTemplate):
    def __init__(self, path, title, **kw):
        super().__init__(str(path), pagesize=A4, leftMargin=11 * mm, rightMargin=11 * mm, topMargin=13 * mm,
                         bottomMargin=13 * mm, title=title, author="CBT 단답 암기노트", **kw)
        W, H = A4
        gw = W - self.leftMargin - self.rightMargin
        gh = H - self.topMargin - self.bottomMargin
        gap = 5 * mm
        cw = (gw - gap) / 2
        self.colw = cw
        self.fullw = gw
        one = Frame(self.leftMargin, self.bottomMargin, gw, gh, id="f1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        c1 = Frame(self.leftMargin, self.bottomMargin, cw, gh, id="c1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        c2 = Frame(self.leftMargin + cw + gap, self.bottomMargin, cw, gh, id="c2", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="one", frames=[one], onPage=self._footer),
                               PageTemplate(id="two", frames=[c1, c2], onPage=self._footer)])
        self._label = title

    def _footer(self, canv, doc):
        canv.saveState()
        canv.setFont("NSK", 7)
        canv.setFillColor(GRAY)
        canv.drawString(doc.leftMargin, 7 * mm, self._label)
        canv.drawRightString(A4[0] - doc.rightMargin, 7 * mm, f"{doc.page}")
        canv.restoreState()


def compare_table(S, fonts, s, width, blank=False):
    head = [Paragraph("항목", S["cellh"]), Paragraph("정답을 써 보세요" if blank else "정답 · 값", S["cellh"]), Paragraph("내 메모 · 틀린 이유" if blank else "메모", S["cellh"])]
    rows = [head]
    for r in s["r"]:
        val = Paragraph("&nbsp;", S["cell"]) if blank else Paragraph(rl(fonts, r["v"]), S["cellb"])
        note = Paragraph("&nbsp;", S["note"]) if blank else Paragraph(rl(fonts, r["n"]), S["note"])
        rows.append([Paragraph(rl(fonts, r["lb"]), S["cell"]), val, note])
    cw = [width * 0.33, width * 0.42, width * 0.25]
    t = Table(rows, colWidths=cw, repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE), ("BOX", (0, 0), (-1, -1), 0.6, NAVY),
          ("TOPPADDING", (0, 0), (-1, -1), 2.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
          ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    for i in range(2, len(rows), 2):
        st.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    if blank:
        for i in range(1, len(rows)):
            st.append(("TOPPADDING", (0, i), (-1, i), 10.5))
            st.append(("BOTTOMPADDING", (0, i), (-1, i), 10.5))
        st.append(("LINEAFTER", (0, 0), (1, -1), 0.4, LINE))   # ruled cells so the writing area is clear
    t.setStyle(TableStyle(st))
    return t


def compare_block(S, fonts, s, width, blank=False):
    title = fonts.clean(s["t"]).strip()
    hook = rl(fonts, s["h"])
    parts = [Paragraph(f"<b>{htmllib.escape(title, quote=False)}</b>", S["h2"]),
             Paragraph(rl(fonts, s["i"]) + f' &nbsp;<font color="#a06a00"><b>{hook}</b></font>', S["note"]) if not blank else Spacer(1, 0),
             Spacer(1, 2), compare_table(S, fonts, s, width, blank)]
    if s["l"] and not blank:
        parts.append(Spacer(1, 2))
        parts += [Paragraph("▶ " + rl(fonts, x), S["tl"]) for x in s["l"]]
    parts.append(Spacer(1, 7))
    return KeepTogether(parts)


def card_flowable(S, fonts, c, meta, width):
    head = Paragraph(meta, S["meta"])
    hook = Paragraph(rl(fonts, c["h"]), S["hook"])
    lines = [Paragraph("• " + rl(fonts, x), S["line"]) for x in c["l"]]
    trap = [Paragraph("※ " + rl(fonts, c["t"]), S["trap"])] if c["t"] else []
    inner = [[head], [hook]] + [[p] for p in lines] + [[p] for p in trap]
    t = Table(inner, colWidths=[width])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("LINEBEFORE", (0, 0), (0, -1), 2.2, FIRE),
                           ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                           ("TOPPADDING", (0, 0), (-1, -1), 0.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.6),
                           ("TOPPADDING", (0, 0), (-1, 0), 3), ("BOTTOMPADDING", (0, -1), (-1, -1), 3.5)]))
    return [t, Spacer(1, 4)]


def card_meta(fonts, c, by_id, cl):
    n = sum(len(cl[k]["m"]) for k in c["ks"])
    years = sorted({by_id[m]["y"] for k in c["ks"] for m in cl[k]["m"]}, reverse=True)
    rep = by_id[cl[c["ks"][0]]["rep"]]["t"]
    kind = f"관련 출제 {n}회 · 문제 {len(c['ks'])}개" if len(c["ks"]) > 1 else f"출제 {n}회"
    ys = "·".join(str(y) for y in years)
    extra = f" 외 {len(c['ks']) - 1}문제" if len(c["ks"]) > 1 else ""
    return htmllib.escape(fonts.clean(f"{kind} ({ys}) │ {rep}{extra}"), quote=False)


def build(outdir: Path):
    items, clusters, memo, by_id, cl = load_data()
    fonts = Fonts()
    cards, comps = memo["cards"], memo["compares"]
    weight = lambda c: sum(len(cl[k]["m"]) for k in c["ks"])
    topic = lambda c: cl[c["ks"][0]]["tp"]
    topics = sa_final.TOPIC_ORDER

    # ---- characters used -> subset fonts
    all_text = []
    for c in cards:
        all_text += [plain(c["h"]), *map(plain, c["l"]), plain(c["t"]), *(by_id[cl[c["ks"][0]]["rep"]]["t"] for _ in [0])]
    for s in comps:
        all_text += [s["t"], plain(s["h"]), plain(s["i"]), *map(plain, s["l"])]
        for r in s["r"]:
            all_text += [plain(r["lb"]), plain(r["v"]), plain(r["n"])]
    all_text += list(topics) + [by_id[m]["t"] for c in clusters for m in [c["rep"]]]
    all_text.append(Path(__file__).read_text(encoding="utf-8"))
    all_text.append("0123456789 .,:;()[]/·~-+%<>=*&'\"!?")
    chars = set(fonts.clean("".join(all_text))) | set(Path(__file__).read_text(encoding="utf-8"))
    fonts.register(chars, outdir)
    S = styles()

    today = date.today().isoformat()
    n_occ = sum(len(c["m"]) for c in clusters)
    disclaimer = ("※ 정답·숫자는 <b>단답·서술 정리본(영상 요약본) 정답과 자동 대조</b>한 것이며, 두음·이야기는 제가 만든 암기 보조일 뿐 법령 문구가 아닙니다. "
                  "화재안전기준은 개정되므로 시험 직전 최신 기준(NFTC)을 한 번 더 확인하세요.")

    def front(story):
        story += [Spacer(1, 40 * mm), Paragraph("소방설비산업기사 전기 실기", S["sub"]),
                  Paragraph("단답·서술 암기노트", S["title"]),
                  Paragraph("헷갈리는 숫자·비슷한 개념을 암기법으로 잡는 인쇄용 요약", S["sub"]), Spacer(1, 12 * mm)]
        info = [["구성", f"① 시험 직전 훅 요약  ② 숫자 비교표 {len(comps)}세트  ③ 암기법 카드 {len(cards)}장(주제별, 많이 출제된 순)"],
                ["범위", f"단답·서술 정리본 {n_occ}문항 → 중복 묶음 {len(clusters)}문항을 카드 {len(cards)}장이 모두 포함"],
                ["보는 법", "1) 비교표로 숫자를 한 번에  2) 카드의 굵은 글씨·형광펜(두음)부터  3) ※ 함정 문장 확인  4) 연습지로 정답을 가리고 써 보기"],
                ["작성일", today]]
        t = Table([[Paragraph(f"<b>{a}</b>", S["cell"]), Paragraph(rl(fonts, b), S["cell"])] for a, b in info], colWidths=[22 * mm, 150 * mm], hAlign="LEFT")
        t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        story += [t, Spacer(1, 10 * mm), Paragraph(rl(fonts, disclaimer), S["note"])]

    # ================= main PDF
    main = outdir / "소방설비산업기사_단답암기노트_인쇄용.pdf"
    doc = Doc(main, "소방설비산업기사 전기 실기 · 단답·서술 암기노트")
    story = []
    front(story)
    story += [NextPageTemplate("one"), PageBreak()]

    # ---- 1. 훅 요약 (출제 3회 이상)
    hot = sorted([c for c in cards if weight(c) >= 3], key=lambda c: (-weight(c), topic(c)))
    story.append(Paragraph(f"① 시험 직전 훅 요약 — 출제 3회 이상 {len(hot)}장", S["h1"]))
    story.append(Paragraph("한 줄 훅만 모았습니다. 막히는 줄은 ③ 카드에서 자세히 확인하세요. (괄호 = 관련 출제 횟수)", S["note"]))
    story.append(Spacer(1, 3))
    rows = [Paragraph(f'<font color="#4d5a66">[{weight(c)}]</font> ' + rl(fonts, c["h"]), S["hot"]) for c in hot]
    # balance the two columns by estimated height (long hooks wrap to two lines)
    est = [1 + len(plain(c["h"])) // 34 for c in hot]
    acc, cut = 0, len(rows)
    for i, e in enumerate(est):
        acc += e
        if acc >= sum(est) / 2:
            cut = i + 1
            break
    hk = Table([[rows[:cut], rows[cut:]]], colWidths=[doc.colw + 2.5 * mm, doc.colw + 2.5 * mm], hAlign="LEFT")
    hk.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 8),
                            ("RIGHTPADDING", (1, 0), (1, 0), 0), ("LINEAFTER", (0, 0), (0, 0), 0.4, LINE)]))
    story += [hk, PageBreak()]

    # ---- 2. 비교표
    story.append(Paragraph(f"② 숫자 비교표 {len(comps)}세트", S["h1"]))
    story.append(Paragraph("같은 숫자가 여러 곳에 나오거나 이름이 비슷한 항목을 한 장씩 묶었습니다. 행의 값을 손으로 가리고 맞춰 보세요.", S["note"]))
    story.append(Spacer(1, 4))
    for s in comps:
        story.append(compare_block(S, fonts, s, doc.fullw))
    story += [NextPageTemplate("two"), PageBreak()]

    # ---- 3. 카드
    story.append(Paragraph(f"③ 암기법 카드 {len(cards)}장 — 주제별 · 많이 출제된 순", S["h1"]))
    story.append(Paragraph("굵은 형광 글자 = 두음/핵심어, ※ = 헷갈리기 쉬운 함정. 표시 연도는 정리본 기준입니다.", S["note"]))
    story.append(Spacer(1, 3))
    for ti, tname in enumerate(topics):
        tc = sorted([c for c in cards if topic(c) == ti], key=lambda c: (-weight(c), c["ks"][0]))
        if not tc:
            continue
        head = Paragraph(f"{htmllib.escape(fonts.clean(tname), quote=False)} ({len(tc)}장)", S["h2"])
        for j, c in enumerate(tc):
            fl = card_flowable(S, fonts, c, card_meta(fonts, c, by_id, cl), doc.colw)
            story.append(KeepTogether(([head] if j == 0 else []) + fl))
    doc.build(story)

    # ================= practice PDF
    prac = outdir / "소방설비산업기사_숫자비교_연습지_인쇄용.pdf"
    d2 = Doc(prac, "소방설비산업기사 · 숫자 비교 연습지")
    st2 = [Paragraph("숫자 비교 연습지", S["title"]),
           Paragraph("정답 칸을 비워 둔 비교표입니다. 손으로 써 본 뒤 「단답 암기노트」 ② 비교표와 맞춰 보세요. 틀린 줄에 형광펜을 칠해 두면 복습이 빨라집니다.", S["sub"]),
           Spacer(1, 6 * mm)]
    for s in comps:
        st2.append(compare_block(S, fonts, s, d2.fullw, blank=True))
    d2.build(st2)

    if fonts.dropped:
        print("dropped chars (not in font):", {k: v for k, v in fonts.dropped.items()})
    return main, prac, len(hot), len(cards), len(comps)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default=".")
    a = ap.parse_args()
    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    m, p, nh, nc, ncmp = build(out)
    print("built:", m, p, f"(hot hooks {nh}, cards {nc}, compares {ncmp})")
