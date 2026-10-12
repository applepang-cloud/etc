# 크로마키 초록 배경에 여러 그림을 그린 시트를 잘라 낱장 투명 webp 로 저장한다.
#   python tools/slice-sheet.py 시트.png 개수 출력접두어 크기
# 배경을 뺀 뒤 이어진 덩어리를 찾아 큰 것부터 개수만큼 고르고, 위→아래·왼→오른 순서로 번호를 붙인다.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, count, prefix, size = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])

im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
excess = g - np.maximum(r, b)
alpha = 1 - np.clip((excess - 25) / (90 - 25), 0, 1)
g2 = np.minimum(g, np.maximum(r, b) + 6)
rgba = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)

mask = alpha > 0.5
mask = ndimage.binary_closing(mask, iterations=3)
labels, n = ndimage.label(mask)
objs = ndimage.find_objects(labels)
areas = ndimage.sum(mask, labels, range(1, n + 1))
order = np.argsort(areas)[::-1][:count]
boxes = [objs[i] for i in order]
if len(boxes) < count:
    sys.exit(f'{src}: 덩어리 {len(boxes)}개뿐 (필요 {count})')
# 줄 단위로 정렬: 세로 중심이 비슷하면 같은 줄
rowh = np.median([b[0].stop - b[0].start for b in boxes])
boxes.sort(key=lambda b: (round(((b[0].start + b[0].stop) / 2) / rowh), (b[1].start + b[1].stop) / 2))

img = Image.fromarray(rgba, 'RGBA')
for i, (ys, xs) in enumerate(boxes):
    pad = 4
    crop = img.crop((max(0, xs.start - pad), max(0, ys.start - pad), min(img.width, xs.stop + pad), min(img.height, ys.stop + pad)))
    side = max(crop.width, crop.height)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    sq = sq.resize((size, size), Image.LANCZOS)
    out = f'{prefix}{i}.webp'
    sq.save(out, 'WEBP', quality=88, method=6)
    print(out, crop.size)
