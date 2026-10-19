# builds lang.js: the computer's translations the phone uses + the phone's own words
import json, sys
desk = json.load(open(sys.argv[1], encoding="utf-8"))
used = set(json.load(open(sys.argv[2], encoding="utf-8"))) if len(sys.argv) > 2 else None
keys = [k.strip("\n") for k in open("tools/todo_keys.txt", encoding="utf-8") if k.strip()]
files = {"ไทย": "th", "FRANÇAIS": "fr", "DEUTSCH": "de", "ITALIANO": "it", "ESPAÑOL": "es", "中文": "zh", "עברית": "he", "BAHASA MELAYU": "ms"}
EXTRA = {  # MIN, KITCHEN CARD, OK, SUBJECT LINE
  "th": {"MIN": "นาที", "KITCHEN CARD": "การ์ดครัว", "OK": "ตกลง", "{0} - HOW TO MAKE IT": "{0} - วิธีทำ"},
  "fr": {"MIN": "MIN", "KITCHEN CARD": "FICHE CUISINE", "OK": "OK"},
  "de": {"MIN": "MIN", "KITCHEN CARD": "KÜCHENKARTE", "OK": "OK"},
  "it": {"MIN": "MIN", "KITCHEN CARD": "SCHEDA CUCINA", "OK": "OK"},
  "es": {"MIN": "MIN", "KITCHEN CARD": "FICHA DE COCINA", "OK": "OK"},
  "zh": {"MIN": "分钟", "KITCHEN CARD": "厨房卡片", "OK": "确定"},
  "he": {"MIN": "דק'", "KITCHEN CARD": "כרטיס מטבח", "OK": "אישור"},
  "ms": {"MIN": "MIN", "KITCHEN CARD": "KAD DAPUR", "OK": "OK"}}
langs = {}
for name, code in files.items():
    lines = [l.rstrip("\n") for l in open(f"tools/tr_{code}.txt", encoding="utf-8") if l.strip()]
    assert len(lines) == len(keys), (code, len(lines), len(keys))
    t = {k: v for k, v in desk["langs"][name].items() if used is None or k in used}
    t.update(dict(zip(keys, lines)))
    t.update(EXTRA[code])
    langs[name] = t
out = {"names": desk["names"], "langs": langs, "notes": desk["notes"]}
open("lang.js", "w", encoding="utf-8").write("window.SP_LANG = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print({k: len(v) for k, v in langs.items()})
