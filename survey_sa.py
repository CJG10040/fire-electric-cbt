"""Print clusters for authoring review: python3 survey_sa.py rep|single [topic_index]"""
import pickle
import re
import sys

from sa_final import TOPIC_ORDER

items, clusters, meta = pickle.load(open("sa_final.pkl", "rb"))
M = {i["id"]: i for i in items}
mode = sys.argv[1]
topic = int(sys.argv[2]) if len(sys.argv) > 2 else None
width = int(sys.argv[3]) if len(sys.argv) > 3 else 230


def flat(t, n):
    return re.sub(r"\s+", " ", re.sub(r"\*?\(아래.*?\)\*?", "", t)).strip()[:n]


for c in clusters:
    rep = M[c["rep"]]
    multi = len(c["m"]) > 1
    if (mode == "rep") != multi:
        continue
    if topic is not None and c["tp"] != topic:
        continue
    ids = c["m"][-1][1:]  # earliest id (cluster key source)
    print(f"[{c['k']}] x{len(c['m'])} {TOPIC_ORDER[c['tp']]} | {rep['t'][:44]}{' | AD' if c['ad'] else ''}")
    print("    A:", flat(rep["at"], width) + (f" || pick{rep['pick']}" if rep["pick"] else ""))
