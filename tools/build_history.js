// 予測の推移（data/history.json）を作る: node tools/build_history.js
// 各節の時点に戻り「その節までに終わった試合だけ」でチーム力を推定し直して、残りをシミュレーションする。
// 当時わかっていた情報だけを使うので、その時点の予測を再現できる（計算方法は今の sim.js / config.js）。
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
global.window = {};
require(path.join(ROOT, "config.js"));
const J = require(path.join(ROOT, "sim.js"));
const LC = window.LEAGUE_CONFIG;
const FULL = window.SIM_CONFIG;
const LIGHT = { ...FULL, runs: 4000 }; // 過去の節は数が多いので回数を控えめに（傾向を見るには十分）

const r3 = (v) => Math.round(v * 1000) / 1000;
const out = {};
for (const key of ["j1", "j2", "j3"]) {
  const file = path.join(ROOT, "data", `${key}.json`);
  if (!fs.existsSync(file)) continue;
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const zones = LC[key].zones;
  const played = d.matches.filter((m) => m.hg != null);
  const maxSec = Math.max(0, ...played.map((m) => m.sec));
  const lg = { secs: [], complete: [], teams: {} };
  d.teams.forEach((t) => {
    lg.teams[t] = { pts: [], rank: [] };
    zones.forEach((z) => (lg.teams[t][z.key] = []));
  });
  const t0 = Date.now();
  for (let s = 1; s <= maxSec; s++) {
    // その節より後の試合は「まだ行われていない」ことにする
    const ms = d.matches.map((m) => (m.sec <= s ? m : { ...m, hg: null, ag: null }));
    // 最新の節は画面の「最終予測」と同じ条件で計算し、数字をぴったりそろえる
    const cfg = s === maxSec ? FULL : LIGHT;
    const model = J.estimate(d.teams, ms, cfg);
    const sum = J.summarize(J.simulate(d.teams, ms, model, cfg), zones);
    lg.secs.push(s);
    lg.complete.push(d.matches.filter((m) => m.sec === s).every((m) => m.hg != null)); // その節の試合がすべて終わっているか
    sum.forEach((x) => {
      const t = lg.teams[x.team];
      t.pts.push(Math.round(x.meanPts * 10) / 10);
      t.rank.push(Math.round(x.meanRank * 10) / 10);
      zones.forEach((z) => t[z.key].push(r3(x.zoneP[z.key])));
    });
  }
  out[key] = lg;
  console.log(`${key}: 第1〜${maxSec}節（${Date.now() - t0}ms）`);
}
fs.writeFileSync(path.join(ROOT, "data", "history.json"), JSON.stringify(out));
