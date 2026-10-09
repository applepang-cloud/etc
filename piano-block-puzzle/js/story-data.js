// 스토리 모드 대본.
// 단계 형식
//   { bg }                         배경 전환
//   { show: [인물, 표정, 위치] }   인물 등장/표정 변경 (위치: left | center | right)
//   { hide: 인물 }
//   { n: '...' }                   내레이션
//   { s: [인물, '대사', 표정?] }   대사 (표정을 주면 같이 바뀜)
//   { choice: [{ t, aff, skill, flag, then: [...], go }] }
//   { if: (st) => bool, then: [...], else: [...] }
//   { play: 곡 id }                연습 연주 (결과는 st.last 에 저장)
//   { pick: true }                 결선 곡 고르기 (st.picked)
//   { contest: { rival, win, lose } }  결선 연주 → 심사 → 장면 이동
//   { minigame: 'sneak', success: [...], caught: [...], timeout: [...] }
//   { fx: 'flash' | 'shake' | 'heart' }   { sfx: 'elise' | 'twinkle' | 'chime' }
//   { add: { aff, skill } }  { go: 장면 }  { end: true }

export const CAST = {
  seoyun: { name: '한서윤', color: '#f48fb6' },
  dohyun: { name: '이도현', color: '#86b6ff' },
  chaea: { name: '윤채아', color: '#f6c344' },
  prof: { name: '한정훈 교수', color: '#b4bfd3' },
  taejun: { name: '강태준', color: '#d9bf7a' },
  director: { name: '원장', color: '#b4bfd3' },
  mc: { name: '사회자', color: '#b4bfd3' },
};

