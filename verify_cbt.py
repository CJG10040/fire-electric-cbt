from __future__ import annotations
import json, re, subprocess, sys, tempfile
from collections import defaultdict
from pathlib import Path

root = Path("cbt_v2")
html = (root / "cbt.html").read_text(encoding="utf-8")
EXPECT_SA = "--sa" in sys.argv  # enable 단답·서술 mode checks

# 1. self-contained offline structure
assert html.count("</html>") == 1 and html.count("</body>") == 1 and html.count("</script>") == 1, "duplicated/trailing markup (corrupted tail?)"
assert html.endswith("</body>\n</html>\n"), "unexpected file tail"
script_tags = re.findall(r"<script\b([^>]*)>([\s\S]*?)</script>", html, re.I)
assert len(script_tags) == 1, f"expected one inline app script, found {len(script_tags)}"
assert not re.search(r"\bsrc\s*=", script_tags[0][0], re.I), "external script dependency found"
assert not re.search(r"<link\b[^>]*\brel=[\"']stylesheet", html, re.I), "stylesheet dependency found"
offline_html = re.sub(r'\n/\*CLOUD_SYNC_START\*/.*?/\*CLOUD_SYNC_END\*/\n', '', html, flags=re.S)
assert not re.search(r"\bfetch\s*\(", offline_html), "offline core fetch dependency found"
assert not re.search(r"https?://[^\"'\s)]*\.(js|css)\b", html), "remote js/css reference found"
assert "external_ai_drafts.js" not in html and "CBT_EXTERNAL_AI_DRAFTS" not in html, "workbook drafts leaked in"
with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".js", delete=False, dir=".") as tmp:
    tmp.write(script_tags[0][1])
    tmp_path = Path(tmp.name)
try:
    chk = subprocess.run(["node", "--check", str(tmp_path)], text=True, capture_output=True)
    if chk.returncode:
        raise SystemExit(chk.stderr or chk.stdout)
finally:
    tmp_path.unlink(missing_ok=True)

# 2. question bank / images
m = re.search(r"const DB\s*=\s*(\[\s*\{.*?\}\s*\]);", html, re.S)
db = json.loads(m.group(1))
assert len(db) == 493, len(db)
ids = [q["id"] for q in db]
assert len(ids) == len(set(ids))
missing = [(q["id"], f, q[f]) for q in db for f in ("qi", "ai") if q.get(f) and not (root / q[f]).is_file()]
assert not missing, missing[:5]
assert sum(bool(q.get("qi")) + bool(q.get("ai")) for q in db) == 986
pts = defaultdict(int)
for q in db:
    pts[q["ei"]] += q["p"]
assert len(pts) == 29 and set(pts.values()) == {100}
pinned = {
    "2025_2_01": ("crops/2025_2/q01.jpg", "crops/2025_2/a01.jpg"),
    "2025_2_02": ("crops/2025_2/q02.jpg", "crops/2025_2/a02.jpg"),
    "2025_2_14": ("crops/2025_2/q14.jpg", "crops/2025_2/a14.jpg"),
    "2025_2_15": ("crops/2025_2/q15.jpg", "crops/2025_2/a15.jpg"),
    "2024_2_05": ("crops/2024_2/q05.jpg", "crops/2024_2/a05.jpg"),
    "2024_2_06": ("crops/2024_2/q06.jpg", "crops/2024_2/a06.jpg"),
    "2016_1_06": ("crops/2016_1/q06.jpg", "crops/2016_1/a06.jpg"),
    "2016_1_08": ("crops/2016_1/q08.jpg", "crops/2016_1/a08.jpg"),
    "2016_1_12": ("crops/2016_1/q12.jpg", "crops/2016_1/a12.jpg"),
}
by_id = {q["id"]: q for q in db}
for qid, pair in pinned.items():
    assert (by_id[qid]["qi"], by_id[qid]["ai"]) == pair, f"image pair remapped: {qid}"

# 3. explanations (379 verified): parse the STUDY_EXPLANATIONS key set
expl = re.findall(r'^  "(\d{4}_\d_\d{2})": \{', html, re.M)
assert len(expl) == 379 and len(set(expl)) == 379, len(expl)
assert set(expl) <= set(ids)
assert "2016_1_06" in expl
for token in ('id="exam-time-limit"', 'id="quiz-timer-wrap"', "function startQuizTimer", "function gradeQ", "function formatPoints"):
    assert token in html, token

# 4. progress data untouched
private_baseline=Path('extracted/orig_cbt_data.json')
expected_progress=(private_baseline.read_bytes() if private_baseline.exists() else subprocess.check_output(['git','show','f70eee508e9f53d689e76e37c9b1e4e7fb0cb289:cbt_v2/cbt_data.json']))
assert (root / 'cbt_data.json').read_bytes()==expected_progress, 'progress fixture changed'

if EXPECT_SA:
    import verify_sa
    verify_sa.run(html, root)
print("PASS: structure; 493 questions; 29x100-point exams; 986 images; 379 explanations; offline; progress data preserved" + ("; SA mode" if EXPECT_SA else ""))
