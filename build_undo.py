#!/usr/bin/env python3
"""cbt_v2/cbt.html 의 UNDO 마커 구간(CSS · 헤더 버튼 · 위젯 · JS)을 undo_src/ 내용으로 채운다(멱등)."""
import re
import sys
from pathlib import Path

target = Path(sys.argv[1] if len(sys.argv) > 1 else "cbt_v2/cbt.html")
html = target.read_text(encoding="utf-8")
src = Path("undo_src")

def fill(text, start, end, body):
    pat = re.compile(re.escape(start) + r"[\s\S]*?" + re.escape(end))
    assert len(pat.findall(text)) == 1, f"marker pair not found exactly once: {start}"
    return pat.sub(lambda m: start + body + end, text, count=1)

js = (src / "undo.js").read_text(encoding="utf-8")
assert "</script" not in js.lower() and "<!--" not in js
html = fill(html, "/*UNDO_CSS_START*/", "/*UNDO_CSS_END*/", (src / "undo.css").read_text(encoding="utf-8"))
# 이전 버전(헤더 버튼)의 흔적 제거: 버튼은 이제 화면 왼쪽 아래 위젯 블록에 들어 있다
html = re.sub(r"[ \t]*<!--UNDO_HEADER_START-->[\s\S]*?<!--UNDO_HEADER_END-->\n?", "", html)
assert "UNDO_HEADER" not in html
html = fill(html, "<!--UNDO_WIDGETS_START-->", "<!--UNDO_WIDGETS_END-->", "\n" + (src / "undo_widgets.html").read_text(encoding="utf-8"))
html = fill(html, "/*UNDO_JS_START*/", "/*UNDO_JS_END*/", js)
target.write_text(html, encoding="utf-8")
print(f"built undo into {target}: {len(html.encode('utf-8')):,} bytes")
