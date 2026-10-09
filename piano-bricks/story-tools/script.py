"""Story script for 두근두근 뮤직 세션 — 별의 석판. Writes script.json (nodes with line ids).

Node kinds:
  {"bg": name}            change background (fades)
  {"bgm": name|None}      change / stop background music
  {"sfx": name}           one-shot sound effect
  {"show": {"left": who, "right": who}}   portraits (None hides a side)
  {"say": who, "text": ...}               a voiced line (narr/pa have no portrait)
  {"play": {"song": id, "stage": n}, "intro": text}   a performance stage
"""
import json

NAMES = {"narr": "", "pa": "함내 방송", "haru": "윤하루", "mira": "강미라", "captain": "서진혁 함장",
         "noa": "노아 박사", "garon": "가론", "ella": "엘라"}

CH = []


def chapter(cid, title, summary, nodes):
    CH.append({"id": cid, "title": title, "summary": summary, "nodes": nodes})


def S(who, text):
    return {"say": who, "text": text}


chapter("ch1", "1장 · 침공", "라운지의 피아니스트와 정체불명의 외계 함대", [
    {"bg": "lounge"}, {"bgm": "calm"}, {"show": {"left": None, "right": None}},
    S("narr", "2089년. 인류 이민 선단의 기함, 우주전함 하모니아호는 태양계 끝자락을 지나고 있었다."),
    {"show": {"left": "haru"}},
    S("haru", "오늘도 손님은 창밖의 별들뿐이네. 그래도, 한 곡만 더."),
    {"sfx": "alarm"}, {"bg": "bridge"}, {"bgm": "battle"}, {"show": {"left": None}},
    S("pa", "전 함에 알린다! 정체불명의 함대가 접근 중! 전투 배치!"),
    {"show": {"right": "captain"}},
    S("captain", "적 함대 규모는?"),
    S("pa", "확인된 것만 삼백 척 이상입니다!"),
    S("captain", "스카이라크 편대, 즉시 발진하라."),
    {"bg": "hangar"}, {"sfx": "engine"}, {"show": {"right": "mira"}},
    S("mira", "강미라, 스카이라크 출격합니다! 걱정 마세요, 함장님. 금방 돌아올게요."),
    {"sfx": "launch"}, {"bg": "fleet"}, {"show": {"right": None}},
    S("narr", "붉은 빛의 함대. 그들은 아무 말이 없었다. 경고도, 요구도 없이 그저 쏘아 댈 뿐이었다."),
    {"sfx": "explosion"},
    {"bg": "lounge"}, {"bgm": "calm"},
    S("narr", "대피 구역이 된 라운지. 겁에 질린 아이들이 울음을 터뜨렸다."),
    {"show": {"left": "haru"}},
    S("haru", "괜찮아. 형이 노래 하나 들려줄게. 다 같이 별을 세어 보자."),
    {"play": {"song": "twinkle", "stage": 0}, "intro": "아이들을 달래 주자! 「작은 별」을 연주하세요."},
    S("haru", "봐, 이제 하나도 안 무섭지?"),
    {"show": {"right": "mira"}},
    S("mira", "하모니아, 들려요? 무전으로 피아노 소리가 들려요. 누가 치는 거예요? 덕분에 정신이 번쩍 드네!"),
    S("haru", "아… 방송이 켜져 있었구나."),
    {"show": {"right": "captain"}},
    S("captain", "저 피아니스트, 이름이 뭐지?"),
])

chapter("ch2", "2장 · 별의 석판", "화성 유적에서 온 돌판, 그리고 그 위의 악보", [
    {"bg": "bridge"}, {"bgm": "mystery"}, {"show": {"left": None, "right": None}},
    S("narr", "첫 전투는 간신히 막아 냈다. 함장은 하루를 함교로 불렀다."),
    {"show": {"left": "haru", "right": "captain"}},
    S("captain", "자네가 윤하루군. 이분은 노아 박사, 화성 유적 조사단장이네."),
    {"show": {"right": "noa"}},
    S("noa", "반가워요. 보여 드릴 게 있어요. 화성 지하에서 찾은 거예요."),
    {"bg": "tablet"}, {"sfx": "tablet_hum"},
    S("noa", "별의 석판. 저 외계인들의 조상, 고대 아우라인이 남긴 유물이에요."),
    S("noa", "그런데 이상해요. 적 함대는 이 석판이 있는 곳만 피해서 공격했어요."),
    S("haru", "이 홈들… 간격이 일정하지 않네요. 길고, 짧고, 짧고. 꼭 박자 같아요."),
    S("noa", "박자요?"),
    S("haru", "점의 높이는 음높이고요. 이건 글자가 아니라 악보예요!"),
    {"show": {"right": "captain"}},
    S("captain", "악보라… 쳐 볼 수 있겠나?"),
    S("haru", "첫 소절만이라도요. 해 볼게요."),
    {"play": {"song": "tablet", "stage": 0}, "intro": "석판에 새겨진 첫 소절을 연주하세요."},
    {"sfx": "tablet_glow"}, {"show": {"right": "noa"}},
    S("narr", "마지막 음이 울리자, 석판의 홈이 하나씩 푸르게 빛나기 시작했다."),
    S("noa", "빛이… 음악에 반응하고 있어요!"),
    S("pa", "함장님! 적 함대의 움직임이 멈췄습니다! 전 함대가 정지했습니다!"),
    {"show": {"right": "captain"}},
    S("captain", "저들이… 이 노래를 듣고 있는 건가."),
])

