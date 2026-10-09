# voice/*.mp3 -> lips.json {id: "0 1 e a o A" per 50 ms}: loudness picks how open, spectral centroid picks e / a / o
import subprocess, os, json, glob
import numpy as np
SR, HOP = 16000, 800
out = {}
for fn in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'voice', '*.mp3'))):
    vid = os.path.basename(fn)[:-4]
    if vid.startswith('me_'): continue
    x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'quiet', '-i', fn, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout, np.float32)
    n = len(x) // HOP
    if n < 2: continue
    fr = x[:n * HOP].reshape(n, HOP); rms = np.sqrt((fr ** 2).mean(1))
    spec = np.abs(np.fft.rfft(fr * np.hanning(HOP), axis=1)); f = np.fft.rfftfreq(HOP, 1 / SR); band = (f > 200) & (f < 4000)
    cen = (spec[:, band] * f[band]).sum(1) / (spec[:, band].sum(1) + 1e-9)
    ref = np.percentile(rms, 95) + 1e-9; lv = rms / ref
    lv = np.convolve(lv, [0.25, 0.5, 0.25], 'same')  # soften frame-to-frame jitter
    voiced = lv >= 0.3; lo, hi = (np.percentile(cen[voiced], [33, 66]) if voiced.sum() > 3 else (1200, 1800))
    s = ''
    for v, c in zip(lv, cen):
        if v < 0.12: s += '0'
        elif v < 0.3: s += '1'
        elif v >= 0.85: s += 'A'
        else: s += 'o' if c < lo else 'e' if c > hi else 'a'
    out[vid] = s
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lips.json'), 'w'), separators=(',', ':'))
allc = ''.join(out.values()); print(len(out), 'files', len(json.dumps(out)) // 1024, 'KB', {c: allc.count(c) for c in '01eaoA'}); print(list(out.items())[0])
