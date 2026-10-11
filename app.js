// 画面の組み立て・操作（計算は sim.js の JSim）
(function () {
  "use strict";
  const LC = window.LEAGUE_CONFIG, SC = window.SIM_CONFIG, J = window.JSim;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p) => (p >= 0.9995 ? "100" : p < 0.0005 ? "0" : p < 0.01 ? "<1" : (p * 100).toFixed(p < 0.1 ? 1 : 0)) + "%";
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const fmtDate = (d) => { if (!d) return "未定"; const x = new Date(d + "T00:00:00+09:00"); return `${x.getMonth() + 1}/${x.getDate()}(${WD[x.getDay()]})`; };
  const DATA = window.DATA_BASE || "data/"; // 別デザインのページ（night/ など）からも同じデータを読む
  const todayStr = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  const state = { league: "j1", tab: "table", meta: null, L: {}, sort: "rank", sec: {} };

  // ---------- データ読み込みとシミュレーション ----------
  async function loadLeague(key) {
    if (state.L[key]) return state.L[key];
    const d = await fetch(`${DATA}${key}.json`, { cache: "no-cache" }).then((r) => r.json());
    const cfg = LC[key];
    const L = { key, cfg, teams: d.teams, matches: d.matches };
    L.table = J.standings(L.teams, L.matches);
    L.row = Object.fromEntries(L.table.map((r) => [r.team, r]));
    L.hist = J.rankHistory(L.teams, L.matches);
    L.model = J.estimate(L.teams, L.matches, SC);
    // 注目カード用：これから行われる直近20試合
    L.upcoming = L.matches.map((m, i) => ({ m, i })).filter((x) => x.m.hg == null && x.m.date >= todayStr)
      .sort((a, b) => (a.m.date + a.m.ko).localeCompare(b.m.date + b.m.ko)).slice(0, 20).map((x) => x.i);
    L.sim = J.simulate(L.teams, L.matches, L.model, SC, L.upcoming);
    L.sum = J.summarize(L.sim, cfg.zones);
    L.impact = J.matchImpact(L.sim, cfg.zones);
    state.L[key] = L;
    return L;
  }
  const sumOf = (L, team) => L.sum.find((s) => s.team === team);

  // ---------- 共通部品 ----------
  function zoneClass(cfg, rank) {
    let cls = "";
    for (const z of cfg.zones) {
      if (rank < z.from || rank > z.to) continue;
      if (z.kind === "top") return "z-top";
      if (!cls) cls = "z-" + z.kind;
    }
    return cls;
  }
  function legend(cfg) {
    const kinds = { top: "lg-top", top2: "lg-top2", po: "lg-po", down: "lg-down" };
    return `<div class="legend">${cfg.zones.map((z) => `<span><i class="${kinds[z.kind]}"></i>${esc(z.label)}</span>`).join("")}</div>`;
  }
  const teamBtn = (t) => `<button class="team-btn" data-team="${esc(t)}">${esc(t)}</button>`;
  const remaining = (L, team) => L.matches.filter((m) => m.hg == null && (m.home === team || m.away === team));

  // 目安ライン：各ゾーンの境目の順位が最終的に取る勝点
  function lines(L) {
    const out = [];
    for (const z of L.cfg.zones) {
      if (z.kind === "down") {
        const r = L.cfg.safeRank;
        out.push({ key: z.key, label: `${L.cfg.safeLabel || "残留ライン"}（${r}位）`, rank: r, ...J.rankPointsLine(L.sim, r) });
      } else {
        const r = z.to;
        const label = z.key === "champ" ? "優勝ライン（1位）" : `${z.short}ライン（${r}位）`;
        out.push({ key: z.key, label, rank: r, ...J.rankPointsLine(L.sim, r) });
      }
    }
    return out;
  }

  // ---------- タブ：順位表 ----------
  function viewTable(L) {
    const rows = L.table.map((r) => {
      const gd = r.gf - r.ga;
      const form = r.form.slice(-5).map((f) => `<span class="f-${f}" title="${{ W: "勝", D: "分", L: "敗" }[f]}">${{ W: "○", D: "△", L: "●" }[f]}</span>`).join("");
      return `<tr class="${zoneClass(L.cfg, r.rank)}">
        <td class="rank">${r.rank}</td><td class="l">${teamBtn(r.team)}</td>
        <td class="pts">${r.pts}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
        <td class="hide-sm">${r.gf}</td><td class="hide-sm">${r.ga}</td><td>${gd > 0 ? "+" + gd : gd}</td>
        <td class="l form">${form}</td></tr>`;
    }).join("");
    const played = L.matches.filter((m) => m.hg != null).length;
    return `<section class="card">
      <h2>${L.cfg.name} 順位表</h2>
      <p class="lead">${played} / ${L.matches.length} 試合消化。チーム名をタップすると詳細（順位推移・残り日程・必要な勝点）を表示します。</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>順</th><th class="l">チーム</th><th>勝点</th><th>試合</th><th>勝</th><th>分</th><th>敗</th>
        <th class="hide-sm">得点</th><th class="hide-sm">失点</th><th>差</th><th class="l">直近5</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${legend(L.cfg)}
      <p class="lead">直近5試合：○勝 △分 ●敗（左が古い）。同勝点は 得失点差→総得点 の順。</p>
    </section>`;
  }

  // ---------- タブ：最終予測 ----------
  function viewPredict(L) {
    const zones = L.cfg.zones;
    let list = L.table.map((r) => ({ r, s: sumOf(L, r.team) }));
    if (state.sort === "pred") list.sort((x, y) => x.s.meanRank - y.s.meanRank);
    const maxP = Math.ceil((Math.max(...list.map((x) => x.s.p90)) + 5) / 10) * 10;
    const X = (v) => (v / maxP) * 100;
    const ticks = []; for (let v = 0; v <= maxP; v += maxP > 60 ? 20 : 10) ticks.push(v);

    const rows = list.map(({ r, s }, i) => {
      const cells = zones.map((z) => {
        const p = s.zoneP[z.key];
        return `<td class="pct ${p < 0.0005 ? "zero" : ""}">${pct(p)}</td>`;
      }).join("");
      const tip = `${r.team}：現在 ${r.pts} → 予想 ${s.meanPts.toFixed(1)}（80%の確率で ${s.p10}〜${s.p90}）`;
      const pos = state.sort === "pred" ? i + 1 : r.rank;
      return `<tr class="${zoneClass(L.cfg, pos)}">
        <td class="rank">${pos}</td><td class="l">${teamBtn(r.team)}</td>
        <td class="pts">${s.meanPts.toFixed(0)}<span class="rng-txt">${s.p10}–${s.p90}</span></td>
        <td class="hbar-cell hide-sm" data-tip="${esc(tip)}"><div class="ptsbar">
          <div class="cur" style="width:${X(r.pts)}%"></div>
          <div class="rng" style="left:${X(s.p10)}%;width:${X(s.p90) - X(s.p10)}%"></div>
          <div class="med" style="left:${X(s.p50)}%"></div></div></td>
        <td>${s.meanRank.toFixed(1)}</td>${cells}</tr>`;
    }).join("");
    const axis = `<div class="axis">${ticks.map((v) => `<span style="left:${X(v)}%">${v}</span>`).join("")}</div>`;

    // 最終順位の確率ヒートマップ
    const T = L.teams.length;
    const hm = [`<div></div>`];
    for (let k = 1; k <= T; k++) hm.push(`<div class="hh">${k}</div>`);
    const pMax = Math.max(0.05, ...list.map(({ s }) => Math.max(...Array.from(s.rankP).slice(1))));
    list.forEach(({ r, s }) => {
      hm.push(`<div class="hl">${esc(r.team)}</div>`);
      for (let k = 1; k <= T; k++) {
        const p = s.rankP[k];
        const mix = p <= 0 ? 0 : Math.round(6 + 94 * Math.pow(p / pMax, 0.8));
        const bg = p <= 0 ? "var(--bg-2)" : `color-mix(in oklab, var(--heat-hi) ${mix}%, var(--bg-2))`;
        hm.push(`<div class="hc" style="background:${bg}" data-tip="${esc(r.team)}：${k}位 ${pct(p)}"></div>`);
      }
    });

    return `<section class="card">
      <h2>最終順位・勝点の予測</h2>
      <p class="lead">残り試合を${SC.runs.toLocaleString()}回シミュレーション。予想勝点は平均、バーは
        細線＝現在の勝点・帯＝最終勝点の80%予測幅・縦線＝中央値。</p>
      <div class="sortbar">並び順：
        <button class="chip" data-sort="rank" aria-pressed="${state.sort === "rank"}">現在の順位</button>
        <button class="chip" data-sort="pred" aria-pressed="${state.sort === "pred"}">予想順位</button></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>順</th><th class="l">チーム</th><th>予想<br>勝点</th><th class="l hide-sm">${axis}</th><th>平均<br>順位</th>
        ${zones.map((z) => `<th>${esc(z.short)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${legend(L.cfg)}
    </section>
    <section class="card">
      <h2>最終順位の確率</h2>
      <p class="lead">色が濃いほど、その順位で終える確率が高い。マスをタップで数値表示。</p>
      <div class="tbl-wrap"><div class="heat" style="grid-template-columns: 64px repeat(${T}, minmax(13px, 1fr)); min-width: 340px">${hm.join("")}</div></div>
      <div class="heat-scale">0%<span class="bar"></span>${pct(pMax)}</div>
    </section>`;
  }

  // ---------- タブ：日程・結果 ----------
  function defaultSec(L) {
    const next = L.matches.filter((m) => m.hg == null && m.date >= todayStr).sort((a, b) => (a.date + a.ko).localeCompare(b.date + b.ko))[0];
    return next ? next.sec : Math.max(...L.matches.map((m) => m.sec));
  }
  function matchCard(L, m) {
    const meta = `<div class="meta"><span>${fmtDate(m.date)} ${esc(m.ko || "")}</span><span>${esc(m.stadium || "")}</span></div>`;
    if (m.hg != null) {
      return `<div class="match">${meta}<div class="row"><div class="h">${teamBtn(m.home)}</div>
        <div class="sc">${m.hg} - ${m.ag}</div><div class="a">${teamBtn(m.away)}</div></div>
        ${m.att ? `<div class="meta"><span></span><span>入場者 ${m.att.toLocaleString()}人</span></div>` : ""}</div>`;
    }
    const [lh, la] = J.lambdas(L.model, m);
    const o = J.outcomeProbs(lh, la);
    return `<div class="match">${meta}<div class="row"><div class="h">${teamBtn(m.home)}</div>
      <div class="sc vs">vs</div><div class="a">${teamBtn(m.away)}</div></div>
      <div class="probbar" aria-hidden="true"><div class="pb-h" style="width:${o.h * 100}%"></div><div class="pb-d" style="width:${o.d * 100}%"></div><div class="pb-a" style="width:${o.a * 100}%"></div></div>
      <div class="problbl"><span>ホーム勝 ${pct(o.h)}</span><span>引分 ${pct(o.d)} ・予想 ${o.score[0]}-${o.score[1]}</span><span>アウェイ勝 ${pct(o.a)}</span></div></div>`;
  }
  function viewFixtures(L) {
    const maxSec = Math.max(...L.matches.map((m) => m.sec));
    const sec = state.sec[L.key] || defaultSec(L);
    const items = L.matches.filter((m) => m.sec === sec);
    const opts = []; for (let s = 1; s <= maxSec; s++) opts.push(`<option value="${s}" ${s === sec ? "selected" : ""}>第${s}節</option>`);
    return `<section class="card">
      <h2>日程・結果</h2>
      <p class="lead">未消化の試合は予測（勝・分・負の確率と最も起こりやすいスコア）を表示。</p>
      <div class="secnav"><button data-secstep="-1" ${sec <= 1 ? "disabled" : ""}>◀ 前節</button>
        <select id="secSel" aria-label="節">${opts.join("")}</select>
        <button data-secstep="1" ${sec >= maxSec ? "disabled" : ""}>次節 ▶</button></div>
      ${items.map((m) => matchCard(L, m)).join("")}
    </section>`;
  }

  // ---------- タブ：分析 ----------
  function viewInsight(L) {
    const ln = lines(L);
    const lineCards = ln.map((x) => `<div class="stat"><div class="k">${esc(x.label)}</div><div class="v">${x.p50}<span class="muted" style="font-size:13px"> 勝点</span></div>
      <div class="s">80%の確率で ${x.p10}〜${x.p90}</div></div>`).join("");

    // 注目カード
    const hot = L.impact.filter((x) => x.best).sort((a, b) => b.total - a.total).slice(0, 5).map((x) => {
      const m = L.matches[x.mi], b = x.best;
      return `<div class="hot"><div class="meta muted" style="font-size:11.5px">${fmtDate(m.date)} ${esc(m.ko)}・第${m.sec}節</div>
        <div class="t">${teamBtn(m.home)} vs ${teamBtn(m.away)}</div>
        <div class="x">${esc(m.home)}が勝てば <b>${esc(b.team)}</b> の${esc(b.zone.short)}確率 ${pct(b.ph)}、${esc(m.away)}が勝てば ${pct(b.pa)}</div></div>`;
    }).join("") || `<p class="lead">直近の未消化試合がありません。</p>`;

    // 残り日程の難易度
    const R = L.model.rating;
    const avgR = L.teams.reduce((s, t) => s + R[t], 0) / L.teams.length;
    const diff = L.teams.map((t) => {
      const rest = remaining(L, t);
      const opp = rest.length ? rest.reduce((s, m) => s + R[m.home === t ? m.away : m.home], 0) / rest.length : 0;
      return { t, n: rest.length, opp };
    }).sort((a, b) => b.opp - a.opp);
    const dmin = Math.min(...diff.map((d) => d.opp)), dmax = Math.max(...diff.map((d) => d.opp));
    const diffRows = diff.map((d, i) => `<tr><td class="rank">${i + 1}</td><td class="l">${teamBtn(d.t)}</td><td>${d.n}</td>
      <td>${d.opp.toFixed(2)}</td><td class="hbar-cell"><div class="hbar" style="width:${8 + 92 * (d.opp - dmin) / ((dmax - dmin) || 1)}%"></div></td></tr>`).join("");

    // チーム力
    const power = L.teams.map((t) => {
      const r = L.row[t];
      // 得点・失点のペースから見込まれる勝点ペース（ポアソンで換算）
      const o = r.p ? J.outcomeProbs(r.gf / r.p, r.ga / r.p) : null;
      const xppg = o ? 3 * o.h + o.d : 0;
      return { t, rating: R[t], att: L.model.att[t] * 100, def: 100 / L.model.def[t], ppg: r.p ? r.pts / r.p : 0, xppg };
    }).sort((a, b) => b.rating - a.rating);
    const powRows = power.map((p, i) => {
      const luck = p.ppg - p.xppg;
      return `<tr><td class="rank">${i + 1}</td><td class="l">${teamBtn(p.t)}</td><td class="pts">${p.rating.toFixed(2)}</td>
        <td>${p.att.toFixed(0)}</td><td>${p.def.toFixed(0)}</td><td>${p.ppg.toFixed(2)}</td>
        <td class="luck ${Math.abs(luck) < 0.15 ? "" : luck > 0 ? "up" : "down"}">${luck > 0 ? "+" : ""}${luck.toFixed(2)}</td></tr>`;
    }).join("");

    return `<section class="card"><h2>目安ライン</h2>
      <p class="lead">シミュレーション上、その順位のチームが最終的に取る勝点（中央値）。ここを超えればおおむね目標達成。</p>
      <div class="lines">${lineCards}</div></section>
      <section class="card"><h2>直近の注目カード</h2>
      <p class="lead">勝敗によって優勝・昇格・降格などの確率が大きく動く試合。</p>${hot}</section>
      <section class="card"><h2>残り日程の厳しさ</h2>
      <p class="lead">残り対戦相手の「チーム力」の平均（上ほど厳しい）。リーグ平均は ${avgR.toFixed(2)}。</p>
      <div class="tbl-wrap"><table><thead><tr><th>順</th><th class="l">チーム</th><th>残り</th><th>相手平均</th><th class="l"></th></tr></thead>
      <tbody>${diffRows}</tbody></table></div></section>
      <section class="card"><h2>チーム力ランキング</h2>
      <p class="lead">チーム力＝平均的な相手と戦ったときの1試合あたり期待勝点。攻撃・守備はリーグ平均＝100（守備は高いほど失点が少ない）。
      「差」は実際の勝点ペースと、得点・失点の内容から見込まれる勝点ペースとの差。＋は内容以上に勝点を取れている（接戦に強い・運が良い）、−はその逆で、今後は平均に近づきやすい。</p>
      <div class="tbl-wrap"><table><thead><tr><th>順</th><th class="l">チーム</th><th>チーム力</th><th>攻撃</th><th>守備</th><th>勝点<br>ペース</th><th>差</th></tr></thead>
      <tbody>${powRows}</tbody></table></div></section>`;
  }

  // ---------- チーム詳細 ----------
  function rankChart(L, team) {
    const h = L.hist[team], T = L.teams.length;
    if (!h.length) return `<p class="lead">まだ試合がありません。</p>`;
    const W = 360, H = 180, pl = 30, pr = 8, pt = 8, pb = 20;
    const maxS = Math.max(h[h.length - 1].sec, 5);
    const x = (s) => pl + ((s - 1) / Math.max(1, maxS - 1)) * (W - pl - pr);
    const y = (r) => pt + ((r - 1) / (T - 1)) * (H - pt - pb);
    const bands = L.cfg.zones.filter((z) => z.kind !== "top").map((z) => {
      const cls = z.kind === "down" ? "band-down" : z.kind === "po" ? "band-po" : "band-top";
      return `<rect class="${cls}" x="${pl}" y="${y(z.from) - 4}" width="${W - pl - pr}" height="${y(z.to) - y(z.from) + 8}"/>`;
    }).join("");
    const grid = [1, 5, 10, 15, T].filter((v, i, a) => a.indexOf(v) === i && v <= T)
      .map((r) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(r)}" y2="${y(r)}"/><text x="${pl - 6}" y="${y(r) + 3}" text-anchor="end">${r}位</text>`).join("");
    const step = maxS > 20 ? 5 : maxS > 10 ? 2 : 1;
    const xt = []; for (let s = 1; s <= maxS; s += step) xt.push(`<text x="${x(s)}" y="${H - 6}" text-anchor="middle">${s}</text>`);
    const path = h.map((p, i) => `${i ? "L" : "M"}${x(p.sec)},${y(p.rank)}`).join("");
    const dots = h.map((p) => `<circle class="dot" cx="${x(p.sec)}" cy="${y(p.rank)}" r="4" data-tip="第${p.sec}節：${p.rank}位（勝点${p.pts}）"/>`).join("");
    const hit = h.map((p) => `<circle cx="${x(p.sec)}" cy="${y(p.rank)}" r="12" fill="transparent" data-tip="第${p.sec}節：${p.rank}位（勝点${p.pts}）"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(team)}の順位推移">${bands}${grid}${xt.join("")}<path class="ln" d="${path}"/>${dots}${hit}</svg>`;
  }
  function rankProbChart(L, s, team) {
    const T = L.teams.length, W = 360, H = 110, pl = 2, pb = 16, pt = 14;
    const maxP = Math.max(...Array.from(s.rankP).slice(1));
    const bw = (W - pl * 2) / T;
    let out = "";
    for (let k = 1; k <= T; k++) {
      const p = s.rankP[k], bh = maxP ? (p / maxP) * (H - pb - pt) : 0;
      const bx = pl + (k - 1) * bw;
      out += `<rect class="bar" x="${bx + 1}" y="${H - pb - bh}" width="${bw - 2}" height="${Math.max(bh, p > 0 ? 1 : 0)}" rx="2"/>`;
      out += `<rect x="${bx}" y="0" width="${bw}" height="${H}" fill="transparent" data-tip="${k}位：${pct(p)}"/>`;
      out += `<text x="${bx + bw / 2}" y="${H - 5}" text-anchor="middle">${k}</text>`;
      if (p >= maxP * 0.999 && p > 0) out += `<text x="${bx + bw / 2}" y="${H - pb - bh - 3}" text-anchor="middle" style="fill:var(--ink-2)">${pct(p)}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(team)}の最終順位の確率">${out}</svg>`;
  }
  function openTeam(team) {
    const L = state.L[state.league], r = L.row[team], s = sumOf(L, team);
    const rest = remaining(L, team).sort((a, b) => (a.date + a.ko).localeCompare(b.date + b.ko));
    const restPts = rest.length * 3;
    const lnHtml = lines(L).map((x) => {
      const need = x.p50 - r.pts;
      let msg;
      if (need <= 0) msg = "すでに到達";
      else if (need > restPts) msg = `残り全勝でも届かない（最大 ${r.pts + restPts}）`;
      else msg = `あと <b>${need}</b>（1試合平均 ${(need / rest.length).toFixed(2)}）`;
      return `<tr><td class="l">${esc(x.label)}</td><td>${x.p50}</td><td class="l">${msg}</td></tr>`;
    }).join("");
    const zoneChips = L.cfg.zones.map((z) => `<div class="stat"><div class="k">${esc(z.short)}</div><div class="v">${pct(s.zoneP[z.key])}</div></div>`).join("");
    const restRows = rest.map((m) => {
      const home = m.home === team, opp = home ? m.away : m.home;
      const o = J.outcomeProbs(...J.lambdas(L.model, m));
      const w = home ? o.h : o.a, l = home ? o.a : o.h;
      return `<tr><td class="l">${m.sec}節 ${fmtDate(m.date)}</td><td class="l">${home ? "H" : "A"} ${esc(opp)}</td>
        <td>${L.row[opp].rank}位</td><td>${pct(w)}</td><td>${pct(o.d)}</td><td>${pct(l)}</td></tr>`;
    }).join("");
    const att = L.model.att[team] * 100, def = 100 / L.model.def[team];
    $("#dlgTitle").textContent = `${team}（${L.cfg.name} ${r.rank}位・勝点${r.pts}）`;
    $("#dlgBody").innerHTML = `
      <div class="chips">
        <div class="stat"><div class="k">予想最終勝点</div><div class="v">${s.meanPts.toFixed(0)}</div><div class="s">80%: ${s.p10}〜${s.p90}</div></div>
        <div class="stat"><div class="k">予想平均順位</div><div class="v">${s.meanRank.toFixed(1)}</div></div>
        ${zoneChips}</div>
      <h3>最終順位の確率</h3>${rankProbChart(L, s, team)}
      <h3>順位推移</h3>${rankChart(L, team)}
      <h3>目標までに必要な勝点</h3>
      <div class="tbl-wrap"><table class="rest"><thead><tr><th class="l">目安</th><th>勝点</th><th class="l">${esc(team)}は</th></tr></thead><tbody>${lnHtml}</tbody></table></div>
      <h3>成績の内訳</h3>
      <div class="chips">
        <div class="stat"><div class="k">ホーム</div><div class="v" style="font-size:16px">${r.hw}勝${r.hd}分${r.hl}敗</div></div>
        <div class="stat"><div class="k">アウェイ</div><div class="v" style="font-size:16px">${r.aw}勝${r.ad}分${r.al}敗</div></div>
        <div class="stat"><div class="k">攻撃力</div><div class="v">${att.toFixed(0)}</div><div class="s">1試合 ${(r.p ? r.gf / r.p : 0).toFixed(2)}得点</div></div>
        <div class="stat"><div class="k">守備力</div><div class="v">${def.toFixed(0)}</div><div class="s">1試合 ${(r.p ? r.ga / r.p : 0).toFixed(2)}失点</div></div>
      </div>
      <p class="lead">攻撃力・守備力はリーグ平均＝100（対戦相手の強さを考慮）。</p>
      <h3>残り試合（${rest.length}）</h3>
      <div class="tbl-wrap"><table class="rest"><thead><tr><th class="l">節・日付</th><th class="l">相手</th><th>相手順位</th><th>勝</th><th>分</th><th>負</th></tr></thead><tbody>${restRows}</tbody></table></div>`;
    const dlg = $("#teamDlg");
    if (!dlg.open) dlg.showModal();
    $("#dlgBody").scrollTop = 0;
  }

  // ---------- 描画とイベント ----------
  async function render() {
    location.replace(`#${state.league}/${state.tab}`);
    document.querySelectorAll("#leagueSeg button").forEach((b) => b.setAttribute("aria-selected", b.dataset.league === state.league));
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === state.tab));
    let L = state.L[state.league];
    if (!L) {
      $("#main").innerHTML = `<p class="loading">データ読み込み・シミュレーション中…</p>`;
      await new Promise((r) => setTimeout(r, 20));
      L = await loadLeague(state.league);
    }
    const view = { table: viewTable, predict: viewPredict, fixtures: viewFixtures, insight: viewInsight }[state.tab];
    $("#main").innerHTML = view(L);
    // ページ固有の装飾（night/ の球体など）が描き直せるように知らせる
    document.dispatchEvent(new CustomEvent("league:rendered", { detail: { L } }));
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-team]");
    if (!t) return;
    const L = state.L[state.league];
    if (t.dataset.league) { state.league = t.dataset.league; render(); }
    else if (t.dataset.tab) { state.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }
    else if (t.dataset.team) { openTeam(t.dataset.team); }
    else if (t.dataset.sort) { state.sort = t.dataset.sort; render(); }
    else if (t.dataset.secstep) { state.sec[L.key] = (state.sec[L.key] || defaultSec(L)) + Number(t.dataset.secstep); render(); }
    else if (t.id === "dlgClose") { $("#teamDlg").close(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "secSel") { state.sec[state.league] = Number(e.target.value); render(); }
  });
  $("#teamDlg").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  // ツールチップ（マウスのホバーとタップの両方）
  const tip = $("#tip");
  function showTip(e) {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - w / 2)) + "px";
    tip.style.top = Math.max(8, e.clientY - 40) + "px";
  }
  document.addEventListener("pointermove", showTip);
  document.addEventListener("pointerdown", showTip);
  document.addEventListener("scroll", () => (tip.hidden = true), true);

  // ---------- 起動 ----------
  (async function init() {
    const m = location.hash.match(/^#(j[123])(?:\/(\w+))?/);
    if (m) { state.league = m[1]; if (m[2]) state.tab = m[2]; }
    try {
      state.meta = await fetch(`${DATA}meta.json`, { cache: "no-cache" }).then((r) => r.json());
      $("#season").textContent = state.meta.season;
      $("#updated").textContent = state.meta.updated;
    } catch (e) { /* メタ情報が無くても動かす */ }
    $("#runs").textContent = SC.runs.toLocaleString(); $("#runsHero").textContent = SC.runs.toLocaleString();
    try { await render(); }
    catch (e) { $("#main").innerHTML = `<p class="loading">データを読み込めませんでした（${esc(e.message)}）。</p>`; }
  })();
})();
