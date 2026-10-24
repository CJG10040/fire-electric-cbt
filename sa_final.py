"""Build the final 단답·서술 bank: parse -> topics -> duplicate clusters (auto + reviewed overrides)."""
from __future__ import annotations
import collections
import json
import re

import sa_parse
from sa_cluster import TOPIC_ORDER, build_similarity, classify, cluster

TOPIC_ORDER = [t for t in TOPIC_ORDER]


def I(s: str) -> str:
    return "m" + s


# Reviewed merges: the asked intent and the answer core are the same across these occurrences.
FORCE_MERGE = [
    # 3선식 유도등 점멸기 설치 시 반드시 점등되어야 하는 경우 (answer list is the same 5-item list)
    ["2024_3_07", "2023_0_12", "2021_0_15", "2018_0_01", "2017_0_13", "2015_0_20", "2014_0_10", "2013_0_12", "2010_0_11"],
    # 유도등 3선식 배선(점멸기 설치)이 가능한 장소
    ["2023_0_19", "2020_0_10", "2016_0_12", "2021_0_03", "2012_0_08"],
    # 공통선 1선당 접속 가능한 경계구역 수
    ["2022_0_12", "2021_0_22", "2020_0_40", "2012_0_33", "2013_0_32"],
    # 감지기회로 종단저항 설치기준
    ["2020_0_09", "2016_0_15", "2013_0_34", "2012_0_31", "2024_3_09"],
    # 누설동축케이블 끝부분에 설치하는 기기(무반사 종단저항)
    ["2021_0_24", "2019_0_15", "2020_0_34", "2014_0_18", "2011_0_14"],
    ["2014_0_17", "2013_0_06"],  # 누설동축케이블 고정 간격
    ["2023_0_08", "2022_0_18"],  # 공기관식 차동식 분포형 감지기 설치기준(빈칸)
    ["2023_0_24", "2015_0_27"],  # P형 수신기 공통선 접속 경계구역 수 및 시험방법
    ["2017_0_23", "2016_0_07", "2024_2_02"],  # 금속관 배관공사 자재의 용도
    ["2014_0_13", "2010_0_16"],  # 교차회로방식 적용 설비
    ["2022_0_21", "2018_0_08", "2012_0_26"],  # 객석유도등 설치 제외 장소
    ["2018_0_11", "2013_0_29", "2011_0_05"],  # 금속관과 박스 접속 재료
    ["2016_0_13", "2012_0_05", "2011_0_07"],  # 고정된 금속관 상호 접속 자재
    ["2020_0_05", "2016_0_02", "2011_0_04", "2017_0_19"],  # 축적기능이 없는(비축적형) 감지기 사용 경우
    ["2024_1_12", "2013_0_20", "2021_0_18"],  # 부착높이 20m 이상 설치 가능 감지기
    ["2020_0_25", "2012_0_32"],  # 감지기 사이 회로 배선방식(송배전식)
    ["2023_0_28", "2021_0_14"],  # 경계구역 설정기준(빈칸)
    ["2021_0_05", "2018_0_10", "2014_0_12", "2013_0_38"],  # 발신기세트 내장품·구성부품
    ["2024_1_10", "2022_0_10", "2021_0_16", "2020_0_02", "2013_0_16"],  # 수신기 기능·성능시험 종류
    ["2022_0_16", "2018_0_03"],  # 수신기 예비전원시험 확인사항
    ["2023_0_20", "2021_0_07"],  # 정온식 감지선형 감지기 설치기준
]
# Reviewed splits: the auto cluster joined two different questions.
SPLIT_OUT = ["2024_1_04"]  # 비상콘센트 설치대상 및 설치기준 (14#30 asks only the 설치기준 items)


def n(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]+", "", s)


def jacc(a: str, b: str) -> float:
    ga = {a[i:i + 2] for i in range(len(a) - 1)}
    gb = {b[i:i + 2] for i in range(len(b) - 1)}
    return len(ga & gb) / len(ga | gb) if ga and gb else (1.0 if a == b else 0.0)


def strip_pick(t: str) -> str:
    return re.sub(r"\(아래(?: 항목)? 중\s*\d+\s*가지 작성\)", "", t)


def nums(t: str) -> frozenset:
    t = strip_pick(t)
    t = re.sub(r"(?<![\d.])\(?\d{1,2}\)?[.)]\s", " ", t)  # list markers like "1. " / "(2) "
    t = re.sub(r"[①-⑩㉠-㉩]", " ", t).replace(",", "")
    return frozenset(re.findall(r"\d+(?:\.\d+)?", t))


def differs(a: str, b: str) -> bool:
    return nums(a) != nums(b) or jacc(n(strip_pick(a)), n(strip_pick(b))) < 0.6


# Reviewed notes for textual (non-numeric) answer conflicts between occurrences, keyed by cluster key.
ANSWER_NOTES = {
    "k2013_0_16": "2020년 출제본 답안에는 '저전압시험' 자리에 '절연저항시험'이 적혀 있어 정리본 표기가 서로 다릅니다. 학습 시 교재·공식 기준으로 확인하세요.",
}