chapter("ch3", "3장 · 스카이라크", "전망 갑판의 약속과 포위된 에이스", [
    {"bg": "observation"}, {"bgm": "romance"}, {"show": {"left": None, "right": None}},
    S("narr", "이유를 알 수 없는 휴전. 그날 밤, 전망 갑판."),
    {"show": {"left": "haru", "right": "mira"}},
    S("mira", "아, 피아니스트 씨! 방송에서 들었어요. 그 노래, 이상하게 가슴이 뛰더라."),
    S("haru", "미라 씨는 매일 저런 데를 날아다니는 거죠? 무섭지 않아요?"),
    S("mira", "무섭죠. 근데 날 때는 오히려 조용해요. 꼭 음악 속에 있는 것처럼."),
    S("mira", "나중에 저한테도 한 곡 쳐 줄래요? 저만을 위해서."),
    S("haru", "네. 약속할게요."),
    {"sfx": "alarm"}, {"bg": "dogfight"}, {"bgm": "battle"}, {"show": {"left": None}},
    S("pa", "적 전투기 다수 출현! 스카이라크 편대, 응전하라!"),
    S("mira", "변신한다! 스카이라크, 로봇 모드!"),
    {"sfx": "transform"}, {"sfx": "explosion"},
    S("mira", "큭… 너무 많아! 포위됐어!"),
    {"bg": "bridge"}, {"show": {"left": "haru", "right": "captain"}},
    S("captain", "미라 대위가 위험하다! 지원은?"),
    S("pa", "도착까지 삼 분! 늦습니다!"),
    S("haru", "함장님, 방송을 전 주파수로 열어 주세요. 석판의 다음 소절을 치겠습니다!"),
    S("captain", "좋다. 자네에게 맡기지."),
    {"play": {"song": "tablet", "stage": 1}, "intro": "미라를 구하자! 석판의 두 번째 소절을 연주하세요."},
    {"bg": "dogfight"}, {"show": {"left": None, "right": None}},
    S("narr", "노래가 우주에 퍼지자, 미라를 에워싼 드라크족 전투기들이 일제히 멈춰 섰다."),
    {"show": {"left": "garon"}},
    S("garon", "이 소리는 무엇이지. 가슴이… 아프다."),
    {"show": {"left": None, "right": "mira"}},
    S("mira", "하루 씨… 들려요. 당신의 피아노 소리."),
])

chapter("ch4", "4장 · 두 종족", "투항한 사령관과 석판에 남은 문장", [
    {"bg": "bridge"}, {"bgm": "mystery"}, {"show": {"left": None, "right": None}},
    S("narr", "혼란에 빠진 적 함대에서, 실피아족 함선 한 척이 하모니아호에 투항해 왔다."),
    {"show": {"right": "ella"}},
    S("ella", "나는 실피아 함대 사령관 엘라. 그 노래를 다시 들려 다오. 명령이 아니다. 부탁이다."),
    {"show": {"left": "captain"}},
    S("captain", "왜 그 노래를 원하지?"),
    S("ella", "모르겠다. 그 소리를 들은 뒤로 병사들이 싸우지 못한다. 나도… 잠들 수가 없다."),
    {"bg": "tablet"}, {"show": {"left": "noa"}},
    S("noa", "석판 아래쪽 문장을 해독했어요. 들어 보세요."),
    S("noa", "하나의 종족이 둘로 갈라졌다. 남자와 여자는 서로를 잊고, 전쟁의 도구가 되었다."),
    S("noa", "그러나 이 노래를 함께 부르면, 잊었던 사랑이 돌아오리라."),
    S("ella", "드라크와 실피아가… 하나였다고?"),
    {"show": {"left": "haru"}},
    S("haru", "엘라 씨, 인류의 노래도 들려드릴게요. 모두가 형제가 된다는 노래예요."),
    {"play": {"song": "joy", "stage": 0}, "intro": "엘라에게 인류의 노래 「환희의 송가」를 들려주세요."},
    S("ella", "이것이 기쁨이라는 감정인가. 따뜻하다."),
    {"bg": "observation"}, {"bgm": "romance"}, {"show": {"right": "mira"}},
    S("mira", "하루 씨, 무리하지 마요. 손이 떨리잖아요."),
    S("haru", "괜찮아요. 미라 씨가 들어 주니까요."),
    S("mira", "바보. 그런 말 하면, 진짜 좋아해 버린다?"),
    {"sfx": "alarm"}, {"bgm": "battle"},
    S("pa", "드라크 본대 접근! 가론 사령관의 기함입니다!"),
])

