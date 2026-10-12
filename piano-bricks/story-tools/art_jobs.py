"""Ask Codex (GPT image tool) for the story art in the new style, one Codex session per job, in parallel.

usage: python art_jobs.py OUT_DIR [job ...]     (needs the Codex app CLI: ~/bin/codex.cmd)
Character jobs make, in OUT_DIR/<who>/: base.png, eyes_closed.png, mouth_e.png, mouth_a.png, mouth_o.png, hair_mask.png
The background job makes OUT_DIR/bgs/bg_<name>.png.
The style is described in words (no reference picture is passed in).
"""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

STYLE = ("현대 일본 애니메이션 일러스트, 정교한 메카·테크웨어 파일럿 일러스트 화풍: 가늘고 섬세한 선, 부드러운 셀 채색에 "
         "회화적인 그라데이션과 은은한 림 라이트, 차분한 회청색·회색·오프화이트 바탕에 시그널 오렌지·노랑·청록 포인트 색, "
         "아주 정교한 SF 헤드셋·하네스·스트랩·기계 부품 디테일, 섬세한 하이라이트가 들어간 크고 맑은 눈, 결이 살아 있는 머리카락, "
         "고급 일러스트 완성도. 특정 기존 작품·작가의 그림을 따라 그리지 말고 새 그림으로.")

CHARS = {
    "haru": "윤하루, 21세 남자 피아니스트 주인공. 부드럽게 흐트러진 짙은 갈색 머리, 순하고 맑은 눈매, 흰 셔츠 위에 얇은 테크 장식이 들어간 날렵한 남색 우주선 승무원 재킷, 한쪽 귀에 작은 이어피스, 차분하고 다정한 표정",
    "mira": "강미라, 22세 여자 에이스 파일럿. 어깨에 닿는 부드러운 웨이브의 적갈색 머리, 크고 반짝이는 눈과 긴 속눈썹, 예쁘고 여성스러운 얼굴, 흰색·주황색 파일럿 슈트와 하네스·스트랩, 마이크 달린 정교한 테크 헤드셋, 헬멧을 옆구리에 낌, 밝은 미소",
    "captain": "서진혁 함장, 52세 남자. 짧은 회색 머리와 단정한 짧은 수염, 테크 휘장이 달린 남색 함장 제복과 챙 있는 모자, 굳고 믿음직한 눈빛",
    "noa": "노아 박사, 34세 여자 고고학자. 긴 흑발을 낮게 묶음, 둥근 안경, 테크 주머니가 달린 야전 재킷 위에 흰 가운, 지적이고 호기심 어린 표정",
    "garon": "가론, 외계 전사 종족(남자만 있는 종족)의 사령관. 크고 단단한 체격, 회녹색 피부, 날카로운 이목구비, 빛나는 선이 들어간 검붉은 기계 갑주, 이마의 빛나는 문양, 감정 없는 무표정",
    "ella": "엘라, 외계 전사 종족(여자만 있는 종족)의 사령관. 길고 곧은 은발, 옅은 푸른빛 피부, 보랏빛 눈, 금장 장식의 흰 장교 갑주 슈트와 정교한 기계 디테일, 차갑고 날카로운 표정",
}

BGS = {
    "fleet": "태양계 외곽 우주, 멀리 고리 행성, 수백 척의 각진 외계 전함 함대가 붉은 빛을 내며 다가오는 위협적인 장면",
    "bridge": "거대한 인류 우주전함 「하모니아호」의 함교 내부, 정교한 계기판과 홀로그램 화면, 큰 전면 창 밖으로 우주와 섬광, 붉은 경보등",
    "lounge": "우주전함 안의 아늑한 라운지, 반짝이는 검은 그랜드 피아노, 큰 둥근 창밖으로 별과 행성, 따뜻한 조명",
    "tablet": "화성 지하 유적의 어두운 석실, 가운데 서 있는 거대한 고대 석판, 석판의 홈 무늬(악보처럼 보이는 줄과 점)가 은은한 청록빛으로 빛남",
    "hangar": "우주전함 격납고, 흰색·주황색 가변 전투기(전투기에서 인간형 로봇으로 변신하는 기체, 지금은 전투기 형태)가 발진 레일 위에 대기, 정비 조명과 증기, 정교한 기계 디테일",
    "dogfight": "우주 공중전, 흰색·주황색 기체가 인간형 로봇으로 변신하며 날아가는 순간, 미사일 궤적과 폭발 섬광, 외계 전투기들",
    "observation": "우주전함 전망 갑판, 거대한 유리 돔 너머로 은하수와 작은 지구, 고요하고 낭만적인 밤 분위기",
    "stage": "우주전함 외부 갑판 위에 세워진 거대한 콘서트 무대, 가운데 검은 그랜드 피아노와 스포트라이트, 주위로 우주와 함대, 음표 모양의 빛",
    "alien": "외계 기함 내부의 어둡고 각진 지휘실, 붉은 빛과 홀로그램, 줄지어 선 갑주 병사 실루엣",
    "ending": "전쟁이 멈춘 우주, 인류 함대와 외계 함대가 나란히 떠 있고 가운데 금빛 빛줄기와 음표 모양 빛이 퍼지는 희망찬 장면",
    "title": "스토리 표지 그림, 우주를 배경으로 그랜드 피아노 실루엣과 그 위를 날아가는 흰색·주황색 변신 전투기, 별빛과 음표 모양 빛줄기, 위쪽 1/3은 제목 글자를 얹을 수 있게 비교적 비워 둠",
}


