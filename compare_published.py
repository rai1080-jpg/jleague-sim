"""取り直した data/ が、いま公開中のデータと同じかを調べる（GitHub Actions 用）。

使い方: python compare_published.py https://<user>.github.io/<repo>/data/
同じなら changed=false、違う・公開中のものが読めないときは changed=true を GITHUB_OUTPUT に書く。
meta.json は取得時刻が毎回変わるので比べない。標準ライブラリのみ。
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

DATA = Path(__file__).parent / "data"


def published(url):
    req = urllib.request.Request(url, headers={"User-Agent": "jleague-sim", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    base = sys.argv[1].rstrip("/") + "/"
    changed = False
    for f in sorted(DATA.glob("j*.json")):
        try:
            same = published(base + f.name) == json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001  公開中のものが読めなければ公開し直す
            print(f"{f.name}: 公開中のデータを読めませんでした（{e}）")
            same = False
        print(f"{f.name}: {'変化なし' if same else '変化あり'}")
        changed = changed or not same
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fp:
            fp.write(f"changed={'true' if changed else 'false'}\n")
    print("changed =", changed)


if __name__ == "__main__":
    main()
