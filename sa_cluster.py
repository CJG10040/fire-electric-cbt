"""Duplicate clustering + topic classification for the 단답·서술 bank.

Counting rule (user's fire-exam-dedup convention): 출제 횟수 = number of source occurrences in a cluster
(not number of years). Items of the same exam block never merge. Items merge only when the asked
intent is the same; differing answers are kept as variants instead of being overwritten.
"""
from __future__ import annotations
import collections
import json
import math
import re

# ------------------------------------------------------------------ topics
TOPICS = [
    ("감지기·감지기회로", ["감지기", "교차회로", "송배전", "종단저항", "감지선", "공기관", "열전대", "정온식", "차동식", "보상식", "광전식", "이온화", "불꽃", "축적", "비화재보", "광축", "공칭감시거리", "스포트형", "분포형"]),
    ("수신기·중계기", ["수신기", "중계기", "GP형", "R형", "P형", "공통선시험", "회로도통", "동시작동", "예비전원시험", "화재표시"]),
    ("발신기·경계구역·경보장치", ["모터사이렌", "발신기", "경계구역", "지구경종", "음향장치", "시각경보", "경종", "사이렌", "음향경보", "표시등", "비상경보", "경보방식", "우선경보"]),
    ("유도등·비상조명", ["유도등", "유도표지", "피난유도선", "비상조명", "휴대용 비상조명", "점멸기", "3선식"]),
    ("비상콘센트", ["비상콘센트"]),
    ("비상방송", ["비상방송", "확성기", "음량조정", "증폭기 및 조작부"]),
    ("누전·가스누설", ["누전경보", "변류기", "가스누설", "영상변류", "ZCT", "탐지부"]),
    ("무선통신보조", ["무선통신보조", "누설동축", "무반사", "분배기", "증폭기"]),
    ("배선·배관·전선", ["금속관", "후강전선관", "박강", "전선관", "부싱", "로크너트", "커플링", "노멀밴드", "유니버설", "아우트렛", "박스", "전선", "케이블", "내화배선", "내열배선", "배선", "HFIX", "접지", "약호", "새들", "배관"]),
    ("전원·축전지·절연", ["축전지", "비상전원", "절연저항", "절연내력", "충전", "상용전원", "예비전원", "전원회로", "비상전원수전", "자가발전", "UPS", "정류", "전압강하", "메거", "접지저항"]),
    ("소화설비 연동", ["이산화탄소", "할론", "할로겐", "스프링클러", "준비작동", "일제개방", "옥내소화전", "소화설비", "방출표시", "수동조작함", "압력스위치", "솔레노이드", "동력제어반", "감시제어반", "기동용 수압", "탬퍼", "유수검지", "가스계", "포소화", "분말", "방호구역", "화재조기진압"]),
    ("제연·방화", ["제연", "방화셔터", "방화문", "댐퍼", "배연", "연동제어"]),
    ("시퀀스·제어·전기기기", ["THR", "MCCB", "ELB", "시퀀스", "릴레이", "타이머", "전동기", "콘덴서", "논리", "접점", "계전기", "전기계측", "계측기", "역률", "차단기", "개폐기", "전력용", "기동", "LS", "PB", "MC"]),
    ("용어·법령·시설분류", ["소방시설", "용어", "정의", "설치대상", "특정소방대상물", "자체점검", "임시소방", "분류", "경보설비의 종류", "소방시설법", "시행령", "점검 장비", "점검장비", "설계도서"]),
]
TOPIC_ORDER = [t for t, _ in TOPICS]

# strong title overrides: first matching regex wins (title only)
TITLE_RULES = [
    (r"비상콘센트", "비상콘센트"),
    (r"비상방송|확성기|음량조정", "비상방송"),
    (r"누전경보|변류기|가스누설", "누전·가스누설"),
    (r"무선통신보조|누설동축|무반사", "무선통신보조"),
    (r"유도등|유도표지|피난유도선|비상조명|점멸기", "유도등·비상조명"),
    (r"시퀀스|THR|MCCB|ELB|EOCR|제어약호|제어기구|문자기호|열동계전기|콘덴서|리액터|고조파|방전 ?코일|보수율|전동기|\bCT\b|모터컨트롤|계측|역률", "시퀀스·제어·전기기기"),
    (r"축전지|비상전원|충전|전압강하", "전원·축전지·절연"),
    (r"접점수고|접점간격|유통시험|리크|제베크", "감지기·감지기회로"),
    (r"방재센터", "용어·법령·시설분류"),
    (r"이산화탄소|할론|할로겐|스프링클러|준비작동|프리액션|일제개방|옥내소화전|수동조작함|압력스위치|솔레노이드|동력제어반|감시제어반|수압개폐|탬퍼|유수검지|소화설비|SVP", "소화설비 연동"),
    (r"제연|방화셔터|방화문|댐퍼", "제연·방화"),
    (r"교차회로|송배전|종단저항|도통시험용", "감지기·감지기회로"),
    (r"감지기|감지선|공기관|열전대|비화재보", "감지기·감지기회로"),
    (r"수신기|중계기|공통선", "수신기·중계기"),
    (r"발신기|경계구역|시각경보|음향장치|경종|표시등|사이렌|경보방식|우선경보", "발신기·경계구역·경보장치"),
    (r"금속관|후강|전선|케이블|배선|배관|접지|약호|부싱|커플링|로크너트|아우트렛|노멀|유니버설|박스|새들|리머|합성수지|간선|굵기", "배선·배관·전선"),
    (r"절연|상용전원|메거", "전원·축전지·절연"),
    (r"소방시설|용어|정의|설치대상|특정소방대상물|자체점검|임시소방|분류|종류|점검 장비|전기화재", "용어·법령·시설분류"),
]


