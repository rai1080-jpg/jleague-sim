"""ホーム画面用アイコン（PNG）を作る。ロゴマーク＝センターサークル＋勝点の推移（実線＝これまで、点線＝予測、点＝最終順位）。

使い方: python tools/make_icons.py
  icons/        … ライト版（青灰の地・墨色・珊瑚色の点）
  night/icons/  … ダーク版（黒地・虹色のグラデーション）
Android は外側が丸や角丸に切り抜かれるので、マークは中央の安全圏（直径80%）に収める。
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SS = 4  # 4倍で描いて縮小し、線のふちを滑らかにする
GRAD = [(0, (196, 224, 74)), (.35, (43, 196, 180)), (.7, (124, 108, 240)), (1, (192, 64, 200))]  # 黄緑→青緑→すみれ→紫


def lerp(stops, t):
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            u = (t - t0) / (t1 - t0) if t1 > t0 else 0
            return tuple(round(a + (b - a) * u) for a, b in zip(c0, c1))
    return stops[-1][1]


def gradient(n, box=None):
    """左下→右上の斜めグラデーション。box=(x0, y0, x1, y1) の範囲で端から端まで色が変わる"""
    x0, y0, x1, y1 = box or (0, 0, n, n)
    w = 256  # 小さく作って拡大（なめらかで速い）
    small = Image.new("RGB", (w, w))
    px = small.load()
    for y in range(w):
        for x in range(w):
            px[x, y] = lerp(GRAD, (x + (w - 1 - y)) / (2 * (w - 1)))
    img = Image.new("RGB", (n, n), GRAD[0][1])
    img.paste(small.resize((round(x1 - x0), round(y1 - y0)), Image.BICUBIC), (round(x0), round(y0)))
    return img


def glow(n, cx, cy, r, color, alpha):
    """背景のにじみ（ダーク版のみ）。中心から外へなめらかに薄くなる円"""
    w = 128  # 小さく計算して拡大する
    small = Image.new("L", (w, w), 0)
    px = small.load()
    for y in range(w):
        for x in range(w):
            d = math.hypot(x - (w - 1) / 2, y - (w - 1) / 2) / (w / 2)  # 中心0〜ふち1
            px[x, y] = round(alpha * max(0.0, 1 - d) ** 2)
    fall = small.resize((round(2 * r), round(2 * r)), Image.BICUBIC)
    a = Image.new("L", (n, n), 0)
    a.paste(fall, (round(cx - r), round(cy - r)))
    layer = Image.new("RGBA", (n, n), color + (0,))
    layer.putalpha(a)
    return layer


def draw_icon(size, dark, scale=.62):
    n = size * SS
    bg = (0, 0, 0) if dark else (227, 235, 235)
    img = Image.new("RGBA", (n, n), bg + (255,))
    if dark:
        for cx, cy, r, c, a in ((.8, .18, .6, (124, 108, 240), 150), (.95, .95, .5, (43, 196, 180), 90), (.05, 1, .45, (192, 64, 200), 70)):
            img = Image.alpha_composite(img, glow(n, cx * n, cy * n, r * n, c, a))
    # マークの座標（40×40）をアイコンの中央に置く
    k = n * scale / 40
    o = (n - 40 * k) / 2
    P = lambda x, y: (o + x * k, o + y * k)  # noqa: E731
    ring_w, line_w = 2.4 * k, 3.0 * k

    def ring_mask():
        m = Image.new("L", (n, n), 0)
        d = ImageDraw.Draw(m)
        (x0, y0), (x1, y1) = P(2.5, 2.5), P(37.5, 37.5)
        d.ellipse([x0, y0, x1, y1], outline=255, width=round(ring_w))
        return m

    def dot_mask():
        m = Image.new("L", (n, n), 0)
        cx, cy = P(29.5, 13.4)
        r = 3.6 * k
        ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
        return m

    ink = (255, 255, 255) if dark else (26, 26, 26)
    box = (*P(2.5, 2.5), *P(37.5, 37.5))  # 円の範囲でグラデーションが一巡するように
    accent = gradient(n, box) if dark else Image.new("RGB", (n, n), (229, 108, 94))
    ring_src = gradient(n, box) if dark else Image.new("RGB", (n, n), ink)
    img.paste(ring_src, (0, 0), ring_mask())

    d = ImageDraw.Draw(img)
    pts = [P(9, 26.5), P(15.5, 21.5), P(21, 24)]
    d.line(pts, fill=ink, width=round(line_w), joint="curve")
    for x, y in pts:  # 線の端と角を丸く
        d.ellipse([x - line_w / 2, y - line_w / 2, x + line_w / 2, y + line_w / 2], fill=ink)
    # 点線（予測）
    (ax, ay), (bx, by) = P(21, 24), P(28.6, 14.3)
    dist = math.hypot(bx - ax, by - ay)
    step = 4.6 * k
    t = step
    while t < dist - step * .4:
        x, y = ax + (bx - ax) * t / dist, ay + (by - ay) * t / dist
        d.ellipse([x - line_w / 2, y - line_w / 2, x + line_w / 2, y + line_w / 2], fill=ink)
        t += step
    img.paste(accent, (0, 0), dot_mask())
    return img.convert("RGB").resize((size, size), Image.LANCZOS)


def main():
    for dark, folder in ((False, ROOT / "icons"), (True, ROOT / "night" / "icons")):
        folder.mkdir(parents=True, exist_ok=True)
        draw_icon(180, dark).save(folder / "apple-touch-icon.png", optimize=True)          # iPhone
        draw_icon(192, dark).save(folder / "icon-192.png", optimize=True)                  # Android
        draw_icon(512, dark).save(folder / "icon-512.png", optimize=True)
        draw_icon(512, dark, scale=.5).save(folder / "icon-maskable-512.png", optimize=True)  # 丸く切り抜かれても欠けない版
        print("wrote", folder)
    # 確認用：4種類を並べた一覧
    sheet = Image.new("RGB", (4 * 200 + 50, 2 * 200 + 30), (128, 128, 128))
    for row, dark in enumerate((False, True)):
        for col, (s, sc) in enumerate(((180, .62), (192, .62), (512, .62), (512, .5))):
            im = draw_icon(s, dark, sc).resize((180, 180), Image.LANCZOS)
            sheet.paste(im, (10 + col * 210, 10 + row * 210))
    sheet.save(ROOT / "tools" / "icons-preview.png")


if __name__ == "__main__":
    main()
