# 크로마키 초록(#00FF00) 배경을 빼고 투명 webp 로 줄여 저장한다.
#   python tools/key-portrait.py 원본.png 결과.webp [높이=900]
# 초록이 다른 색보다 얼마나 센지로 투명도를 정하고, 가장자리에 번진 초록은 빼 준다(despill).
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
height = int(sys.argv[3]) if len(sys.argv) > 3 else 900

im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
excess = g - np.maximum(r, b)  # 초록이 얼마나 튀는지
# 25 이하는 완전 불투명, 90 이상은 완전 투명, 사이는 부드럽게
alpha = 1 - np.clip((excess - 25) / (90 - 25), 0, 1)
# 번진 초록 빼기: 초록을 빨강·파랑 중 큰 값 근처로 눌러 준다
g2 = np.where(excess > 0, np.maximum(r, b) + np.minimum(excess, 0) * 0, g)
g2 = np.minimum(g, np.maximum(r, b) + 6)
out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')

# 투명한 가장자리를 잘라 내고(위·좌우만, 아래는 몸이 이어지게 둔다) 높이를 맞춘다
bbox = img.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
if bbox:
    l, t, rr, bb = bbox
    pad = 8
    img = img.crop((max(0, l - pad), max(0, t - pad), min(img.width, rr + pad), img.height))
w = round(img.width * height / img.height)
img = img.resize((w, height), Image.LANCZOS)
img.save(dst, 'WEBP', quality=86, method=6)
print(dst, img.size)
