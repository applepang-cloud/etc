# 음성 도구

대사를 고치거나 늘린 뒤 음성을 다시 만들 때 쓴다. ElevenLabs API 키는 환경 변수 `ELEVENLABS_API_KEY`로만 읽는다.

```
node extract.js ../index.html lines.json          # 히로인 대사 목록
node extract_me.js ../index.html lines_me.json    # 주인공 독백·메뉴 문구
python -c "import json; d=json.load(open('poke.json',encoding='utf-8')); json.dump([{'who':w,'text':t} for w,ls in d.items() for t in ls], open('lines_poke.json','w',encoding='utf-8'), ensure_ascii=False)"
LINES=lines.json python tts.py ../voice           # 없는 줄만 새로 만든다 (eleven_v3)
LINES=lines_me.json python tts.py ../voice
LINES=lines_poke.json python tts.py ../voice
python lips.py                                    # lips.json: 0.05초 단위 입 모양
```
- 파일 이름은 `<누구>_<FNV-1a(누구|대사)>.mp3` (게임의 `voiceId()`와 같은 계산). 대사가 바뀌면 그 줄만 새 파일이 생기니, 쓰지 않는 옛 파일은 지워도 된다.
- `lips.json` 내용은 게임의 `const VOICE_LIPS = …;` 한 줄에 그대로 넣는다.
- `chosen_voices.json`: 고른 목소리 ID(리아 6, 유나 5, 하나 4, 소라 1, 아린 5, 세나 4, 주인공 11번 후보).