def classify(it: dict) -> tuple[str, str]:
    title = it["t"]
    for pat, topic in TITLE_RULES:
        if re.search(pat, title):
            return topic, "title"
    text = it["t"] + " " + it["qt"]
    score = collections.Counter()
    for topic, kws in TOPICS:
        for kw in kws:
            score[topic] += text.count(kw) * (2 if kw in it["t"] else 1)
    if score and max(score.values()) > 0:
        best = score.most_common(1)[0]
        return best[0], "keyword"
    return "용어·법령·시설분류", "default"


# ------------------------------------------------------------------ similarity
def _norm(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]+", "", s)


def _grams(s: str, n: int = 2) -> collections.Counter:
    return collections.Counter(s[i:i + n] for i in range(len(s) - n + 1))


# Terms that distinguish different questions even when the wording overlaps heavily.
LEXICON = [
    "비상방송", "비상콘센트", "유도등", "유도표지", "누전경보", "가스누설", "무선통신보조", "이산화탄소", "할론", "스프링클러", "준비작동", "일제개방", "옥내소화전",
    "제연", "매입", "노출", "압력스위치", "방출표시등", "수동조작함", "사이렌", "음향경보장치", "종단저항", "공통선", "절연저항", "절연내력", "변류기", "THR", "MCCB", "ELB",
    "수신기", "중계기", "발신기", "시각경보", "경계구역", "감지기", "열전대", "공기관", "정온식", "차동식", "보상식", "광전식", "연기", "불꽃", "분포형", "스포트형",
    "부싱", "로크너트", "커플링", "노멀", "유니버설", "아우트렛", "박스", "새들", "후강", "박강", "접지", "축전지", "충전", "비상전원", "상용전원", "증폭기", "분배기",
    "설치대상", "설치기준", "시험", "목적", "기능", "원인", "명칭", "길이", "종류", "점멸기", "3선식", "피난유도선", "휴대용", "객석", "복도", "계단", "통로",
    "교류", "직류", "내화", "내열", "시각장애", "청각장애", "GP", "R형", "P형", "자탐", "ZCT", "영상변류기",
]


def lex_set(it: dict) -> frozenset:
    text = it["t"] + " " + it["qt"][:260]
    return frozenset(w for w in LEXICON if w in text)


def build_similarity(items: list[dict]):
    N = len(items)
    docs = []
    for it in items:
        t = _norm(it["t"])
        docs.append((_grams(t + t), _grams(_norm(it["qt"])), _grams(_norm(it["at"]))))
    df = collections.Counter()
    for g in docs:
        for k in set(g[0]) | set(g[1]) | set(g[2]):
            df[k] += 1

    def vec(c):
        return {k: v * (math.log(N / (1 + df.get(k, 0))) + 1) for k, v in c.items()}

    V = [tuple(vec(c) for c in g) for g in docs]
    norms = [tuple(math.sqrt(sum(v * v for v in d.values())) for d in vs) for vs in V]

    def cos(i, j, k):
        a, b = V[i][k], V[j][k]
        if not a or not b:
            return 0.0
        if len(a) > len(b):
            a, b = b, a
            sw = True
        dot = sum(v * b.get(g, 0) for g, v in a.items())
        den = norms[i][k] * norms[j][k]
        return dot / den if den else 0.0

    sim = {}
    for i in range(N):
        for j in range(i + 1, N):
            sim[(i, j)] = 0.40 * cos(i, j, 0) + 0.40 * cos(i, j, 1) + 0.20 * cos(i, j, 2)
    return sim


def cluster(items: list[dict], sim: dict, th: float = 0.56, min_link: float = 0.50) -> list[list[int]]:
    """Complete-linkage clustering with guards: same-exam items never merge; lexicon sets must agree."""
    N = len(items)
    lex = [lex_set(it) for it in items]

    def ok_pair(i, j):
        a, b = (i, j) if i < j else (j, i)
        if items[a]["key"] == items[b]["key"]:
            return False
        s = sim[(a, b)]
        if s < min_link:
            return False
        # a distinguishing term present on one side only means a different question
        # (generic words such as 시험/목적/기능/종류 are ignored for the guard)
        generic = {"시험", "목적", "기능", "원인", "명칭", "길이", "종류", "설치기준", "설치대상"}
        diff = (lex[a] ^ lex[b]) - generic
        return len(diff) == 0 or s >= 0.88

    groups = [[i] for i in range(N)]
    pairs = sorted(((s, i, j) for (i, j), s in sim.items() if s >= th), reverse=True)
    where = list(range(N))
    members = {i: [i] for i in range(N)}
    for s, i, j in pairs:
        ci, cj = where[i], where[j]
        if ci == cj:
            continue
        keys_i = {items[m]["key"] for m in members[ci]}
        keys_j = {items[m]["key"] for m in members[cj]}
        if keys_i & keys_j:
            continue
        if all(ok_pair(a, b) for a in members[ci] for b in members[cj]):
            for m in members[cj]:
                where[m] = ci
            members[ci].extend(members.pop(cj))
    return list(members.values())


if __name__ == "__main__":
    items = json.load(open("sa_items.json", encoding="utf-8"))
    for it in items:
        it["topic"], it["topic_by"] = classify(it)
    print(collections.Counter(it["topic"] for it in items).most_common())
    print(collections.Counter(it["topic_by"] for it in items))
    sim = build_similarity(items)
    cl = cluster(items, sim)
    multi = [c for c in cl if len(c) > 1]
    print("clusters", len(cl), "multi", len(multi), "items in multi", sum(len(c) for c in multi))
    json.dump({"clusters": cl}, open("sa_clusters_auto.json", "w"))
    import pickle
    pickle.dump(sim, open("sa_sim.pkl", "wb"))
