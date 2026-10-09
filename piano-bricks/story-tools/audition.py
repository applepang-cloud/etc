"""Voice audition: sample one line per story role with several ElevenLabs voices, and build a page
to listen and pick (served by codex-bridge.mjs at http://localhost:8788/voices).

usage: python audition.py      (run in piano-bricks/story-tools; needs ELEVENLABS_API_KEY)
Writes audition/<role>_<voice>.mp3 and audition/voices.html (both git-ignored).
The page saves the picks to voice-choice.json through the bridge (POST /voice-choice).
"""
import base64
import html
import json
import os
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["ELEVENLABS_API_KEY"]
OUT = "audition"

V = {  # voice id: (name, short description)
    "srhGhMYcxqeTNVuSRvWg": ("AF-Sora-Junho", "젊은 남성 · 차분함"),
    "IAETYMYM3nJvjnlkVTKI": ("AF-Duri-Deoksu", "젊은 남성 · 자신감"),
    "v1jVu1Ky28piIPEJqRrm": ("David (Warm)", "젊은 남성 · 따뜻함"),
    "gJSDQIpSQ56NBGhorBfg": ("David (Calm)", "젊은 남성 · 또렷함"),
    "WmbZPt6ei1sctzqPHrGr": ("PB 강태준", "직접 만든 목소리"),
    "pb3lVZVjdFWbkhPKlelB": ("Harry Kim", "중년 남성 · 대화체"),
    "s07IwTCOrCDCaETjUVjx": ("Hyunbin", "중년 남성 · 신중함"),
    "UmYoqGlufKxhJ6NCx5Mv": ("KO Jang Ho", "노년 남성 · 허스키"),
    "jB1Cifc2UQbq1gR3wnb0": ("Bin", "중년 남성 · 진중함"),
    "BNr4zvrC1bGIdIstzjFQ": ("KO Harry Kim", "중년 남성 · 이야기꾼"),
    "ZJCNdZEjYwkOElxugmW2": ("Hyuk", "중년 남성 · 차가움"),
    "bQlkYuipD5BHEhntA5iz": ("AF-Rara-JY", "젊은 여성 · 밝음"),
    "8jHHF8rMqMlg8if2mOUe": ("Han", "젊은 여성 · 대화체"),
    "lKmpLuKb4TMrZnFZ0EI9": ("AF-Moka-Ivy", "젊은 여성 · 차분함"),
    "wS36Z5Rg7em6Gl0vlhBo": ("PB 윤채아", "직접 만든 목소리"),
    "yIiJDIlA4V9TvoOO12TS": ("Emily", "젊은 여성 · 지적임"),
    "uyVNoMrnUku1dZyVEXwD": ("Anna Kim", "젊은 여성 · 부드러움"),
    "ZjAPD4f11zlnEnZpKDgo": ("KO Haemi", "노년 여성 · 편안함"),
}
# role: (shown name, who they are, sample line, candidate voices; the first is the current voice)
ROLES = {
    "haru": ("윤하루", "주인공 · 21세 피아니스트", "점의 높이는 음높이고요. 이건 글자가 아니라 악보예요!",
             ["srhGhMYcxqeTNVuSRvWg", "IAETYMYM3nJvjnlkVTKI", "v1jVu1Ky28piIPEJqRrm", "gJSDQIpSQ56NBGhorBfg", "WmbZPt6ei1sctzqPHrGr", "pb3lVZVjdFWbkhPKlelB"]),
    "mira": ("강미라", "22세 에이스 파일럿 · 밝고 거침없음", "강미라, 스카이라크 출격합니다! 걱정 마세요, 함장님. 금방 돌아올게요.",
             ["bQlkYuipD5BHEhntA5iz", "8jHHF8rMqMlg8if2mOUe", "lKmpLuKb4TMrZnFZ0EI9", "wS36Z5Rg7em6Gl0vlhBo", "yIiJDIlA4V9TvoOO12TS"]),
    "captain": ("서진혁 함장", "52세 함장 · 침착하고 단호함", "전 함대에 알린다. 전투를 종료한다. 음악이 이겼다.",
                ["s07IwTCOrCDCaETjUVjx", "UmYoqGlufKxhJ6NCx5Mv", "jB1Cifc2UQbq1gR3wnb0", "pb3lVZVjdFWbkhPKlelB", "BNr4zvrC1bGIdIstzjFQ"]),
    "noa": ("노아 박사", "34세 고고학자 · 차분하고 호기심 많음", "별의 석판. 저 외계인들의 조상, 고대 아우라인이 남긴 유물이에요.",
            ["yIiJDIlA4V9TvoOO12TS", "uyVNoMrnUku1dZyVEXwD", "lKmpLuKb4TMrZnFZ0EI9", "8jHHF8rMqMlg8if2mOUe", "wS36Z5Rg7em6Gl0vlhBo"]),
    "garon": ("가론", "외계 남족 사령관 · 감정 없는 전사 (울림 효과)", "실피아가 배신했다. 인간의 소리가 우리를 약하게 만든다. 모두 쓸어버려라.",
              ["UmYoqGlufKxhJ6NCx5Mv", "ZJCNdZEjYwkOElxugmW2", "jB1Cifc2UQbq1gR3wnb0", "s07IwTCOrCDCaETjUVjx", "IAETYMYM3nJvjnlkVTKI"]),
    "ella": ("엘라", "외계 여족 사령관 · 차갑고 날카로움 (울림 효과)", "나는 실피아 함대 사령관 엘라. 그 노래를 다시 들려 다오. 명령이 아니다. 부탁이다.",
             ["uyVNoMrnUku1dZyVEXwD", "yIiJDIlA4V9TvoOO12TS", "lKmpLuKb4TMrZnFZ0EI9", "ZjAPD4f11zlnEnZpKDgo", "wS36Z5Rg7em6Gl0vlhBo"]),
    "narr": ("내레이션", "이야기를 들려주는 목소리", "2089년. 인류 이민 선단의 기함, 우주전함 하모니아호는 태양계 끝자락을 지나고 있었다.",
             ["jB1Cifc2UQbq1gR3wnb0", "s07IwTCOrCDCaETjUVjx", "uyVNoMrnUku1dZyVEXwD", "BNr4zvrC1bGIdIstzjFQ", "gJSDQIpSQ56NBGhorBfg"]),
    "pa": ("함내 방송", "전함 안내 방송 (무전 효과)", "전 함에 알린다! 정체불명의 함대가 접근 중! 전투 배치!",
           ["gJSDQIpSQ56NBGhorBfg", "pb3lVZVjdFWbkhPKlelB", "ZJCNdZEjYwkOElxugmW2", "v1jVu1Ky28piIPEJqRrm"]),
}
# delivery tag for each sample line (eleven_v3, same as the game)
SAMPLE_TONE = {"haru": "excited realization", "mira": "excited, confident", "captain": "relieved, proud", "noa": "awed, quietly",
               "garon": "cold, furious", "ella": "cold and proud, then softer", "narr": "calm, cinematic narration", "pa": "urgent"}
