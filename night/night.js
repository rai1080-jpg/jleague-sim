// Night 版だけの装飾：ヒーローの球体（優勝確率の上位チームを玉の大きさで表す）とスクロール
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p) => (p < 0.01 ? "<1" : (p * 100).toFixed(p < 0.1 ? 1 : 0)) + "%";

  // 玉の色と置き場所（球体の中心付近に寄せて並べる。大きい玉から順に使う）
  const COLORS = ["#1f9e6a", "#b8a12a", "#2856c8", "#8a3ad0", "#c0303a"];
  const SLOTS = [[38, 40], [65, 33], [62, 63], [33, 66], [82, 50]];

  function drawOrb(L) {
    const top = L.sum.filter((s) => s.zoneP.champ > 0)
      .sort((a, b) => b.zoneP.champ - a.zoneP.champ).slice(0, 5);
    const max = top.length ? top[0].zoneP.champ : 1;
    // 名前は玉と別の層に置き、ほかの玉に隠れないようにする
    let balls = "", labels = "";
    top.forEach((s, i) => {
      const d = 8 + 14 * Math.sqrt(s.zoneP.champ / max); // 直径（球体の幅に対する%）
      const [x, y] = SLOTS[i];
      balls += `<div class="ball" style="--c:${COLORS[i]};--d:${d}%;left:${x}%;top:${y}%"></div>`;
      labels += `<span class="ball-lbl" style="left:${x}%;top:${y + d / 2}%">${esc(s.team)}<b>${pct(s.zoneP.champ)}</b></span>`;
    });
    $("#orb").innerHTML = balls + labels;
    $("#orbCap").textContent = `${L.cfg.name} 優勝確率 上位${top.length}チーム`;
  }
  document.addEventListener("league:rendered", (e) => drawOrb(e.detail.L));

  // タブを押したら、ヒーローではなく本文の頭を見せる（app.js は先頭へ戻すので、その後に動かす）
  const toMain = () => {
    const y = $("#main").getBoundingClientRect().top + window.scrollY - (window.matchMedia("(max-width: 959px)").matches ? 104 : 16);
    window.scrollTo({ top: y });
  };
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "viewMore" || t.dataset.tab) toMain();
  });
})();
