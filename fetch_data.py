"""J.League Data Site から J1〜J3 の試合一覧（日程・結果）とチーム別スタッツ・得点ランキングを取得して data/*.json に保存する。

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
BASE = "https://data.j-league.or.jp"
URL = BASE + "/SFMS01/search?competition_years={year}&competition_frame_ids={fid}"
TEAM_STATS_URL = BASE + "/SFRT08/search?competitionYear={year}&competitionId={fid}"
SUB_COMP_URL = BASE + "/SFRT09/createSubCompetitions?competition_year_id={year}&competition_id={fid}"
SCORERS_URL = BASE + "/SFRT09/search?competition_year_id={year}&competition_id={fid}&sub_competition_id={sid}&section_id=0&number=300"
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


def club_slug(cell):
    m = re.search(r"/club/([^/]+)/", cell)
    return m.group(1) if m else None


def parse(page, slugs):
    """試合一覧を読む。slugs にはクラブの英字ID → 略称（横浜FM など）を記録する"""
    matches = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        raw = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        c = [text(x) for x in raw]
        if len(c) != 11 or not c[0].startswith("20"):
            continue
        _season, _comp, sec, date, ko, home, score, away, stadium, att, tv = c
        for cell, name in ((raw[5], home), (raw[7], away)):
            if club_slug(cell):
                slugs[club_slug(cell)] = name
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


def num(v):
    try:
        return float(v) if "." in v else int(v.replace(",", ""))
    except ValueError:
        return None


TEAM_COLS = ["games", "minutes", "gf", "gfAvg", "pkGoals", "pk", "ga", "gaAvg", "pkConceded", "pkAgainst",
             "shots", "shotsAgainst", "fk", "ck", "fouls", "yellow", "red"]


def fetch_team_stats(fid, full2short, short_rows):
    """チーム別集計（シュート・CK・警告など）。チーム名は正式名なので略称に直す"""
    page = fetch(TEAM_STATS_URL.format(year=SEASON_YEAR, fid=fid))
    out = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        c = [text(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(c) < len(TEAM_COLS) + 1 or not c[1].isdigit():
            continue
        st = dict(zip(TEAM_COLS, (num(v) for v in c[1:len(TEAM_COLS) + 1])))
        short = full2short.get(c[0])
        if not short:  # 得点者がいないなどで名前が分からないときは、試合数・得点・失点が一致するチームを探す
            cand = [t for t, r in short_rows.items() if r == (st["games"], st["gf"], st["ga"])]
            short = cand[0] if len(cand) == 1 else None
        if short:
            out[short] = {"name": c[0], **st}
    return out


def fetch_scorers(fid, slugs, full2short):
    sub = json.loads(fetch(SUB_COMP_URL.format(year=SEASON_YEAR, fid=fid)))["subCompetitionList"]
    page = fetch(SCORERS_URL.format(year=SEASON_YEAR, fid=fid, sid=sub[0]["selectValue"]))
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        raw = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        c = [text(x) for x in raw]
        if len(c) < 8 or not c[0].isdigit():
            continue
        slug = club_slug(raw[2])
        if slug and slug in slugs:
            full2short[c[2]] = slugs[slug]
        out.append({"rank": int(c[0]), "name": c[1], "club": slugs.get(slug, c[2]), "goals": num(c[3]),
                    "shots": num(c[4]), "pkGoals": num(c[5]), "pk": num(c[6]), "apps": num(c[7])})
    return out


def main():
    OUT_DIR.mkdir(exist_ok=True)
    meta = {"season": f"{SEASON_YEAR}/{(SEASON_YEAR + 1) % 100:02d}",
            "updated": datetime.now(JST).strftime("%Y-%m-%d %H:%M"), "leagues": {}}
    for key, fid in LEAGUES.items():
        slugs = {}
        ms = parse(fetch(URL.format(year=SEASON_YEAR, fid=fid)), slugs)
        teams = sorted({m["home"] for m in ms} | {m["away"] for m in ms})
        played = sum(m["hg"] is not None for m in ms)
        if len(ms) < 100 or len(teams) < 10:
            raise SystemExit(f"{key}: 取得結果が少なすぎます（{len(ms)}試合・{len(teams)}チーム）。サイト構成が変わった可能性")
        # スタッツは無くても順位予測は動くので、取れなければ警告だけ出して続ける
        scorers, team_stats = [], {}
        try:
            full2short = {}
            scorers = fetch_scorers(fid, slugs, full2short)
            rows = {t: [0, 0, 0] for t in teams}
            for m in ms:
                if m["hg"] is None:
                    continue
                rows[m["home"]][0] += 1; rows[m["home"]][1] += m["hg"]; rows[m["home"]][2] += m["ag"]
                rows[m["away"]][0] += 1; rows[m["away"]][1] += m["ag"]; rows[m["away"]][2] += m["hg"]
            team_stats = fetch_team_stats(fid, full2short, {t: tuple(r) for t, r in rows.items()})
            missing = [t for t in teams if t not in team_stats]
            if missing:
                print(f"  {key}: スタッツの対応が取れないチーム {missing}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"  {key}: スタッツの取得に失敗（{e}）", file=sys.stderr)
        (OUT_DIR / f"{key}.json").write_text(
            json.dumps({"league": key, "teams": teams, "matches": ms, "teamStats": team_stats, "scorers": scorers},
                       ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        meta["leagues"][key] = {"matches": len(ms), "played": played, "teams": len(teams)}
        print(f"{key}: {len(ms)}試合（消化 {played}）・{len(teams)}チーム・スタッツ {len(team_stats)}チーム・得点者 {len(scorers)}人")
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
