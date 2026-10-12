"""Turn a character's Codex pictures into animation parts for the story player.

from char_parts import char_parts; char_parts(folder) -> dict for PB.STORY_ART.chars[who]
folder holds base.png (green screen) and optional eyes_closed.png, mouth_e.png, mouth_a.png, mouth_o.png, hair_mask.png.
- base: keyed to transparency, cropped to the figure, 760 px tall (WebP)
- eyes / e / a / o: only the region that differs from the base (after aligning the edit to it), feathered,
  as {src, x, y, w, h} in base pixels; an edit that changed too much is dropped
- hair: the base picture limited to the hair mask (it sways in the game)
"""
import base64
import io
import os

import numpy as np
from PIL import Image
from scipy import ndimage

TARGET_H = 760


def webp(arr_rgba, q=84):
    buf = io.BytesIO()
    Image.fromarray(arr_rgba.clip(0, 255).astype(np.uint8), 'RGBA').save(buf, 'WEBP', quality=q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32)


def key_green(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = g - np.maximum(r, b)
    alpha = np.clip(1 - (spill - 30) / 70, 0, 1)
    out = a.copy()
    out[..., 1] = np.where(spill > 0, np.maximum(r, b) + spill * 0.1, g)
    return out, alpha


def align_to(base, img):
    """Edits sometimes zoom or nudge the whole picture: match features (ORB) and warp img onto base
    with a similarity transform (scale, rotation, shift). Falls back to a plain shift."""
    try:
        import cv2
        g1 = cv2.cvtColor(base.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        g2 = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        orb = cv2.ORB_create(4000)
        k1, d1 = orb.detectAndCompute(g1, None)
        k2, d2 = orb.detectAndCompute(g2, None)
        matches = sorted(cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d2, d1), key=lambda m: m.distance)[:800]
        src = np.float32([k2[m.queryIdx].pt for m in matches])
        dst = np.float32([k1[m.trainIdx].pt for m in matches])
        M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
        if M is not None and inl is not None and inl.sum() > 40:
            h, w = g1.shape
            return cv2.warpAffine(img.astype(np.float32), M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    except Exception as e:  # noqa: BLE001
        print('  align fallback:', e)
    return shift_to(base, img)


def shift_to(base, img):
    """Estimate how far img is shifted from base (phase correlation on a small grey copy) and undo it."""
    def grey(x):
        im = Image.fromarray(x.astype(np.uint8)).convert('L').resize((256, 384))
        return np.asarray(im).astype(np.float32)
    A, B = np.fft.fft2(grey(base)), np.fft.fft2(grey(img))
    R = A * np.conj(B)
    r = np.fft.ifft2(R / (np.abs(R) + 1e-9)).real
    dy, dx = np.unravel_index(np.argmax(r), r.shape)
    if dy > r.shape[0] // 2:
        dy -= r.shape[0]
    if dx > r.shape[1] // 2:
        dx -= r.shape[1]
    sy, sx = base.shape[0] / 384, base.shape[1] / 256
    dy, dx = int(round(dy * sy)), int(round(dx * sx))
    if abs(dy) > 40 or abs(dx) > 40:
        return img
    return np.roll(np.roll(img, dy, axis=0), dx, axis=1)


def patch(base, edit, alpha, box_top_frac=0.5):
    """The region where edit differs from base (largest blob in the upper part), feathered."""
    edit = align_to(base, edit)
    diff = np.abs(edit - base).mean(axis=2) * (alpha > 0.5)
    diff = ndimage.gaussian_filter(diff, 3)
    mask = diff > 18
    H = mask.shape[0]
    mask[int(H * box_top_frac):] = False
    lab, n = ndimage.label(mask)
    if not n:
        return None
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    # the biggest changed area, plus others of similar size at the same height (both eyes)
    big = int(np.argmax(sizes))
    cys = [c[0] for c in ndimage.center_of_mass(mask, lab, range(1, n + 1))]
    keep = [i + 1 for i in range(n) if sizes[i] >= 0.2 * sizes[big] and abs(cys[i] - cys[big]) < 0.05 * H]
    blob = np.isin(lab, keep)
    ys, xs = np.where(blob)
    pad = 14
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(mask.shape[1], xs.max() + pad)
    if (y1 - y0) * (x1 - x0) > 0.06 * mask.size:  # the edit changed far too much: not a clean eye/mouth edit
        return None
    soft = ndimage.gaussian_filter(ndimage.binary_dilation(blob, iterations=8).astype(np.float32), 5)
    a = np.clip(soft * 1.4, 0, 1) * alpha
    rgba = np.dstack([edit, a * 255])[y0:y1, x0:x1]
    return rgba, (x0, y0, x1 - x0, y1 - y0)


def char_parts(folder):
    base_rgb = load(os.path.join(folder, 'base.png'))
    base_rgb, alpha = key_green(base_rgb)
    ys, xs = np.where(alpha > 0.5)
    cy0, cy1, cx0, cx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    scale = TARGET_H / (cy1 - cy0)

    def fit(rgba):  # crop to the figure box and scale to the target height
        im = Image.fromarray(rgba.clip(0, 255).astype(np.uint8), 'RGBA')
        w, h = im.size
        return np.asarray(im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)).astype(np.float32)

    full = np.dstack([base_rgb, alpha * 255])
    base_fit = fit(full[cy0:cy1, cx0:cx1])
    out = {'base': webp(base_fit), 'w': int(base_fit.shape[1]), 'h': int(base_fit.shape[0])}

    for key, name in (('eyes', 'eyes_closed.png'), ('e', 'mouth_e.png'), ('a', 'mouth_a.png'), ('o', 'mouth_o.png')):
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            continue
        edit = load(path)
        if edit.shape != base_rgb.shape:
            edit = np.asarray(Image.fromarray(edit.astype(np.uint8)).resize((base_rgb.shape[1], base_rgb.shape[0]))).astype(np.float32)
        res = patch(base_rgb, edit, alpha)
        if not res:
            print('  skip', name, '(edit changed too much or nothing)')
            continue
        rgba, (x, y, w, h) = res
        out[key] = {'src': webp(fit(rgba)), 'x': round((x - cx0) * scale, 1), 'y': round((y - cy0) * scale, 1),
                    'w': round(w * scale, 1), 'h': round(h * scale, 1)}

    mpath = os.path.join(folder, 'hair_mask.png')
    if os.path.exists(mpath):
        m = np.asarray(Image.open(mpath).convert('L').resize((base_rgb.shape[1], base_rgb.shape[0]))).astype(np.float32) / 255
        m = ndimage.gaussian_filter((m > 0.5).astype(np.float32), 1.5) * alpha
        if 0.02 < m.mean() < 0.5:
            out['hair'] = webp(fit(np.dstack([base_rgb, m * 255])[cy0:cy1, cx0:cx1]))
        else:
            print('  skip hair mask (covers %.0f%%)' % (m.mean() * 100))
    return out
