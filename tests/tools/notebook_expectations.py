# 노트북이 내는 "정답"을 뽑아서 tests/fixtures/notebook-sample.json으로 저장하는 도구
#
# [지도]
#   들어오는 것: gym_log.ipynb (① MEMO 샘플 · ② 사전 · ③ 메모 읽기 · ⑤ 회차 요약 · ⑦ 사이클 · ⑧ 다음 무게 셀)
#                weight_log.ipynb (② 설정 · ③ 메모 읽기 · ④ 유지 칼로리 · ⑤ 추천 섭취 셀) + 아래 WEIGHT_MEMO
#   하는 일:     노트북 셀을 그대로 실행 (그래프 셀은 건너뜀)
#   나가는 것:   tests/fixtures/notebook-sample.json → tests/notebook-parity.test.js가 앱(JS) 결과와 비교
#
# 언제 다시 돌리나: 노트북의 규칙(메모 읽기 · 다음 무게 · 유지 칼로리)을 바꿨을 때
#   python3 tests/tools/notebook_expectations.py      (pandas · numpy 필요 — Colab이나 PC에서. CI는 안 돌림)
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]


def code_cells(name):
    nb = json.loads((ROOT / name).read_text(encoding="utf-8"))
    return ["".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code"]


def run(cells, skip_words=(), env=None):
    env = {} if env is None else env
    for src in cells:
        if any(w in src for w in skip_words):
            continue
        exec(compile(src, "<notebook>", "exec"), env)
    return env


# ---------- gym_log.ipynb ----------
gym = run(code_cells("gym_log.ipynb"), skip_words=("plt.", "to_csv"))
rows = [{"session": r["회차"], "split": r["분할"], "name": r["종목"], "set": r["세트"],
         "w": float(r["무게"]), "r": int(r["횟수"]), "rpe": None if r["RPE"] is None else int(r["RPE"])} for r in gym["rows"]]
summary = [{"session": int(k[0]), "split": k[1], "exercises": int(v["종목수"]), "sets": int(v["총세트"]), "volume": float(v["총볼륨"])}
           for k, v in gym["summary"].iterrows()]
plans = [{"split": p["분할"], "name": p["종목"], "next": float(p["다음 무게"].replace("kg", "")), "reason": p["이유"]}
         for p in gym["plans"]]

# ---------- weight_log.ipynb ----------
# 14일: 체중은 매일, 칼로리는 마지막 날만 빼고 (앱은 "오늘"을 빼고 세니까 같은 조건으로 맞춤)
WEIGHT_MEMO = "\n".join(
    ["체중"] + [f"10/{d:02d} {84.0 - 0.07 * (d - 1) + (0.3 if d % 3 == 0 else 0):.1f}" + (f" {2150 + (d % 4) * 40}" if d < 14 else "")
                for d in range(1, 15)])
w_cells = code_cells("weight_log.ipynb")
wenv = run(w_cells[:1], env={})                      # ① WEIGHT_MEMO 셀 (덮어쓸 거라 먼저)
wenv["WEIGHT_MEMO"] = WEIGHT_MEMO
for src in w_cells[1:]:
    if "WEIGHT_MEMO = " in src or "plt." in src:
        continue
    exec(compile(src, "<weight_log>", "exec"), wenv)
weight = {
    "memo": WEIGHT_MEMO,
    "days": [{"day": d.strftime("%Y-%m-%d"), "w": float(w), "kcal": None if k != k or k is None else int(k)}
             for d, w, k in zip(wenv["df"]["날짜"], wenv["df"]["체중"], wenv["df"]["칼로리"])],
    "maintenance": float(wenv["maintenance"]),
    "slope": float(wenv["slope"]),
    "target_kcal": int(wenv["target_kcal"]),
    "kg_per_week": wenv["TARGET_KG_PER_WEEK"],
    "initial_maintenance": wenv["INITIAL_MAINTENANCE"],
}

out = {"_note": "tests/tools/notebook_expectations.py가 노트북 셀을 실행해서 만든 파일. 손으로 고치지 말 것",
       "memo": gym["MEMO"], "rows": rows, "skipped": [s.strip() for s in gym["skipped"]],
       "summary": summary, "plans": plans, "weight": weight}
path = ROOT / "tests" / "fixtures" / "notebook-sample.json"
path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"saved {path.relative_to(ROOT)}: rows {len(rows)}, plans {len(plans)}, maintenance {weight['maintenance']:.1f}")
