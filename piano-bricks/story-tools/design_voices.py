"""Design brand-new voices for story roles with ElevenLabs Voice Design, and build a page to pick one.

usage: python design_voices.py      (run in piano-bricks/story-tools)
For each role, three descriptions x three previews = nine candidates, each reading the role's own lines.
Writes audition/design.json (generated voice ids) and audition/voices.html (served at /voices).
The current voice is shown first for comparison. Picks are saved to voice-choice.json by the bridge;
then save_designed.py turns the picked previews into permanent voices.
"""
import base64
import html
import json
import os
import subprocess
import tempfile
import urllib.request

KEY = os.environ["ELEVENLABS_API_KEY"]
OUT = "audition"

ROLES = {
    "mira": {
        "name": "강미라", "about": "22세 에이스 파일럿 · 밝고 거침없지만 여성스러움",
        "current": ("yIiJDIlA4V9TvoOO12TS", "Emily (현재)"),
        "text": "[excited] 강미라, 스카이라크 출격합니다! 걱정 마세요, 함장님. 금방 돌아올게요. "
                "[cheerful] 아, 피아니스트 씨! 방송에서 들었어요. 그 노래, 이상하게 가슴이 뛰더라. "
                "[shy] 나중에 저한테도 한 곡 쳐 줄래요? 저만을 위해서.",
        "styles": {
            "밝고 생기 있는": "A bright, lively young Korean woman in her early twenties, a confident ace fighter pilot. Warm, clear and pretty voice with a playful smile in it, natural Seoul accent, youthful and energetic but feminine, like a romance anime heroine.",
            "맑고 사랑스러운": "A sweet, clear and lovely young Korean woman, 22 years old, soft and airy but confident voice with a gentle smile, natural standard Korean, cute and feminine yet brave, like a heroine in a 1980s romance anime.",
            "시원하고 당찬": "A cool, spirited young Korean woman, 22, a daring pilot with a slightly husky but pretty and feminine voice, crisp and confident delivery with warmth underneath, natural Seoul accent.",
        },
    },
    "noa": {
        "name": "노아 박사", "about": "34세 고고학자 · 차분하고 지적이며 호기심 많음",
        "current": ("uyVNoMrnUku1dZyVEXwD", "Anna Kim (현재)"),
        "text": "[warm] 반가워요. 보여 드릴 게 있어요. 화성 지하에서 찾은 거예요. "
                "[awed, quietly] 별의 석판. 저 외계인들의 조상, 고대 아우라인이 남긴 유물이에요. "
                "[amazed] 빛이… 음악에 반응하고 있어요!",
        "styles": {
            "차분하고 지적인": "A calm, intelligent Korean woman in her mid thirties, an archaeologist and scientist. Smooth, mature and warm voice, clear articulation, thoughtful pacing, natural standard Korean, gentle and trustworthy.",
            "따뜻하고 부드러운": "A warm, soft-spoken Korean woman, 34, a kind researcher with a gentle low-mid voice, elegant and soothing, a hint of quiet excitement when she talks about discoveries, natural Seoul accent.",
            "또렷하고 호기심 많은": "A bright, curious Korean woman in her thirties, a passionate archaeologist. Clear, articulate and lively voice, mature but youthful, eager and expressive when amazed, natural standard Korean.",
        },
    },
}


def post(path, body):
    req = urllib.request.Request("https://api.elevenlabs.io/v1/" + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read()) if r.headers.get("content-type", "").startswith("application/json") else r.read()


def small_mp3(raw):
    """Re-encode to a small mono MP3 for the page; returns base64."""
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.mp3"), os.path.join(d, "b.mp3")
        open(a, "wb").write(raw)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-ac", "1", "-b:a", "64k", b], check=True)
        return base64.b64encode(open(b, "rb").read()).decode()


def current_sample(role):
    vid, _ = ROLES[role]["current"]
    raw = post("text-to-speech/%s?output_format=mp3_44100_128" % vid,
               {"text": ROLES[role]["text"], "model_id": "eleven_v3", "voice_settings": {"stability": 0.5}})
    return small_mp3(raw)


def main():
    os.makedirs(OUT, exist_ok=True)
    design = {}
    for role, r in ROLES.items():
        cands = [{"id": r["current"][0], "label": r["current"][1], "desc": "지금 게임에 들어간 목소리", "audio": current_sample(role), "current": True}]
        for style, desc in r["styles"].items():
            d = post("text-to-voice/design", {"voice_description": desc, "text": r["text"], "model_id": "eleven_ttv_v3"})
            for i, p in enumerate(d["previews"]):
                cands.append({"id": p["generated_voice_id"], "label": "%s %d" % (style, i + 1), "desc": "새로 디자인한 목소리",
                              "audio": small_mp3(base64.b64decode(p["audio_base_64"])), "description": desc})
            print(role, style, len(d["previews"]), "previews", flush=True)
        design[role] = cands
    json.dump({k: [{x: c[x] for x in c if x != "audio"} for c in v] for k, v in design.items()},
              open(os.path.join(OUT, "design.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, "voices.html"), "w", encoding="utf-8").write(page(design))
    print("voices.html", os.path.getsize(os.path.join(OUT, "voices.html")) // 1024, "KB")


def page(design):
    cards = []
    for role, cands in design.items():
        r = ROLES[role]
        rows = "".join(
            '<label class="row"><input type="radio" name="%s" value="%s"%s><span class="vn">%s%s</span>'
            '<span class="vd">%s</span><button type="button" class="play" data-src="data:audio/mpeg;base64,%s">▶ 듣기</button></label>'
            % (role, c["id"], " checked" if c.get("current") else "", html.escape(c["label"]),
               ' <em>현재</em>' if c.get("current") else "", html.escape(c["desc"]), c["audio"]) for c in cands)
        cards.append('<section class="card"><h2>%s <small>%s</small></h2><p class="line">자기 대사 세 문장을 이어서 읽어요</p>%s</section>'
                     % (html.escape(r["name"]), html.escape(r["about"]), rows))
    tpl = open("voices_template.html", encoding="utf-8").read()
    return tpl.replace("{{CARDS}}", "\n".join(cards)).replace("{{ROLES}}", json.dumps(list(design)))


if __name__ == "__main__":
    main()
