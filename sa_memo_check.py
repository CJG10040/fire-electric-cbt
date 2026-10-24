"""Validate all memo content against the bank: python3 sa_memo_check.py"""
import importlib
import pickle
import sys

import sa_memo_lib

MODULES = ["sa_memo_a", "sa_memo_b", "sa_memo_c", "sa_memo_d", "sa_memo_cmp"]


def load_all():
    for m in MODULES:
        try:
            importlib.import_module(m)
        except ModuleNotFoundError as e:
            if e.name != m:
                raise


if __name__ == "__main__":
    items, clusters, meta = pickle.load(open("sa_final.pkl", "rb"))
    load_all()
    errs = sa_memo_lib.validate(items, clusters)
    covered = {k for c in sa_memo_lib.CARDS for k in c["refs"]}
    print(f"cards {len(sa_memo_lib.CARDS)} (clusters covered {len(covered)}/{len(clusters)}), compare sets {len(sa_memo_lib.COMPARES)}")
    rep = [c["k"] for c in clusters if len(c["m"]) > 1]
    print("repeated clusters without a card:", [k for k in rep if k not in covered])
    for e in errs:
        print("ERR", e)
    sys.exit(1 if errs else 0)
