"""덤벨 아이콘 생성 (180/192/512 PNG). 실행: python tools/make_icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
S = 1024
BG = "#0b0d10"
GREEN = "#4ade80"
DARK_GREEN = "#22c55e"
BAR = "#d1fae5"


def rect(d, cx, cy, w, h, r, fill):
    d.rounded_rectangle((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), radius=r, fill=fill)


def draw():
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    d.ellipse((112, 112, 912, 912), fill="#132a1c")
    cx, cy = S / 2, S / 2
    rect(d, cx, cy, 440, 56, 22, BAR)                 # 손잡이 바
    for sgn in (-1, 1):
        rect(d, cx + sgn * 215, cy, 74, 340, 22, GREEN)       # 큰 원판
        rect(d, cx + sgn * 288, cy, 62, 250, 20, DARK_GREEN)  # 작은 원판
        rect(d, cx + sgn * 340, cy, 34, 96, 12, BAR)          # 끝 고정쇠
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    big = draw()
    for size in (180, 192, 512):
        big.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon-{size}.png"), optimize=True)
        print("saved", f"icon-{size}.png")


if __name__ == "__main__":
    main()
