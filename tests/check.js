// 計算エンジンの動作確認: node tests/check.js
const J = require(__dirname + "/../sim.js"), fs = require("fs");
const cfg = { runs: 10000, seed: 1, priorGames: 10, homePrior: 1.2, strengthSd: 0.12 };
const zones = [{ key: "champ", from: 1, to: 1 }, { key: "down", from: 18, to: 20 }];
let ok = true;
for (const lg of ["j1", "j2", "j3"]) {
  const d = JSON.parse(fs.readFileSync(__dirname + `/../data/${lg}.json`, "utf8"));
  const st = J.standings(d.teams, d.matches);
  const md = J.estimate(d.teams, d.matches, cfg);
  const watch = d.matches.map((m, i) => (m.hg == null ? i : -1)).filter((i) => i >= 0).slice(0, 10);
  const t0 = Date.now();
  const sim = J.simulate(d.teams, d.matches, md, cfg, watch);
  const ms = Date.now() - t0;
  const sm = J.summarize(sim, zones);
  console.log(lg, `sim ${ms}ms`, "homeMu", md.homeMu.toFixed(2), "awayMu", md.awayMu.toFixed(2));
  st.slice(0, 3).concat(st.slice(-2)).forEach((r) => {
    const s = sm.find((x) => x.team === r.team);
    console.log(" ", r.rank, r.team, `${r.pts}pt/${r.p}試合`, "rating", md.rating[r.team].toFixed(2),
      "予想", s.meanPts.toFixed(1), `[${s.p10}-${s.p90}]`, "優勝", (s.zoneP.champ * 100).toFixed(1), "降格", (s.zoneP.down * 100).toFixed(1));
  });
  // 全試合消化済みなら、シミュレーション順位＝実際の順位（確率100%）になるはず
  const full = d.matches.map((m) => (m.hg == null ? { ...m, hg: 1, ag: 0 } : m));
  const st2 = J.standings(d.teams, full);
  const s2 = J.summarize(J.simulate(d.teams, full, md, { ...cfg, runs: 200 }), zones);
  const pass = st2.every((r) => s2.find((x) => x.team === r.team).rankP[r.rank] === 1);
  console.log("  全消化テスト:", pass ? "OK" : "NG");
  ok = ok && pass;
}
process.exit(ok ? 0 : 1);