def title_leaks(it: dict) -> bool:
    """True when a short answer phrase appears inside the title (the title would give the answer away)."""
    a = re.sub(r"\*?\(아래.*?\)\*?", "", it["at"]).strip()
    a = re.sub(r"^\s*\d+\.\s*", "", a)
    t = n(it["t"])
    for part in re.split(r"\n|\d+\.\s", a):
        pn = n(part)
        if 3 <= len(pn) <= 20 and pn in t:
            return True
    return False


def order_key(it: dict):
    return (it["y"], it["r"] or "0")


def build():
    items, meta = sa_parse.parse()
    byid = {it["id"]: it for it in items}
    for it in items:
        it["topic"], _ = classify(it)
    idx = {it["id"]: i for i, it in enumerate(items)}
    sim = build_similarity(items)
    auto = cluster(items, sim)
    groups: list[set[str]] = [{items[i]["id"] for i in c} for c in auto]

    # reviewed splits
    for sid in map(I, SPLIT_OUT):
        for g in groups:
            if sid in g and len(g) > 1:
                g.discard(sid)
        groups.append({sid})
    # reviewed merges
    for mg in FORCE_MERGE:
        ids = set(map(I, mg))
        assert ids <= set(byid), ids - set(byid)
        keys = [byid[i]["key"] for i in ids]
        assert len(keys) == len(set(keys)), "same exam block twice in merge group: " + str(mg)
        for g in groups:
            g -= ids
        groups.append(ids)
    groups = [g for g in groups if g]

    clusters = []
    for g in groups:
        members = sorted((byid[i] for i in g), key=lambda it: (order_key(it), -it["n"]), reverse=True)
        rep = members[0]
        earliest = sorted(members, key=lambda it: (order_key(it), it["n"]))[0]
        tops = collections.Counter(m["topic"] for m in members)
        top = max(tops.items(), key=lambda kv: (kv[1], kv[0] == rep["topic"]))[0]
        qn = n(rep["qt"]); an = n(strip_pick(rep["at"]))
        for m in members:
            m["dq"] = int(differs(m["qt"], rep["qt"]))
            m["da"] = int(differs(m["at"], rep["at"]))
        clusters.append({
            "k": "k" + earliest["id"][1:],
            "tp": TOPIC_ORDER.index(top),
            "rep": rep["id"],
            "m": [m["id"] for m in members],
            "ad": int(any(nums(m["at"]) != nums(rep["at"]) for m in members)),
        })
        k = clusters[-1]["k"]
        if k in ANSWER_NOTES:
            clusters[-1]["nt"] = ANSWER_NOTES[k]
            clusters[-1]["ad"] = 1
    # integrity
    seen = [i for c in clusters for i in c["m"]]
    assert len(seen) == len(set(seen)) == len(items) == 447, (len(seen), len(set(seen)), len(items))
    for c in clusters:
        ks = [byid[i]["key"] for i in c["m"]]
        assert len(ks) == len(set(ks)), c
    assert len({c["k"] for c in clusters}) == len(clusters), "duplicate cluster key"
    clusters.sort(key=lambda c: (-len(c["m"]), c["k"]))
    for it in items:
        it["c"] = next(c["k"] for c in clusters if it["id"] in c["m"])
    return items, clusters, meta


def to_bank(items, clusters, meta):
    occ = []
    for it in items:
        occ.append({
            "id": it["id"], "y": it["y"], "r": it["r"], "n": it["n"], "t": it["t"], "s": it["sec"],
            "kd": it["kind"], "pk": it["pick"], "qh": it["qh"], "ah": it["ah"], "c": it["c"],
            "dq": it["dq"], "da": it["da"], "ht": int(title_leaks(it)),
        })
    return {"topics": TOPIC_ORDER, "sources": meta["sources"], "occ": occ, "clusters": clusters}


if __name__ == "__main__":
    items, clusters, meta = build()
    bank = to_bank(items, clusters, meta)
    json.dump(bank, open("sa_bank.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    import os
    print("bytes", os.path.getsize("sa_bank.json"))
    sizes = collections.Counter(len(c["m"]) for c in clusters)
    print("clusters", len(clusters), "repeated", sum(1 for c in clusters if len(c["m"]) > 1), "size dist", sorted(sizes.items()))
    print("answer-differs clusters", sum(c["ad"] for c in clusters))
    tc = collections.Counter(TOPIC_ORDER[c["tp"]] for c in clusters)
    print(tc.most_common())
    byid = {it["id"]: it for it in items}
    for c in clusters[:12]:
        r = byid[c["rep"]]
        print(len(c["m"]), c["k"], TOPIC_ORDER[c["tp"]], r["t"][:40], "AD" if c["ad"] else "")
    import pickle
    pickle.dump((items, clusters, meta), open("sa_final.pkl", "wb"))
