"""Make every story sound with ElevenLabs: voiced lines (TTS), sound effects, and scene music.

usage: python gen_audio.py      (run in the story folder; skips files that already exist)
Outputs (mono MP3, ready to embed):
  voice/<line id>.mp3   one per line in script.json, aliens and the ship PA get an effect
  sfx/<name>.mp3, bgm/<name>.mp3 (bgm cross-faded into a seamless loop)
"""
import json
import os
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["ELEVENLABS_API_KEY"]
API = "https://api.elevenlabs.io/v1"

VOICES = {  # who: (voice id, stability, style)
    "narr": ("jB1Cifc2UQbq1gR3wnb0", 0.55, 0.25),   # Bin - measured
    "pa": ("ZJCNdZEjYwkOElxugmW2", 0.6, 0.2),       # Hyuk (picked on the audition page)
    "haru": ("gJSDQIpSQ56NBGhorBfg", 0.45, 0.4),    # David - calm (picked)
    "mira": ("yIiJDIlA4V9TvoOO12TS", 0.35, 0.6),    # Emily (picked)
    "captain": ("UmYoqGlufKxhJ6NCx5Mv", 0.55, 0.3), # KO Jang Ho (picked)
    "noa": ("uyVNoMrnUku1dZyVEXwD", 0.5, 0.35),     # Anna Kim (picked)
    "garon": ("UmYoqGlufKxhJ6NCx5Mv", 0.6, 0.3),    # KO Jang Ho
    "ella": ("uyVNoMrnUku1dZyVEXwD", 0.55, 0.3),    # Anna Kim
}
# How each line is said (eleven_v3 audio tags): makes the delivery natural and fit the scene.
TONE = {
    "ch1_01": "calm, cinematic narration", "ch1_02": "softly, a little lonely", "ch1_03": "urgent", "ch1_04": "serious",
    "ch1_05": "nervous, urgent", "ch1_06": "firm, commanding", "ch1_07": "excited, confident", "ch1_08": "ominous",
    "ch1_09": "somber", "ch1_10": "gently, reassuring", "ch1_11": "warm, smiling", "ch1_12": "over the radio, excited",
    "ch1_13": "surprised, embarrassed", "ch1_14": "curious, impressed",
    "ch2_01": "calm narration", "ch2_02": "warm but formal", "ch2_03": "friendly, curious", "ch2_04": "awed, quietly",
    "ch2_05": "puzzled", "ch2_06": "thoughtful, slowly", "ch2_07": "surprised", "ch2_08": "excited realization",
    "ch2_09": "intrigued", "ch2_10": "determined, a bit nervous", "ch2_11": "full of wonder", "ch2_12": "amazed",
    "ch2_13": "shocked, urgent", "ch2_14": "quiet astonishment",
    "ch3_01": "quiet, gentle", "ch3_02": "cheerful, playful", "ch3_03": "shy, curious", "ch3_04": "softly, honest",
    "ch3_05": "shy, teasing", "ch3_06": "tender", "ch3_07": "urgent shouting", "ch3_08": "shouting, fierce",
    "ch3_09": "strained, panicked", "ch3_10": "tense, urgent", "ch3_11": "desperate", "ch3_12": "determined, urgent",
    "ch3_13": "resolute", "ch3_14": "awed", "ch3_15": "confused, low", "ch3_16": "breathless, moved",
    "ch4_01": "calm narration", "ch4_02": "cold and proud, then softer", "ch4_03": "cautious", "ch4_04": "troubled, quiet",
    "ch4_05": "serious", "ch4_06": "solemn, reading an ancient text", "ch4_07": "hopeful, solemn", "ch4_08": "shocked, whispering",
    "ch4_09": "kind, gentle", "ch4_10": "moved, softly", "ch4_11": "worried, caring", "ch4_12": "warm, smiling",
    "ch4_13": "flustered, embarrassed", "ch4_14": "alarmed",
    "ch5_01": "cold, furious", "ch5_02": "grim", "ch5_03": "determined, calm", "ch5_04": "worried, serious",
    "ch5_05": "confident, fierce", "ch5_06": "hushed, cinematic", "ch5_07": "tender, sincere", "ch5_08": "softly, moved",
    "ch5_09": "shouting, fierce", "ch5_10": "trembling, remembering", "ch5_11": "gentle, emotional",
    "ch5_12": "crying, voice breaking", "ch5_13": "moved, cinematic", "ch5_14": "relieved, proud", "ch5_15": "joyful, laughing",
    "ch5_16": "warm, a little shy", "ch5_17": "tender, happy", "ch5_18": "warm, closing",
}

# ffmpeg filters: aliens get a low metallic echo, the PA a radio band.
FX = {
    "garon": "asetrate=44100*0.93,aresample=44100,aecho=0.8:0.6:35|70:0.35|0.2",
    "ella": "aecho=0.8:0.55:28|56:0.3|0.18,highshelf=f=6000:g=3",
    "pa": "highpass=f=350,lowpass=f=3400,acompressor=threshold=-18dB:ratio=4",
}