SETTINGS = {"narr": (0.55, 0.25), "pa": (0.6, 0.2), "haru": (0.45, 0.4), "mira": (0.35, 0.6), "captain": (0.55, 0.3),
            "noa": (0.5, 0.35), "garon": (0.6, 0.3), "ella": (0.55, 0.3)}
FX = {
    "garon": "asetrate=44100*0.93,aresample=44100,aecho=0.8:0.6:35|70:0.35|0.2",
    "ella": "aecho=0.8:0.55:28|56:0.3|0.18,highshelf=f=6000:g=3",
    "pa": "highpass=f=350,lowpass=f=3400,acompressor=threshold=-18dB:ratio=4",
}


def sample(job):
    role, vid = job
    out = os.path.join(OUT, "%s_%s.mp3" % (role, vid))
    if os.path.exists(out):
        return out
    body = {"text": "[%s] %s" % (SAMPLE_TONE[role], ROLES[role][2]), "model_id": "eleven_v3", "voice_settings": {"stability": 0.5}}
    req = urllib.request.Request("https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=mp3_44100_128" % vid,
                                 data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    tmp = out + ".raw.mp3"
    open(tmp, "wb").write(raw)
    af = "silenceremove=start_periods=1:start_threshold=-45dB" + ("," + FX[role] if role in FX else "") + ",loudnorm=I=-16:TP=-1.5"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-ac", "1", "-ar", "44100", "-af", af, "-b:a", "64k", out], check=True)
    os.remove(tmp)
    return out


def page():
    choice = {}
    if os.path.exists("voice-choice.json"):
        choice = json.load(open("voice-choice.json", encoding="utf-8"))
    cards = []
    for role, (name, about, line, voices) in ROLES.items():
        rows = []
        for i, vid in enumerate(voices):
            data = base64.b64encode(open(os.path.join(OUT, "%s_%s.mp3" % (role, vid)), "rb").read()).decode()
            vname, vdesc = V[vid]
            checked = (choice.get(role) or voices[0]) == vid
            rows.append(
                '<label class="row"><input type="radio" name="%s" value="%s"%s>'
                '<span class="vn">%s%s</span><span class="vd">%s</span>'
                '<button type="button" class="play" data-src="data:audio/mpeg;base64,%s">▶ 듣기</button></label>'
                % (role, vid, " checked" if checked else "", html.escape(vname),
                   ' <em>현재</em>' if i == 0 else "", html.escape(vdesc), data))
        cards.append('<section class="card"><h2>%s <small>%s</small></h2><p class="line">“%s”</p>%s</section>'
                     % (html.escape(name), html.escape(about), html.escape(line), "".join(rows)))
    return PAGE.replace("{{CARDS}}", "\n".join(cards)).replace("{{ROLES}}", json.dumps(list(ROLES)))


PAGE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>캐릭터 목소리 고르기</title>
<style>
:root { --bg: #0b0d16; --panel: #171b2b; --line: rgba(255,255,255,0.12); --ink: #f2f3f7; --dim: #9aa0b4; --accent: #f5c518; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 24px 16px 120px; }
h1 { margin: 0 0 4px; font-size: 26px; }
.sub { margin: 0 0 20px; color: var(--dim); }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px; margin-bottom: 16px; }
.card h2 { margin: 0; font-size: 20px; }
.card h2 small { font-size: 13px; color: var(--dim); font-weight: 500; margin-left: 6px; }
.line { margin: 8px 0 12px; color: #d6dcff; font-style: italic; }
.row { display: grid; grid-template-columns: 24px 1fr auto; grid-template-areas: "r n p" "r d p"; align-items: center; gap: 0 10px;
  padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; margin-top: 8px; cursor: pointer; }
.row:has(input:checked) { border-color: var(--accent); background: rgba(245,197,24,0.08); }
.row input { grid-area: r; width: 18px; height: 18px; accent-color: var(--accent); }
.vn { grid-area: n; font-weight: 700; }
.vn em { font-style: normal; font-size: 12px; color: #151515; background: var(--accent); border-radius: 6px; padding: 1px 6px; margin-left: 4px; }
.vd { grid-area: d; font-size: 13px; color: var(--dim); }
.play { grid-area: p; border: 0; border-radius: 999px; padding: 8px 14px; background: #2b3352; color: var(--ink); font: inherit; font-size: 14px; cursor: pointer; }
.play.on { background: var(--accent); color: #151515; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; background: rgba(11,13,22,0.95); border-top: 1px solid var(--line); padding: 12px 16px; }
.bar div { max-width: 720px; margin: 0 auto; display: flex; gap: 12px; align-items: center; }
.save { flex: none; white-space: nowrap; border: 0; border-radius: 999px; padding: 12px 22px; background: var(--accent); color: #151515; font: inherit; font-weight: 800; cursor: pointer; }
#msg { color: var(--dim); font-size: 14px; }
</style></head><body><main>
<h1>캐릭터 목소리 고르기</h1>
<p class="sub">두근두근 뮤직 세션 — 별의 석판 · 인물마다 같은 대사를 후보 목소리로 들어 보고 고르세요. 「현재」는 지금 게임에 들어간 목소리예요.</p>
{{CARDS}}
</main>
<div class="bar"><div><button class="save" id="save" type="button">선택 저장</button><span id="msg">고른 뒤 저장을 누르면 Claude가 그 목소리로 대사를 다시 만들어요.</span></div></div>
<script>
const audio = new Audio();
let current = null;
document.querySelectorAll('.play').forEach((b) => b.addEventListener('click', (e) => {
  e.preventDefault();
  if (current === b && !audio.paused) { audio.pause(); b.classList.remove('on'); return; }
  if (current) current.classList.remove('on');
  audio.src = b.dataset.src; audio.play(); current = b; b.classList.add('on');
  b.closest('.row').querySelector('input').checked = true;
}));
audio.addEventListener('ended', () => current && current.classList.remove('on'));
document.getElementById('save').addEventListener('click', async () => {
  const pick = {};
  {{ROLES}}.forEach((r) => { const c = document.querySelector('input[name="' + r + '"]:checked'); if (c) pick[r] = c.value; });
  const msg = document.getElementById('msg');
  try {
    const r = await fetch('http://127.0.0.1:8788/voice-choice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pick) });
    if (!r.ok) throw new Error();
    msg.textContent = '저장했어요! Claude에게 "목소리 골랐어"라고 말해 주세요.';
    msg.style.color = '#8fe3a2';
  } catch (e) {
    msg.textContent = '저장하지 못했어요. Piano Bricks 창(codex-bridge.cmd)이 켜져 있는지 확인해 주세요.';
    msg.style.color = '#ff9a8a';
  }
});
</script></body></html>
"""

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    jobs = [(r, v) for r, row in ROLES.items() for v in row[3]]
    with ThreadPoolExecutor(3) as ex:
        for out in ex.map(sample, jobs):
            print(out, flush=True)
    open(os.path.join(OUT, "voices.html"), "w", encoding="utf-8").write(page())
    print("voices.html", os.path.getsize(os.path.join(OUT, "voices.html")) // 1024, "KB")
