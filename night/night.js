// Night 版だけの処理：タブを押したときのスクロール
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);

  // タブを押したら、ヒーローではなく本文の頭を見せる（app.js は先頭へ戻すので、その後に動かす）
  const toMain = () => {
    const y = $("#main").getBoundingClientRect().top + window.scrollY - (window.matchMedia("(max-width: 959px)").matches ? 104 : 16);
    window.scrollTo({ top: y });
  };
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.tab) toMain();
  });
})();