chapter("ch5", "5장 · 별의 무대", "함상 무대 위의 마지막 연주", [
    {"bg": "alien"}, {"bgm": "battle"}, {"show": {"left": "garon", "right": None}},
    S("garon", "실피아가 배신했다. 인간의 소리가 우리를 약하게 만든다. 모두 쓸어버려라."),
    {"bg": "bridge"}, {"show": {"left": "haru", "right": "captain"}},
    S("captain", "적 전 함대가 몰려온다. 이대로는 버틸 수 없어."),
    S("haru", "함장님, 갑판에 무대를 세워 주세요. 석판의 노래 전부를 저들 모두에게 들려줄게요."),
    S("captain", "갑판은 그대로 노출된다. 죽을 수도 있네."),
    {"show": {"right": "mira"}},
    S("mira", "제가 지킬게요. 스카이라크로, 무대에 한 발도 닿지 않게."),
    {"bg": "stage"}, {"bgm": None}, {"sfx": "stage"}, {"show": {"left": None, "right": None}},
    S("narr", "하모니아호의 갑판 위, 별빛 아래 세워진 단 하나의 무대."),
    {"show": {"left": "haru", "right": "mira"}},
    S("haru", "미라 씨, 약속했죠. 이 곡은 당신을 위해서 칩니다."),
    S("mira", "응. 끝까지 들을게."),
    {"play": {"song": "tablet", "stage": 2}, "intro": "석판의 노래, 세 번째 소절을 연주하세요."},
    {"sfx": "explosion"},
    S("mira", "한 발도 안 보내! 계속 쳐요, 하루 씨!"),
    {"play": {"song": "tablet", "stage": 3}, "intro": "마지막 소절! 사랑의 노래를 완성하세요."},
    {"bg": "alien"}, {"bgm": "mystery"}, {"show": {"left": "garon", "right": "ella"}},
    S("garon", "이 노래… 아주 먼 옛날, 누군가가 불러 주던…"),
    S("ella", "가론. 우리는 원래 함께 노래하던 사이였다. 이제 기억나는가?"),
    S("garon", "엘라… 내 눈에서, 무언가가 흐른다."),
    {"bg": "ending"}, {"bgm": "ending"}, {"show": {"left": None, "right": None}},
    S("narr", "그날, 수천 척의 함대에서 포성이 멈췄다. 우주에는 오직 노래만이 흘렀다."),
    {"show": {"right": "captain"}},
    S("captain", "전 함대에 알린다. 전투를 종료한다. 음악이 이겼다."),
    {"show": {"left": "haru", "right": "mira"}},
    S("mira", "하루 씨! 우리, 진짜 해냈어요!"),
    S("haru", "미라 씨가 지켜 줘서예요. 이제 약속한 곡, 둘이서만 들을래요?"),
    S("mira", "응. 이번엔 당신 옆에서."),
    {"show": {"left": None, "right": None}},
    S("narr", "두근두근 뮤직 세션, 별의 석판. 끝."),
])

n = 0
for ch in CH:
    for node in ch["nodes"]:
        if "say" in node:
            n += 1
            node["id"] = "%s_%02d" % (ch["id"], sum(1 for x in ch["nodes"][: ch["nodes"].index(node) + 1] if "say" in x))
json.dump({"names": NAMES, "chapters": CH}, open("script.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(CH), "chapters,", n, "lines,", sum(len(x["text"]) for c in CH for x in c["nodes"] if "say" in x), "chars")
