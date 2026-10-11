// リーグごとの順位ゾーン（2026/27 シーズン）。from〜to は順位。
// kind: top = 上位の目標圏 / po = プレーオフ圏 / down = 降格・入れ替え圏
// 「key」はシミュレーション結果の確率列にも使う。
window.LEAGUE_CONFIG = {
  j1: {
    name: "J1",
    zones: [
      { key: "champ", label: "優勝", short: "優勝", from: 1, to: 1, kind: "top" },
      { key: "down", label: "J2降格（18〜20位）", short: "降格", from: 18, to: 20, kind: "down" },
    ],
    safeRank: 17, // 残留ライン（この順位以内なら残留）
  },
  j2: {
    name: "J2",
    zones: [
      { key: "champ", label: "優勝", short: "優勝", from: 1, to: 1, kind: "top" },
      { key: "up", label: "J1自動昇格（1〜2位）", short: "自動昇格", from: 1, to: 2, kind: "top2" },
      { key: "po", label: "J1昇格プレーオフ（3〜6位）", short: "PO圏", from: 3, to: 6, kind: "po" },
      { key: "down", label: "J3降格（18〜20位）", short: "降格", from: 18, to: 20, kind: "down" },
    ],
    safeRank: 17,
  },
  j3: {
    name: "J3",
    zones: [
      { key: "champ", label: "優勝", short: "優勝", from: 1, to: 1, kind: "top" },
      { key: "up", label: "J2自動昇格（1〜2位）", short: "自動昇格", from: 1, to: 2, kind: "top2" },
      { key: "po", label: "J2昇格プレーオフ（3〜6位）", short: "PO圏", from: 3, to: 6, kind: "po" },
      { key: "down", label: "JFL入れ替え戦の対象（20位・JFLの結果次第）", short: "入替戦", from: 20, to: 20, kind: "down" },
    ],
    safeRank: 19,
    safeLabel: "入替戦回避ライン",
  },
};

// シミュレーション設定
window.SIM_CONFIG = {
  runs: 10000,        // モンテカルロ回数
  seed: 20260807,     // 乱数シード（同じ条件なら同じ結果）
  priorGames: 10,     // 序盤のブレを抑えるため、リーグ平均チームと何試合分混ぜるか
  homePrior: 1.2,     // ホーム有利の事前値（ホーム得点÷アウェイ得点）
  strengthSd: 0.12,   // チーム力の不確かさ（シミュレーション1回ごとに揺らす）
};
