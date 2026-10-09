"""Pack the story into one script for index.html: PB.STORY, PB.STORY_ART, PB.STORY_AUDIO.

usage: python build_story.py   (run in the story folder)
- chars/*.png (green screen) -> transparent WebP, 760 px tall
- bgs/*.png -> 640x960 WebP (cover crop)
- voice/sfx: loudness-levelled mono MP3; bgm: seamless 30 s loops
Writes story_data.js.
"""
import base64
import io
import json
import os
import subprocess

import numpy as np
import soundfile as sf
from PIL import Image

SR = 44100


def webp(img, q):
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode(), len(buf.getvalue())


def char(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = g - np.maximum(r, b)
    alpha = np.clip(1 - (spill - 30) / 70, 0, 1)
    a[..., 1] = np.where(spill > 0, np.maximum(r, b) + spill * 0.1, g)  # despill the outline
    ys, xs = np.where(alpha > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([a, alpha * 255])[y0:y1, x0:x1].clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    h = 760
    return webp(img.resize((round(img.width * h / img.height), h), Image.LANCZOS), 84)


def background(path):
    img = Image.open(path).convert('RGB')
    W, H = 640, 960
    s = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - W) // 2, (img.height - H) // 2
    return webp(img.crop((l, t, l + W, t + H)), 74)


def audio(path, kbps, lufs, loop=False):
    tmp = path + '.tmp.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', str(SR),
                    '-af', 'loudnorm=I=%d:TP=-1.5:LRA=11' % lufs, tmp], check=True)
    y, _ = sf.read(tmp)
    if loop:  # cross-fade the tail into the head so it repeats without a seam
        x = int(3.0 * SR)
        body = y[x:].copy()
        r = np.linspace(0, 1, x)
        body[-x:] = body[-x:] * np.sqrt(1 - r) + y[:x] * np.sqrt(r)
        y = body
    sf.write(tmp, y.astype(np.float32), SR, subtype='PCM_16')
    mp3 = path + '.out.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '%dk' % kbps, mp3], check=True)
    data = open(mp3, 'rb').read()
    os.remove(tmp)
    os.remove(mp3)
    return base64.b64encode(data).decode(), len(data)


script = json.load(open('script.json', encoding='utf-8'))
art = {'chars': {}, 'bgs': {}}
snd = {'voice': {}, 'sfx': {}, 'bgm': {}}
total = {}


def add(group, key, val):
    total[group] = total.get(group, 0) + val[1]
    return val[0]


for f in sorted(os.listdir('chars')):
    if f.endswith('.png') and f[:-4] in script['names']:
        art['chars'][f[:-4]] = add('chars', f, char(os.path.join('chars', f)))
for f in sorted(os.listdir('bgs')):
    if f.startswith('bg_') and f.endswith('.png'):
        art['bgs'][f[3:-4]] = add('bgs', f, background(os.path.join('bgs', f)))
for f in sorted(os.listdir('voice')):
    if f.endswith('.mp3'):
        snd['voice'][f[:-4]] = add('voice', f, audio(os.path.join('voice', f), 48, -16))
for f in sorted(os.listdir('sfx')):
    if f.endswith('.mp3') and '.raw' not in f:
        snd['sfx'][f[:-4]] = add('sfx', f, audio(os.path.join('sfx', f), 64, -20))
for f in sorted(os.listdir('bgm')):
    if f.endswith('.mp3') and '.raw' not in f:
        snd['bgm'][f[:-4]] = add('bgm', f, audio(os.path.join('bgm', f), 56, -22, loop=True))

# every referenced asset must exist
need_bg = {n['bg'] for c in script['chapters'] for n in c['nodes'] if 'bg' in n}
need_ch = {w for c in script['chapters'] for n in c['nodes'] if 'show' in n for w in n['show'].values() if w}
need_voice = {n['id'] for c in script['chapters'] for n in c['nodes'] if 'say' in n}
missing = [('bg', x) for x in need_bg - set(art['bgs'])] + [('char', x) for x in need_ch - set(art['chars'])] + \
          [('voice', x) for x in need_voice - set(snd['voice'])]
print('missing:', missing)

with open('story_data.js', 'w', encoding='utf-8') as out:
    out.write('PB.STORY = ' + json.dumps(script, ensure_ascii=False) + ';\n')
    out.write('PB.STORY_ART = ' + json.dumps(art) + ';\n')
    out.write('PB.STORY_AUDIO = ' + json.dumps(snd) + ';\n')
for k, v in total.items():
    print('%-6s %7.0f KB' % (k, v / 1024))
print('story_data.js %.1f MB' % (os.path.getsize('story_data.js') / 1048576))
