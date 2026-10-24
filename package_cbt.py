"""Package cbt_v2 into the offline ZIP, split it below the 30 MB download limit and verify everything."""
import hashlib
import json
import re
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

SOURCE = Path("cbt_v2")
ARCHIVE = Path("소방설비산업기사_전기_실기_CBT_단답서술_암기노트_오프라인.zip")
PART_BYTES = 27_500_000
ORIG_DATA = Path("extracted/orig_cbt_data.json")

with ZipFile(ARCHIVE, "w", compression=ZIP_DEFLATED, compresslevel=4) as zf:
    for path in sorted(SOURCE.rglob("*")):
        if path.is_file():
            zf.write(path, arcname=path.relative_to(SOURCE).as_posix())

payload = ARCHIVE.read_bytes()
for old in list(Path(".").glob(ARCHIVE.name + ".part*")):
    old.unlink()
parts = []
for i, start in enumerate(range(0, len(payload), PART_BYTES), 1):
    part = Path(f"{ARCHIVE.name}.part{i}")
    part.write_bytes(payload[start:start + PART_BYTES])
    parts.append(part)
assert len(parts) == 2, f"expected 2 parts, got {len(parts)}"
assert all(p.stat().st_size < 30_000_000 for p in parts)
reassembled = b"".join(p.read_bytes() for p in parts)
assert reassembled == payload and hashlib.sha256(reassembled).digest() == hashlib.sha256(payload).digest()

with ZipFile(BytesIO(reassembled)) as zf:
    assert zf.testzip() is None, "CRC failure in reassembled ZIP"
    names = set(zf.namelist())
    assert len(names) == 989, len(names)
    assert len([n for n in names if n.endswith(".jpg")]) == 986
    assert {"cbt.html", "cbt_data.json", "README.md", "crops/2016_1/q06.jpg", "crops/2016_1/a06.jpg"} <= names
    assert not any(n.endswith("external_ai_drafts.js") for n in names)
    assert zf.read("cbt_data.json") == SOURCE.joinpath("cbt_data.json").read_bytes() == ORIG_DATA.read_bytes(), "progress data changed"
    html = zf.read("cbt.html").decode("utf-8")
    assert html.count("</html>") == 1 and html.count("</script>") == 1 and html.endswith("</body>\n</html>\n")
    assert not re.search(r"<script\b[^>]*\bsrc\s*=", html, re.I) and "CBT_EXTERNAL_AI_DRAFTS" not in html
    assert len(re.findall(r'^  "(\d{4}_\d_\d{2})": \{', html, re.M)) == 379
    bank = json.loads(re.search(r"/\*SA_DATA_START\*/(.*?)/\*SA_DATA_END\*/", html, re.S).group(1))
    assert len(bank["occ"]) == 447 and len(bank["clusters"]) == 307
    for token in ("단답·서술 암기 모드", "cbt_sa_v1"):
        assert token in html or token in zf.read("README.md").decode("utf-8")

print(f"PASS: {ARCHIVE.name}: {len(names)} files, CRC OK, 379 explanations, 986 images, SA 447->307, progress data unchanged")
for p in parts:
    print(f"  {p.name}: {p.stat().st_size:,} bytes")
print("PASS: parts < 30 MB and byte-for-byte reassemble to the verified ZIP")
