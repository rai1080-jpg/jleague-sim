"""J.League Data Site から J1〜J3 の試合一覧（日程・結果）を取得して data/*.json に保存する。

使い方: python fetch_data.py
標準ライブラリのみで動く（GitHub Actions でもそのまま実行できる）。
"""
import html
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

SEASON_YEAR = 2026  # 2026/27 シーズン（データサイト上は 2026 で検索する）
LEAGUES = {"j1": 1, "j2": 2, "j3": 3}  # competition_frame_ids
URL = "https://data.j-league.or.jp/SFMS01/search?competition_years={year}&competition_frame_ids={fid}"
OUT_DIR = Path(__file__).parent / "data"
JST = timezone(timedelta(hours=9))

ZEN2HAN = str.maketrans("０１２３４５６７８９", "0123456789")


def fetch(url, retries=3):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (jleague-sim)"})
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if i == retries - 1:
                raise
            print(f"  retry ({e})", file=sys.stderr)
            time.sleep(5)


def text(cell):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", cell))).strip()


def parse(page):
    matches = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        c = [text(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(c) != 11 or not c[0].startswith("20"):
            continue
        _season, _comp, sec, date, ko, home, score, away, stadium, att, tv = c
        m = re.match(r"第(\d+)節", sec.translate(ZEN2HAN))
        d = re.match(r"(\d+)/(\d+)/(\d+)", date)
        s = re.match(r"(\d+)-(\d+)$", score)
        matches.append({
            "sec": int(m.group(1)) if m else 0,
            "date": f"20{d.group(1)}-{d.group(2)}-{d.group(3)}" if d else "",
            "ko": ko,
            "home": home,
            "away": away,
            "hg": int(s.group(1)) if s else None,
            "ag": int(s.group(2)) if s else None,
            "stadium": stadium,
            "att": int(att.replace(",", "")) if att.replace(",", "").isdigit() else None,
            "tv": tv,
        })
    matches.sort(key=lambda x: (x["sec"], x["date"], x["ko"]))
    return matches


def main():
    OUT_DIR.mkdir(exist_ok=True)
    meta = {"season": f"{SEASON_YEAR}/{(SEASON_YEAR + 1) % 100:02d}",
            "updated": datetime.now(JST).strftime("%Y-%m-%d %H:%M"), "leagues": {}}
    for key, fid in LEAGUES.items():
        ms = parse(fetch(URL.format(year=SEASON_YEAR, fid=fid)))
        teams = sorted({m["home"] for m in ms} | {m["away"] for m in ms})
        played = sum(m["hg"] is not None for m in ms)
        if len(ms) < 100 or len(teams) < 10:
            raise SystemExit(f"{key}: 取得結果が少なすぎます（{len(ms)}試合・{len(teams)}チーム）。サイト構成が変わった可能性")
        (OUT_DIR / f"{key}.json").write_text(
            json.dumps({"league": key, "teams": teams, "matches": ms}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        meta["leagues"][key] = {"matches": len(ms), "played": played, "teams": len(teams)}
        print(f"{key}: {len(ms)}試合（消化 {played}）・{len(teams)}チーム")
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