SFX = {
    "alarm": ("Spaceship red alert alarm: a pulsing electronic klaxon blaring three times, retro 1980s sci-fi, no voice", 3),
    "engine": ("Fighter jet engines spooling up inside a spaceship hangar, rising turbine whine and hiss, no voice", 3),
    "launch": ("A space fighter launched from a catapult: a sharp whoosh and roaring afterburner fading into the distance", 2.5),
    "explosion": ("Distant space battle: a deep boom of a big explosion with debris crackle and a low rumble", 2.5),
    "transform": ("A jet fighter transforming into a humanoid robot: mechanical clanks, servo whirs, metal locking into place, retro anime", 2.5),
    "tablet_hum": ("Ancient alien stone tablet humming with mysterious energy: a low resonant drone with soft shimmering chimes", 3.5),
    "tablet_glow": ("Magical glowing awakening: rising sparkling crystal chimes and a warm swelling shimmer", 3),
    "stage": ("Big stage spotlights switching on one by one with heavy clunks, then a hush of a vast open space", 2.5),
}

BGM = {
    "calm": "1980s anime space opera underscore: calm, warm lounge piano with soft analog synth pads and gentle strings, nostalgic and hopeful, slow, instrumental, no vocals",
    "battle": "1980s anime space battle music: driving synth bass, punchy drums, heroic brass stabs and urgent strings, tense and fast, instrumental, no vocals",
    "mystery": "1980s anime sci-fi mystery underscore: slow ethereal synth pads, distant bells and a soft choir-like synth, ancient and wondrous, instrumental, no vocals",
    "romance": "1980s anime romantic theme: tender electric piano and soft saxophone over warm strings under the stars, slow and gentle, instrumental, no vocals",
    "ending": "1980s anime ending theme: hopeful, uplifting orchestral strings and piano with a soft synth shimmer, triumphant and warm, instrumental, no vocals",
}


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()


def ff(src, dst, af=None, kbps=56):
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "44100"]
    if af:
        cmd += ["-af", af]
    subprocess.run(cmd + ["-codec:a", "libmp3lame", "-b:a", "%dk" % kbps, dst], check=True)


def voice(node):
    out = "voice/%s.mp3" % node["id"]
    if os.path.exists(out):
        return out + " cached"
    vid = VOICES[node["say"]][0]
    # eleven_v3 speaks far more naturally than multilingual_v2; the tag sets the delivery.
    text = ("[%s] " % TONE[node["id"]] if node["id"] in TONE else "") + node["text"]
    raw = post("%s/text-to-speech/%s?output_format=mp3_44100_128" % (API, vid), {
        "text": text, "model_id": "eleven_v3", "voice_settings": {"stability": 0.5}})
    tmp = out + ".raw.mp3"
    open(tmp, "wb").write(raw)
    # trim leading silence; add the speaker's effect
    af = "silenceremove=start_periods=1:start_threshold=-45dB" + ("," + FX[node["say"]] if node["say"] in FX else "")
    ff(tmp, out, af, 56)
    os.remove(tmp)
    return out


def sfx(name):
    out = "sfx/%s.mp3" % name
    if os.path.exists(out):
        return out + " cached"
    text, dur = SFX[name]
    raw = post("%s/sound-generation?output_format=mp3_44100_128" % API,
               {"text": text, "duration_seconds": dur, "prompt_influence": 0.6, "model_id": "eleven_text_to_sound_v2"})
    tmp = out + ".raw.mp3"
    open(tmp, "wb").write(raw)
    ff(tmp, out, "afade=t=out:st=%.2f:d=0.25" % (dur - 0.25), 80)
    os.remove(tmp)
    return out


def bgm(name):
    out = "bgm/%s.mp3" % name
    if os.path.exists(out):
        return out + " cached"
    raw = post("%s/music?output_format=mp3_44100_128" % API, {"prompt": BGM[name], "music_length_ms": 33000})
    tmp = out + ".raw.mp3"
    open(tmp, "wb").write(raw)
    ff(tmp, out, None, 64)  # the seamless loop is made when embedding
    os.remove(tmp)
    return out


def main():
    for d in ("voice", "sfx", "bgm"):
        os.makedirs(d, exist_ok=True)
    script = json.load(open("script.json", encoding="utf-8"))
    lines = [n for c in script["chapters"] for n in c["nodes"] if "say" in n]
    with ThreadPoolExecutor(3) as ex:
        for r in ex.map(voice, lines):
            print(r, flush=True)
        for r in ex.map(sfx, SFX):
            print(r, flush=True)
        for r in ex.map(bgm, BGM):
            print(r, flush=True)


main()
