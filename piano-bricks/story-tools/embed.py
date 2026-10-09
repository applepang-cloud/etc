"""Put story_data.js into index.html (replacing an earlier copy). usage: python embed.py story_data.js index.html"""
import io
import sys

data = io.open(sys.argv[1], encoding='utf-8').read()
p = sys.argv[2]
s = io.open(p, encoding='utf-8').read()
START = '  <!-- story data (두근두근 뮤직 세션): script, Codex pictures, ElevenLabs voices/effects/music -->\n  <script>\n'
END = '  </script>\n  <!-- /story data -->\n'
block = START + data + END
if START in s:
    a = s.index(START)
    b = s.index(END, a) + len(END)
    s = s[:a] + block + s[b:]
else:
    assert s.count('</body>') == 1
    s = s.replace('</body>', block + '</body>')
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('index.html %.1f MB' % (len(s.encode()) / 1048576))
