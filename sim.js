// 順位計算・チーム力推定・モンテカルロシミュレーション（DOM に依存しない純粋な計算）
(function (root) {
  "use strict";

  // ---------- 乱数（シード付き） ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(lambda, rnd) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > L);
    return k - 1;
  }
  function gauss(rnd) {
    const u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---------- 順位表 ----------
  function emptyRow(team) {
    return { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
      hw: 0, hd: 0, hl: 0, aw: 0, ad: 0, al: 0, form: [] };
  }
  function addResult(rows, m) {
    const h = rows[m.home], a = rows[m.away];
    h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
    if (m.hg > m.ag) { h.w++; h.hw++; a.l++; a.al++; h.pts += 3; h.form.push("W"); a.form.push("L"); }
    else if (m.hg < m.ag) { a.w++; a.aw++; h.l++; h.hl++; a.pts += 3; h.form.push("L"); a.form.push("W"); }
    else { h.d++; a.d++; h.hd++; a.ad++; h.pts++; a.pts++; h.form.push("D"); a.form.push("D"); }
  }
  function compareRows(x, y) {
    return (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf) || (y.w - x.w) || x.team.localeCompare(y.team, "ja");
  }
  // matches は日付順に並んでいる前提。filter で対象試合を絞れる
  function standings(teams, matches, filter) {
    const rows = {};
    teams.forEach((t) => (rows[t] = emptyRow(t)));
    const done = matches.filter((m) => m.hg != null && (!filter || filter(m)))
      .slice().sort((a, b) => (a.date + a.ko).localeCompare(b.date + b.ko));
    done.forEach((m) => addResult(rows, m));
    const list = Object.values(rows).sort(compareRows);
    list.forEach((r, i) => (r.rank = i + 1));
    return list;
  }
  // 節ごとの順位推移（その節までに行われた試合で計算）
  function rankHistory(teams, matches) {
    const maxSec = Math.max(0, ...matches.filter((m) => m.hg != null).map((m) => m.sec));
    const hist = {};
    teams.forEach((t) => (hist[t] = []));
    for (let s = 1; s <= maxSec; s++) {
      standings(teams, matches, (m) => m.sec <= s).forEach((r) => hist[r.team].push({ sec: s, rank: r.rank, pts: r.pts }));
    }
    return hist;
  }

  // ---------- チーム力推定（ポアソン・事前分布つき反復推定） ----------
  function estimate(teams, matches, cfg) {
    const played = matches.filter((m) => m.hg != null);
    const n = played.length;
    const HG = played.reduce((s, m) => s + m.hg, 0), AG = played.reduce((s, m) => s + m.ag, 0);
    const g = n ? (HG + AG) / (2 * n) : 1.3; // 1チーム1試合あたりの平均得点
    const P = 40; // ホーム有利の事前値の重み（得点数換算）
    const r = (HG + P * cfg.homePrior) / (AG + P);
    const homeMu = (2 * g * r) / (1 + r), awayMu = (2 * g) / (1 + r);
    const K = cfg.priorGames * g; // 平均チームとしての仮想得点
    const att = {}, def = {}, gf = {}, ga = {};
    teams.forEach((t) => { att[t] = 1; def[t] = 1; gf[t] = 0; ga[t] = 0; });
    played.forEach((m) => { gf[m.home] += m.hg; ga[m.home] += m.ag; gf[m.away] += m.ag; ga[m.away] += m.hg; });
    for (let it = 0; it < 60; it++) {
      const ea = {}, ed = {};
      teams.forEach((t) => { ea[t] = 0; ed[t] = 0; });
      played.forEach((m) => {
        ea[m.home] += homeMu * def[m.away]; ea[m.away] += awayMu * def[m.home];
        ed[m.home] += awayMu * att[m.away]; ed[m.away] += homeMu * att[m.home];
      });
      teams.forEach((t) => { att[t] = (gf[t] + K) / (ea[t] + K); def[t] = (ga[t] + K) / (ed[t] + K); });
      const ma = teams.reduce((s, t) => s + att[t], 0) / teams.length;
      const md = teams.reduce((s, t) => s + def[t], 0) / teams.length;
      teams.forEach((t) => { att[t] /= ma; def[t] /= md; });
    }
    const model = { att, def, homeMu, awayMu, g };
    // 平均的な相手に対する1試合あたりの期待勝点（ホーム/アウェイ半々）＝ チーム力の総合指標
    model.rating = {};
    teams.forEach((t) => {
      const h = outcomeProbs(homeMu * att[t], awayMu * def[t]);
      const a = outcomeProbs(homeMu * def[t], awayMu * att[t]);
      model.rating[t] = ((3 * h.h + h.d) + (3 * a.a + a.d)) / 2;
    });
    return model;
  }
  function lambdas(model, m) {
    return [model.homeMu * model.att[m.home] * model.def[m.away], model.awayMu * model.att[m.away] * model.def[m.home]];
  }
  function pmf(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
  function outcomeProbs(lh, la) {
    let h = 0, d = 0, a = 0, best = [0, 0], bp = -1;
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const p = pmf(lh, i) * pmf(la, j);
      if (i > j) h += p; else if (i < j) a += p; else d += p;
      if (p > bp) { bp = p; best = [i, j]; }
    }
    const s = h + d + a;
    return { h: h / s, d: d / s, a: a / s, score: best };
  }

  // ---------- モンテカルロ ----------
  // watch: 結果を記録しておく未消化試合のインデックス（注目カードの影響度計算用）
  function simulate(teams, matches, model, cfg, watch) {
    watch = watch || [];
    const T = teams.length, N = cfg.runs, idx = {};
    teams.forEach((t, i) => (idx[t] = i));
    const basePts = new Int32Array(T), baseGd = new Int32Array(T), baseGf = new Int32Array(T);
    const rest = [];
    matches.forEach((m, mi) => {
      const h = idx[m.home], a = idx[m.away];
      if (m.hg == null) { rest.push({ mi, h, a, lam: lambdas(model, m) }); return; }
      baseGf[h] += m.hg; baseGf[a] += m.ag; baseGd[h] += m.hg - m.ag; baseGd[a] += m.ag - m.hg;
      if (m.hg > m.ag) basePts[h] += 3; else if (m.hg < m.ag) basePts[a] += 3; else { basePts[h]++; basePts[a]++; }
    });
    const attArr = teams.map((t) => model.att[t]), defArr = teams.map((t) => model.def[t]);
    const rankOut = new Uint8Array(N * T), ptsOut = new Int16Array(N * T);
    const watchPos = watch.map((mi) => rest.findIndex((r) => r.mi === mi));
    const watchOut = new Int8Array(N * watch.length); // 1=H, 0=D, -1=A
    const rnd = mulberry32(cfg.seed);
    const pts = new Int32Array(T), gd = new Int32Array(T), gf = new Int32Array(T);
    const key = new Float64Array(T), order = new Array(T);
    const sa = new Float64Array(T), sd = new Float64Array(T);
    const res = new Int8Array(rest.length);
    for (let n = 0; n < N; n++) {
      pts.set(basePts); gd.set(baseGd); gf.set(baseGf);
      // チーム力そのものの不確かさ
      for (let i = 0; i < T; i++) { sa[i] = Math.exp(cfg.strengthSd * gauss(rnd)); sd[i] = Math.exp(cfg.strengthSd * gauss(rnd)); }
      for (let k = 0; k < rest.length; k++) {
        const r = rest[k];
        const lh = r.lam[0] * sa[r.h] * sd[r.a], la = r.lam[1] * sa[r.a] * sd[r.h];
        const x = poisson(lh, rnd), y = poisson(la, rnd);
        gf[r.h] += x; gf[r.a] += y; gd[r.h] += x - y; gd[r.a] += y - x;
        if (x > y) { pts[r.h] += 3; res[k] = 1; } else if (x < y) { pts[r.a] += 3; res[k] = -1; } else { pts[r.h]++; pts[r.a]++; res[k] = 0; }
      }
      for (let i = 0; i < T; i++) { key[i] = pts[i] * 1e6 + (gd[i] + 500) * 1e3 + gf[i] + rnd() * 0.9; order[i] = i; }
      order.sort((p, q) => key[q] - key[p]);
      for (let pos = 0; pos < T; pos++) rankOut[n * T + order[pos]] = pos + 1;
      for (let i = 0; i < T; i++) ptsOut[n * T + i] = pts[i];
      for (let w = 0; w < watchPos.length; w++) watchOut[n * watch.length + w] = watchPos[w] >= 0 ? res[watchPos[w]] : 0;
    }
    return { teams, N, T, rankOut, ptsOut, watch, watchOut, attArr, defArr };
  }

  // シミュレーション結果の集計
  function summarize(sim, zones) {
    const { N, T, rankOut, ptsOut, teams } = sim;
    return teams.map((team, i) => {
      const rankP = new Float64Array(T + 1);
      const ptsList = new Int16Array(N);
      let sumPts = 0, sumRank = 0;
      for (let n = 0; n < N; n++) {
        const rk = rankOut[n * T + i];
        rankP[rk]++; sumRank += rk;
        ptsList[n] = ptsOut[n * T + i]; sumPts += ptsList[n];
      }
      ptsList.sort();
      const zoneP = {};
      zones.forEach((z) => {
        let c = 0;
        for (let r = z.from; r <= z.to; r++) c += rankP[r];
        zoneP[z.key] = c / N;
      });
      for (let r = 1; r <= T; r++) rankP[r] /= N;
      return {
        team, rankP, zoneP,
        meanPts: sumPts / N, meanRank: sumRank / N,
        p10: ptsList[Math.floor(N * 0.1)], p50: ptsList[Math.floor(N * 0.5)], p90: ptsList[Math.floor(N * 0.9)],
      };
    });
  }

  // ○位のチームの最終勝点の分布（優勝ライン・残留ラインの目安）
  function rankPointsLine(sim, rank) {
    const { N, T, rankOut, ptsOut } = sim;
    const v = new Int16Array(N);
    for (let n = 0; n < N; n++) for (let i = 0; i < T; i++) if (rankOut[n * T + i] === rank) { v[n] = ptsOut[n * T + i]; break; }
    v.sort();
    return { p10: v[Math.floor(N * 0.1)], p50: v[Math.floor(N * 0.5)], p90: v[Math.floor(N * 0.9)] };
  }

  // 注目試合：その試合の勝敗で、各チームのゾーン確率がどれだけ動くか
  function matchImpact(sim, zones) {
    const { N, T, rankOut, watch, watchOut, teams } = sim;
    const W = watch.length;
    return watch.map((mi, w) => {
      const cnt = { 1: 0, 0: 0, "-1": 0 };
      const hit = {}; // hit[o][zoneKey][team]
      [1, 0, -1].forEach((o) => { hit[o] = {}; zones.forEach((z) => (hit[o][z.key] = new Float64Array(T))); });
      for (let n = 0; n < N; n++) {
        const o = watchOut[n * W + w];
        cnt[o]++;
        for (let i = 0; i < T; i++) {
          const rk = rankOut[n * T + i];
          for (const z of zones) if (rk >= z.from && rk <= z.to) hit[o][z.key][i]++;
        }
      }
      let best = null, total = 0;
      zones.forEach((z) => {
        for (let i = 0; i < T; i++) {
          if (!cnt[1] || !cnt[-1]) continue;
          const ph = hit[1][z.key][i] / cnt[1], pa = hit[-1][z.key][i] / cnt[-1];
          const diff = Math.abs(ph - pa);
          total += diff;
          if (!best || diff > best.diff) best = { diff, zone: z, team: teams[i], ph, pa };
        }
      });
      return { mi, total, best, pH: cnt[1] / N, pD: cnt[0] / N, pA: cnt[-1] / N };
    });
  }

  const api = { mulberry32, standings, rankHistory, estimate, lambdas, outcomeProbs, simulate, summarize, rankPointsLine, matchImpact };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JSim = api;
})(this);