def char_prompt(who):
    return f"""이미지 생성·편집 도구로 게임 캐릭터 그림 6장을 이 폴더에 차례로 만들어 저장해. 모두 같은 크기(가로 1024, 세로 1536)여야 해.
화풍: {STYLE}
캐릭터: {CHARS[who]}
1) base.png : 위 캐릭터의 허리 위 상반신, 몸은 살짝 비스듬히(3/4) 정면을 봄, 캐릭터가 가운데에 크게, 눈을 뜨고 입은 다문 기본 표정. 배경은 완전히 균일한 크로마키 초록(#00FF00) 단색(그림자·소품·글자 없이). 캐릭터에는 초록색을 쓰지 말 것.
2) eyes_closed.png : base.png를 편집해(새로 그리지 말고) 두 눈만 자연스럽게 감은 모습으로. 나머지(얼굴·머리·옷·위치·크기·배경)는 그대로.
3) mouth_e.png : base.png를 편집해 입만 살짝 벌린 모양(「에」 발음)으로. 나머지는 그대로.
4) mouth_a.png : base.png를 편집해 입만 크게 벌린 모양(「아」 발음)으로. 나머지는 그대로.
5) mouth_o.png : base.png를 편집해 입만 동그랗게 벌린 모양(「오」 발음)으로. 나머지는 그대로.
6) hair_mask.png : base.png와 정확히 같은 위치·크기로, 머리카락 부분만 순수한 흰색(#FFFFFF), 나머지 전부(얼굴·몸·옷·배경)는 순수한 검은색(#000000)인 흑백 마스크 그림.
편집할 때는 원본 base.png를 보고 그 그림을 고쳐야 해. 다 만들면 저장한 파일 이름 6개만 답해."""


def mouth_prompt(who):
    shapes = [
        ("mouth_1.png", "입술 사이가 아주 살짝만 벌어진 모습(말을 시작하기 직전, 윗니 끝이 살짝 보일 듯 말 듯)"),
        ("mouth_2.png", "입이 조금 열린 모습(편하게 말할 때, 턱이 조금 내려감)"),
        ("mouth_3.png", "입이 반쯤 열린 모습(또렷하게 말할 때, 턱이 더 내려가고 윗니가 보임)"),
        ("mouth_4.png", "입을 크게 벌린 모습(「아」 소리, 턱이 크게 내려가고 혀가 살짝 보임)"),
        ("mouth_5.png", "입을 옆으로 넓게 벌려 윗니와 아랫니가 보이는 모습(「에」·「이」 소리, 미소 짓듯 입꼬리가 옆으로)"),
    ]
    items = "\n".join(f"{i + 1}) {f} : {d}" for i, (f, d) in enumerate(shapes))
    return f"""이 폴더의 base.png를 편집해서(새로 그리지 말고) 말할 때의 입 모양 5장을 만들어 저장해. 캐릭터: {CHARS[who]}
중요: 입술을 가운데로 오므리거나 동그랗게 모으지 말 것. 입 너비는 원래 입 너비를 유지하거나 조금 넓게, 턱이 자연스럽게 내려가며 열리는 모양으로. 실제 사람이 말할 때처럼 자연스럽게.
입과 턱 주변 말고는 아무것도 바꾸지 말 것: 눈·머리카락·옷·위치·크기·구도·색감·크로마키 초록 배경 모두 그대로, 확대나 이동도 하지 말 것. 이미지 크기 가로 1024 세로 1536 그대로.
{items}
편집할 때는 매번 원본 base.png를 보고 고쳐야 해. 다 만들면 저장한 파일 이름 5개만 답해."""


def bg_prompt():
    items = "\n".join(f"{i + 1}) bg_{k}.png : {v}" for i, (k, v) in enumerate(BGS.items()))
    return f"""이미지 생성 도구로 게임 컷씬 배경 그림 {len(BGS)}장을 만들어 이 폴더에 저장해. 모두 같은 화풍이어야 해.
화풍: {STYLE} 배경 미술로서 원근감과 공기감이 살아 있는 정교한 장면.
공통: 세로 화면(가로 1024, 세로 1536). 주요 인물 얼굴은 넣지 말 것(대사 장면에서 캐릭터 그림을 위에 겹쳐 쓴다). 아래쪽 1/3은 대사 창이 덮으니 중요한 것은 위쪽과 가운데에. 글자·로고 없이.
{items}
다 만들면 저장한 파일 이름만 답해."""


def run(job, out_dir):
    # "<who>" = full character set, "mouths:<who>" = five natural mouth shapes from the existing base.png
    who = job.split(":", 1)[1] if job.startswith("mouths:") else job
    d = os.path.join(out_dir, who if who in CHARS else "bgs")
    os.makedirs(d, exist_ok=True)
    prompt = mouth_prompt(who) if job.startswith("mouths:") else char_prompt(who) if who in CHARS else bg_prompt()
    codex = os.path.join(os.path.expanduser("~"), "bin", "codex.cmd")
    with open(os.path.join(d, "codex.jsonl"), "w") as log, open(os.path.join(d, "codex.err"), "w") as err:
        p = subprocess.run([codex, "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", d, "--json",
                            "-o", os.path.join(d, "last.txt"), "-"], input=prompt.encode("utf-8"), stdout=log, stderr=err)
    files = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    return "%s: exit %d, %d장 %s" % (job, p.returncode, len(files), files)


if __name__ == "__main__":
    out = sys.argv[1]
    jobs = sys.argv[2:] or list(CHARS) + ["bgs"]
    with ThreadPoolExecutor(len(jobs)) as ex:
        for r in ex.map(lambda j: run(j, out), jobs):
            print(r, flush=True)
