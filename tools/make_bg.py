"""ダーク版の背景の「線」の層（night/bg-lines.svg）を作る。色のにじみは CSS（night/style.css の .bg）で描いて動かす。

使い方: python tools/make_bg.py
"""
import math
from pathlib import Path

W, H = 1600, 1000
OUT = Path(__file__).resolve().parent.parent / "night" / "bg-lines.svg"

out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">',
       '<defs><linearGradient id="ln" x1="0" y1="1" x2="1" y2="0">'
       '<stop offset="0" stop-color="#c4e04a"/><stop offset=".35" stop-color="#2bc4b4"/>'
       '<stop offset=".7" stop-color="#7c6cf0"/><stop offset="1" stop-color="#c040c8"/></linearGradient></defs>']

# 流れる線の束（左下から右上へ、少しずつずらした曲線）
paths = []
for k in range(28):
    t = k / 27
    pts = []
    for j in range(41):
        u = j / 40
        x = -100 + u * (W + 200)
        y = (H * 1.05 - u * H * .75 - t * 260
             + 90 * math.sin(u * math.pi * 1.6 + t * 1.8)
             + 40 * math.sin(u * math.pi * 4.2 - t * 2.4))
        pts.append((x, y))
    d = f"M{pts[0][0]:.0f},{pts[0][1]:.0f}" + "".join(f"L{x:.0f},{y:.0f}" for x, y in pts[1:])
    op = .06 + .16 * math.sin(t * math.pi)  # 束の中央ほど少し濃く
    paths.append(f'<path d="{d}" stroke-opacity="{op:.3f}"/>')
out.append('<g fill="none" stroke="url(#ln)" stroke-width="1.2">' + "".join(paths) + '</g>')

# 右上の大きな円弧（細い線）
for r, op in ((380, .26), (450, .14), (530, .08)):
    out.append(f'<circle cx="1300" cy="360" r="{r}" fill="none" stroke="url(#ln)" stroke-width="1" stroke-opacity="{op}"/>')

# 細かな点
dots = []
for k in range(70):
    x, y = (k * 397) % W, (k * 613 + 120) % H
    dots.append(f'<circle cx="{x}" cy="{y}" r="{1 + (k % 3) * .6:.1f}"/>')
out.append('<g fill="#fff" fill-opacity=".2">' + "".join(dots) + '</g>')
out.append('</svg>')
OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
print("wrote", OUT)
