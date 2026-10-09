import json, os, sys, urllib.request, urllib.error, concurrent.futures as cf, time
K = os.environ['ELEVENLABS_API_KEY']; D = os.path.dirname(os.path.abspath(__file__))
VOICES = json.load(open(os.path.join(D, 'chosen_voices.json')))
LINES = json.load(open(os.path.join(D, os.environ.get('LINES', 'lines.json')), encoding='utf-8'))
def fnv(t):
    h = 0x811c9dc5
    for c in t: h ^= ord(c); h = (h * 0x01000193) & 0xffffffff
    return f'{h:08x}'
for x in LINES: x['id'] = x['who'] + '_' + fnv(x['who'] + '|' + x['text'])
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
def tts(x):
    fn = os.path.join(OUT, x['id'] + '.mp3')
    if os.path.exists(fn) and os.path.getsize(fn) > 1000: return x['id'], 'exists'
    body = {'text': x.get('say', x['text']), 'model_id': 'eleven_v3', 'voice_settings': {'stability': 0.5, 'similarity_boost': 0.8}}
    for attempt in range(4):
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICES[x['who']]}?output_format=mp3_44100_64", data=json.dumps(body).encode(), headers={'xi-api-key': K, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=180) as r: open(fn, 'wb').write(r.read()); return x['id'], 'ok'
        except urllib.error.HTTPError as e:
            msg = e.read()[:150]
            if e.code in (429, 500, 502, 503): time.sleep(5 * (attempt + 1)); continue
            return x['id'], f'{e.code} {msg}'
        except Exception as e: time.sleep(3); err = str(e)
    return x['id'], 'gave up'
todo = LINES if len(sys.argv) < 3 else [x for x in LINES if x['who'] in sys.argv[2:]]
n = 0
with cf.ThreadPoolExecutor(4) as ex:
    for i, r in ex.map(tts, todo):
        n += 1
        if r not in ('ok', 'exists'): print('FAIL', i, r, flush=True)
        if n % 50 == 0: print(n, 'done', flush=True)
print('finished', n, flush=True)
