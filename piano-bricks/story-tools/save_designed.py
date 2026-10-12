"""Turn picked Voice Design previews into permanent ElevenLabs voices.

usage: python save_designed.py      (run in piano-bricks/story-tools, after picking on /voices)
Reads voice-choice.json (picks) and audition/design.json (candidates). For each role whose pick is a
new design, saves it to the account as "PB <name>" and prints role -> permanent voice id as JSON.
"""
import json
import os
import urllib.request

KEY = os.environ["ELEVENLABS_API_KEY"]
pick = json.load(open("voice-choice.json", encoding="utf-8"))
design = json.load(open(os.path.join("audition", "design.json"), encoding="utf-8"))
NAMES = {"mira": "PB 강미라", "noa": "PB 노아 박사"}
saved = {}
for role, cands in design.items():
    chosen = next((c for c in cands if c["id"] == pick.get(role)), None)
    if not chosen or chosen.get("current"):
        continue
    body = {"voice_name": NAMES.get(role, "PB " + role), "voice_description": chosen["description"],
            "generated_voice_id": chosen["id"]}
    req = urllib.request.Request("https://api.elevenlabs.io/v1/text-to-voice", data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        saved[role] = json.loads(r.read())["voice_id"]
print(json.dumps(saved))