export const CHAPTER1 = {
  id: 'ch1',
  title: '1장 · 지역 대회',
  start: 'prologue',
  scenes: {
    prologue: [
      { bg: 'station' },
      { n: '밤 11시 40분. 막차를 기다리는 사람들 사이, 역 광장 한구석에 낡은 거리 피아노가 놓여 있다.' },
      { show: ['dohyun', 'normal', 'left'] },
      { n: '편의점 야간 근무를 마친 나, 이도현. 스무 살. 악보는 읽을 줄 모른다.' },
      { s: ['dohyun', '(오늘은… 아까 매장에서 흘러나오던 그 곡으로 해볼까.)'] },
      { n: '한 번 들은 소리는 손끝이 기억한다. 그게 내가 피아노를 치는 방법이었다.' },
      { sfx: 'elise' },
      { n: '마지막 음이 사라지고, 등 뒤에서 조용한 박수 소리가 들렸다.' },
      { show: ['seoyun', 'surprise', 'right'] },
      { s: ['seoyun', '…방금 그거, 악보 없이 친 거예요?'] },
      { s: ['dohyun', '네? 아, 네… 시끄러웠으면 죄송합니다.'] },
      { s: ['seoyun', '아니요, 오히려 반대예요. 왼손 화음을 그렇게 바꿔 치는 사람은 처음 봤어요.', 'smile'] },
      {
        choice: [
          { t: '"…누구세요?"', then: [{ s: ['seoyun', '아, 실례했네요. 한서윤이라고 해요. 근처 아카데미에서 피아노를 가르쳐요.', 'normal'] }] },
          { t: '"칭찬… 감사합니다."', aff: 1, then: [{ s: ['seoyun', '칭찬이라기보다 감탄이에요. 저는 한서윤. 근처 아카데미 강사예요.', 'smile'] }] },
          { t: '말없이 고개만 꾸벅 숙인다', then: [{ s: ['seoyun', '수줍음이 많네요. 저는 한서윤이에요. 피아노를 가르치고 있어요.', 'smile'] }] },
        ],
      },
      { n: '그녀가 내민 명함에는 「서윤 피아노 아카데미 · 강사 한서윤」이라고 적혀 있었다.' },
      { s: ['seoyun', '제대로 배워볼 생각 없어요? 다음 달에 지역 콩쿠르가 있어요. 당신이라면… 무대에 설 수 있어요.', 'serious'] },
      { s: ['dohyun', '콩쿠르요? 저 악보도 못 읽는데요. 레슨비도 없고…'] },
      { s: ['seoyun', '악보는 제가 가르칠게요. 레슨비는 장학생으로 추천해 볼게요. 대신 조건이 하나 있어요.', 'smile'] },
      { s: ['dohyun', '조건이요?'] },
      { s: ['seoyun', '지금 그 곡, 한 번만 더 들려줘요.', 'blush'] },
      {
        choice: [
          {
            t: '그녀를 위해 한 번 더 연주한다',
            aff: 1,
            skill: 1,
            then: [{ sfx: 'elise' }, { n: '이번엔 그녀를 위해 쳤다. 마지막 화음에서, 그녀가 아주 작게 숨을 삼키는 소리가 들렸다.' }, { fx: 'heart' }],
          },
          { t: '"내일 아카데미에서 들려드릴게요."', then: [{ s: ['seoyun', '…좋아요. 그럼 내일, 기다릴게요.', 'smile'] }] },
        ],
      },
      { go: 'lesson' },
    ],

    lesson: [
      { bg: 'academy' },
      { hide: 'seoyun' },
      { show: ['dohyun', 'normal', 'left'] },
      { n: '다음 날 오후. 서윤 피아노 아카데미, 3번 연습실.' },
      { show: ['seoyun', 'normal', 'right'] },
      { s: ['seoyun', '먼저 실력부터 볼게요. 화면에 흐르는 초록 노트 위에 블록을 놓아 봐요. 악보 대신 눈으로 소리를 보는 연습이에요.'] },
      { s: ['dohyun', '블록이요? …게임 같네요.'] },
      { s: ['seoyun', '음악은 원래 놀이에서 시작했어요. 자, 「작은 별」부터.', 'smile'] },
      {
        choice: [
          { t: '바로 건반 앞에 앉는다', skill: 0 },
          {
            t: '"선생님이 먼저 쳐 주세요."',
            aff: 1,
            then: [
              { s: ['seoyun', '저, 저요? …알았어요. 한 소절만이에요.', 'blush'] },
              { sfx: 'twinkle' },
              { n: '부드럽고 정확한 소리. 그런데 그녀의 오른손목을 감싼 하얀 보호대가 눈에 들어왔다.' },
            ],
          },
        ],
      },
      { play: 'twinkle' },
      {
        if: (st) => (st.last?.stars || 0) >= 2,
        then: [{ s: ['seoyun', '…처음인데 이 정도라니. 귀가 정말 좋네요.', 'surprise'] }, { add: { skill: 2 } }],
        else: [{ s: ['seoyun', '처음엔 다 그래요. 손이 기억할 때까지, 같이 하면 돼요.', 'smile'] }, { add: { skill: 1 } }],
      },
      { n: '그때, 연습실 문이 열렸다.' },
      { s: ['director', '한 선생, 잠깐. …새로 온 학생인가?'] },
      { s: ['seoyun', '네, 원장님. 이번 지역 콩쿠르에 내보낼 생각이에요.', 'serious'] },
      { s: ['director', '알겠네. 그리고 다시 말하지만, 우리 아카데미는 강사와 수강생의 사적인 만남을 금지하고 있어. 예외는 없네.'] },
      { s: ['seoyun', '…알고 있어요.', 'sad'] },
      { n: '문이 닫히고, 연습실에 묘한 정적이 흘렀다.' },
      { s: ['dohyun', '(사적인 만남 금지… 왜 굳이 지금 그 말을.)'] },
      { s: ['seoyun', '신경 쓰지 마요. 우리는 콩쿠르만 생각하면 돼요.', 'normal'] },
      { go: 'night' },
    ],

    night: [
      { bg: 'night' },
      { show: ['dohyun', 'normal', 'left'] },
      { show: ['seoyun', 'sad', 'right'] },
      { n: '대회까지 2주. 다른 강사들이 모두 퇴근한 밤, 연습실에는 우리 둘뿐이었다.' },
      { s: ['dohyun', '선생님은 왜 더 이상 무대에 안 서세요?'] },
      { s: ['seoyun', '…손목이요. 결승 무대 직전에 다쳤어요. 그 뒤로는 한 곡을 끝까지 칠 수가 없어요.', 'sad'] },
      { s: ['seoyun', '그래서 가르치는 거예요. 내가 못 간 무대에, 누군가를 데려가고 싶어서.'] },
      {
        choice: [
          {
            t: '"제가 데려갈게요. 선생님 대신, 세계 무대까지."',
            aff: 2,
            flag: 'promise',
            then: [{ s: ['seoyun', '…그런 말, 쉽게 하면 안 돼요.', 'blush'] }, { s: ['seoyun', '그래도… 고마워요.', 'smile'] }, { fx: 'heart' }],
          },
          { t: '"많이 아프셨겠네요."', aff: 1, then: [{ s: ['seoyun', '이제는 괜찮아요. 당신 소리를 들으면… 조금 덜 아파요.', 'smile'] }] },
          {
            t: '말없이 그녀가 흥얼거리던 멜로디를 친다',
            aff: 1,
            skill: 1,
            then: [{ sfx: 'twinkle' }, { n: '첫 레슨 때 그녀가 무심코 흥얼거리던 멜로디였다.' }, { s: ['seoyun', '…기억하고 있었어요?', 'blush'] }],
          },
        ],
      },
      { n: '창밖으로 마지막 버스가 지나갔다. 우리는 그 사실을 둘 다 모른 척했다.' },
      { go: 'father' },
    ],

    father: [
      { bg: 'lobby' },
      { hide: 'seoyun' },
      { show: ['dohyun', 'normal', 'left'] },
      { n: '다음 날 오후. 아카데미 로비에 낯선 남자가 서 있었다. 희끗한 머리, 차가운 안경.' },
      { show: ['prof', 'normal', 'right'] },
      { s: ['prof', '서윤아. 오늘 저녁 강 이사장님 댁 식사, 잊지 않았지? 태준 군도 온다.'] },
      { show: ['seoyun', 'surprise', 'center'] },
      { s: ['seoyun', '…네, 아빠. 레슨 끝나고 갈게요.', 'serious'] },
      { s: ['dohyun', '(아빠…? 그리고 태준 군은 또 누구지?)', 'surprise'] },
      { s: ['prof', '자네가 그 거리 피아노 학생인가. 한정훈이네. 한국대 음대에서 피아노를 가르치지. 서윤이 아비 되네.', 'normal'] },
      { s: ['prof', '이번 지역 콩쿠르에 내 제자 채아도 나가지. …그리고 우리 서윤이는 곧 약혼식을 올리네. 쓸데없는 소문은 곤란해.', 'serious'] },
      { hide: 'prof' },
      { show: ['seoyun', 'sad', 'right'] },
      { s: ['seoyun', '…아빠가 정한 약혼이에요. 아빠 학교 이사장님 아들, 강태준 씨.'] },
      { s: ['seoyun', '아빠 교수 자리도, 이 아카데미도… 다 그 집안 덕분이라서요.'] },
      {
        choice: [
          { t: '"축하드려요… 라고 해야 하나요?"', flag: 'distance', then: [{ s: ['seoyun', '…축하는, 받고 싶지 않아요.', 'sad'] }] },
          { t: '"선생님은 그 사람 좋아하세요?"', aff: 1, then: [{ s: ['seoyun', '…그건, 묻지 말아요. 지금은.', 'blush'] }] },
          { t: '대답 대신 건반에 손을 올린다', skill: 1, then: [{ n: '대답 대신 친 화음이, 이상하게 쓸쓸하게 울렸다.' }] },
        ],
      },
      { bg: 'academy' },
      { n: '그날 레슨 내내, 유리문 너머 로비에는 한정훈 교수가 앉아 있었다. 딸을 약혼자 집안 식사 자리에 데려가기 위해.' },
      { s: ['seoyun', '(작게) …도현 씨. 아빠 쪽 보지 말고, 연습하는 척해요.', 'blush'] },
      { s: ['dohyun', '(…들키면 끝이다.)'] },
      {
        minigame: 'sneak',
        success: [
          { fx: 'heart' },
          { n: '교수가 등을 돌린 짧은 순간마다, 우리는 눈으로 대화했다. 악보 귀퉁이에 적힌 그녀의 작은 글씨 — 「오늘 소리, 좋아요.」' },
          { s: ['seoyun', '…아무한테도 말하면 안 돼요. 우리 둘만의 비밀이에요.', 'blush'] },
          { add: { aff: 2 } },
        ],
        caught: [
          { show: ['prof', 'serious', 'center'] },
          { fx: 'shake' },
          { s: ['prof', '서윤아. 레슨 중에 무슨 얘기를 그렇게 속닥거리지?'] },
          { s: ['seoyun', '…운지법 설명 중이었어요, 아빠.', 'serious'] },
          { s: ['prof', '약혼 앞두고 쓸데없는 일 만들지 마라. 나는 먼저 차에 가 있으마.'] },
          { hide: 'prof' },
          { n: '심장이 터질 것 같았다. 교수의 시선이, 문이 닫힐 때까지 나를 향해 있었다.' },
          { add: { flag: 'suspect' } },
        ],
        timeout: [
          { n: '결국 레슨이 끝날 때까지, 단 한 번도 제대로 눈을 마주치지 못했다.' },
          { s: ['seoyun', '…다음엔, 조금 더 용기 낼게요.', 'sad'] },
        ],
      },
      { go: 'fiance' },
    ],

    fiance: [
      { bg: 'night' },
      { hide: 'seoyun' },
      { show: ['dohyun', 'normal', 'left'] },
      { n: '레슨이 끝난 밤. 아카데미 앞에 검은 외제차 한 대가 미끄러지듯 멈춰 섰다.' },
      { show: ['taejun', 'normal', 'right'] },
      { s: ['taejun', '서윤 씨, 데리러 왔어요. 아버님은 먼저 우리 집에 가 계신다고.'] },
      { show: ['seoyun', 'serious', 'center'] },
      { s: ['seoyun', '…태준 씨. 굳이 안 오셔도 되는데.'] },
      { s: ['taejun', '약혼자가 데리러 오는 게 이상한가? …아, 이쪽이 그 편의점 피아니스트구나.', 'smile'] },
      { s: ['taejun', '강태준. 한국대 이사장이 우리 아버지야. 서윤 씨 시간, 너무 많이 뺏지 말아 줬으면 좋겠네. 곧 우리 집안 사람이 될 사람이라서.', 'serious'] },
      {
        if: (st) => st.flags.suspect,
        then: [{ s: ['taejun', '장인어른이 그러시더라. 레슨 중에 둘이 꽤 친해 보인다고. …오해겠지?', 'serious'] }],
      },
      {
        choice: [
          {
            t: '"선생님 시간은 선생님이 정하시는 거죠."',
            aff: 1,
            flag: 'defy',
            then: [{ s: ['taejun', '…재밌네. 콩쿠르, 객석에서 지켜볼게.', 'serious'] }, { s: ['seoyun', '(…도현 씨.)', 'surprise'] }],
          },
          { t: '"…알겠습니다."', then: [{ s: ['taejun', '말이 통해서 좋네.', 'smile'] }, { s: ['seoyun', '…', 'sad'] }] },
          { t: '말없이 서윤을 바라본다', aff: 1, then: [{ n: '그녀는 대답 대신, 아주 잠깐 내 눈을 바라보다 차에 올랐다.' }] },
        ],
      },
      { hide: 'seoyun' },
      { hide: 'taejun' },
      { n: '차가 떠난 자리에, 비싼 향수 냄새만 남았다.' },
      { s: ['dohyun', '(재벌 2세 약혼자. 교수 아버지. 그리고 강사와 수강생. …내가 넘을 수 있는 선은, 어디까지일까.)', 'sad'] },
      { go: 'rival' },
    ],

    rival: [
      { bg: 'lobby' },
      { hide: 'seoyun' },
      { show: ['dohyun', 'normal', 'left'] },
      { n: '대회 일주일 전, 예선 접수처.' },
      { show: ['chaea', 'normal', 'right'] },
      { s: ['chaea', '당신이 그 「거리 피아노」 천재? 악보도 못 읽는다던데.'] },
      { s: ['dohyun', '…누구시죠?'] },
      { s: ['chaea', '윤채아. 작년 이 대회 우승자. 한정훈 교수님 제자고. 올해도 내가 우승할 거니까, 기억해 둬.', 'smile'] },
      {
        if: (st) => st.flags.suspect,
        then: [{ s: ['chaea', '그리고… 교수님이 요즘 따님 학생 얘길 자주 하시던데. 약혼 앞두고 조심하는 게 좋을걸.', 'serious'] }],
        else: [{ s: ['chaea', '한서윤 선생님, 곧 강태준 씨랑 약혼하신다며? 당신한테 신경 쓸 시간이 있을까.', 'serious'] }],
      },
      {
        choice: [
          { t: '"그럼 무대에서 증명할게요."', skill: 1, then: [{ s: ['chaea', '…흥. 기대는 안 할게.', 'surprise'] }] },
          { t: '"선생님 얘기는 하지 마."', aff: 1, then: [{ s: ['chaea', '화났어? 재밌네. 결선에서 봐.', 'serious'] }] },
          { t: '대꾸하지 않고 지나친다', then: [{ s: ['chaea', '무시하는 거야? 좋아. 무대에서 보자.', 'normal'] }] },
        ],
      },
      { hide: 'chaea' },
      { go: 'prep' },
    ],

    prep: [
      { bg: 'academy' },
      { show: ['dohyun', 'normal', 'left'] },
      { show: ['seoyun', 'normal', 'right'] },
      { s: ['seoyun', '이제 결선 곡을 정할 시간이에요. 어려운 곡일수록 심사 점수는 높지만, 실수하면 그만큼 티가 나요.'] },
      { s: ['seoyun', '어떤 곡이든, 당신 소리로 치면 돼요.', 'smile'] },
      { pick: true },
      {
        if: (st) => st.pickedLevel >= 3,
        then: [{ s: ['seoyun', '…대담하네요. 그래도, 당신이라면 할 수 있어요.', 'surprise'] }],
        else: [
          {
            if: (st) => st.pickedLevel === 2,
            then: [{ s: ['seoyun', '좋은 선택이에요. 표현력을 보여줄 수 있어요.', 'smile'] }],
            else: [{ s: ['seoyun', '단순한 곡일수록 실력이 다 드러나요. 한 음 한 음 깨끗하게 가요.', 'normal'] }],
          },
        ],
      },
      {
        if: (st) => st.aff >= 4,
        then: [{ s: ['seoyun', '…대회 끝나면, 할 말이 있어요. 그러니까 꼭 잘해요.', 'blush'] }, { fx: 'heart' }],
      },
      { go: 'contest' },
    ],

    contest: [
      { bg: 'hall' },
      { hide: 'seoyun' },
      { hide: 'dohyun' },
      { n: '지역 피아노 콩쿠르 결선. 객석의 불이 꺼지고, 무대 위 스포트라이트만 남았다.' },
      { n: '객석 앞줄, 한정훈 교수와 강태준이 나란히 앉아 있었다.' },
      { s: ['mc', '다음 연주자, 윤채아 씨입니다.'] },
      { show: ['chaea', 'serious', 'center'] },
      { n: '완벽한 연주였다. 한 음도 흐트러지지 않는, 교과서 같은 소리.' },
      { s: ['mc', '윤채아 씨, 심사 점수 78.0점!'] },
      { hide: 'chaea' },
      { bg: 'backstage' },
      { show: ['dohyun', 'normal', 'left'] },
      { show: ['seoyun', 'serious', 'right'] },
      { s: ['seoyun', '긴장돼요? …나도요.'] },
      {
        choice: [
          {
            t: '"선생님 손, 잠깐만 잡아도 돼요?"',
            aff: 1,
            flag: 'hand',
            then: [{ s: ['seoyun', '…무대 뒤니까, 아무도 안 봐요. 잠깐만이에요.', 'blush'] }, { fx: 'heart' }],
          },
          { t: '"다녀올게요."', then: [{ s: ['seoyun', '다녀와요. 객석에서, 제일 크게 듣고 있을게요.', 'smile'] }] },
        ],
      },
      { s: ['mc', '마지막 연주자, 이도현 씨입니다.'] },
      { contest: { rival: 78, win: 'win', lose: 'lose' } },
    ],

    win: [
      { bg: 'hall' },
      { hide: 'seoyun' },
      { hide: 'dohyun' },
      { fx: 'flash' },
      { s: ['mc', '올해 지역 콩쿠르 우승은… 이도현 씨입니다!'] },
      { sfx: 'chime' },
      { n: '박수 소리가 파도처럼 밀려왔다. 객석 맨 뒤에서, 서윤 선생님이 두 손으로 입을 막고 있었다.' },
      { bg: 'backstage' },
      { show: ['dohyun', 'smile', 'left'] },
      { show: ['seoyun', 'blush', 'right'] },
      { s: ['seoyun', '해냈어요… 정말로.'] },
      { show: ['chaea', 'normal', 'center'] },
      { s: ['chaea', '…인정할게. 하지만 전국 대회에선 안 져.'] },
      { hide: 'chaea' },
      {
        choice: [
          { t: '트로피를 그녀에게 건넨다', aff: 1, then: [{ s: ['dohyun', '이건 선생님 거예요. 처음 저를 발견해 준 사람이니까.', 'smile'] }, { s: ['seoyun', '…바보.', 'blush'] }] },
          { t: '"다음은 전국 대회예요."', then: [{ s: ['seoyun', '그리고 그다음은… 세계죠.', 'smile'] }] },
          { t: '아무 말 없이 그녀를 바라본다', aff: 1, then: [{ n: '그녀도 눈을 피하지 않았다. 몇 초가, 아주 길게 느껴졌다.' }] },
        ],
      },
      {
        if: (st) => st.aff >= 5,
        then: [
          { s: ['seoyun', '도현 씨. 아까 하려던 말… 사실은—', 'blush'] },
          { n: '그 순간, 복도 끝에서 구두 소리가 울렸다.' },
          { show: ['taejun', 'serious', 'center'] },
          { s: ['taejun', '서윤 씨, 가죠. 장인어른이 기다리셔. 축하는 그 정도면 됐잖아.'] },
          { s: ['seoyun', '…네.', 'sad'] },
          { hide: 'taejun' },
          { hide: 'seoyun' },
          { s: ['dohyun', '(약혼자가 있는 사람. 강사와 수강생. 넘으면 안 되는 선. 그런데 왜, 이렇게 가까이 있는 걸까.)', 'sad'] },
        ],
        else: [{ s: ['seoyun', '오늘은 푹 쉬어요. 내일부터 전국 대회 준비예요.', 'smile'] }],
      },
      { n: '― 1장 · 지역 대회, 우승 ―' },
      { n: '다음 이야기: 전국 대회, 그리고 세계 콩쿠르의 문. (준비 중)' },
      { end: true },
    ],

    lose: [
      { bg: 'backstage' },
      { s: ['mc', '우승은 윤채아 씨입니다. 준우승, 이도현 씨.'] },
      { show: ['dohyun', 'sad', 'left'] },
      { show: ['seoyun', 'sad', 'right'] },
      { s: ['dohyun', '…죄송해요. 선생님이 못 간 무대, 대신 가겠다고 했는데.'] },
      { s: ['seoyun', '사과하지 마요. 오늘 소리, 나는 좋았어요.', 'smile'] },
      {
        choice: [
          { t: '"한 번만 더, 기회를 주세요."', skill: 1, then: [{ s: ['seoyun', '…좋아요. 이번엔 우승하러 가요.', 'serious'] }] },
          { t: '"다음엔 꼭 이길게요."', aff: 1, then: [{ s: ['seoyun', '그 말, 믿을게요.', 'smile'] }] },
        ],
      },
      { n: '― 다시 결선 준비로 돌아갑니다 ―' },
      { go: 'prep' },
    ],
  },
};
