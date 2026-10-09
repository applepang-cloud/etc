// 블록 맞추기 플레이 중 도현·서윤이 가끔 하는 말과 결과 화면의 서윤 한마디.
// 한 줄 = [누가, 대사, 표정]. 표정은 portraits.js 의 expr. 괄호 대사는 도현의 속마음.
// 대사를 고치면 tools/gen-voices.mjs 를 다시 돌려 음성을 만든다.

export const BANTER = {
  start: [
    ['seoyun', '자, 천천히. 손끝으로 먼저 들어 봐요.', 'smile'],
    ['seoyun', '긴장 풀고요. 첫 음부터 하나씩.', 'normal'],
    ['seoyun', '오늘도 잘 부탁해요, 도현 씨.', 'smile'],
    ['dohyun', '좋아, 해 보자.', 'normal'],
    ['dohyun', '(선생님이 보고 있으니까… 괜히 긴장되네.)', 'blush'],
  ],
  startHard: [
    ['dohyun', '이 곡은 조금 어렵네요…', 'serious'],
    ['seoyun', '어려운 곡이에요. 그래도 도현 씨라면 할 수 있어요.', 'smile'],
  ],
  startBand: [
    ['seoyun', '합주는 서로의 소리를 듣는 게 제일 중요해요.', 'normal'],
    ['seoyun', '드럼이랑 노래까지, 한 곡을 같이 완성해 봐요.', 'smile'],
  ],
  startFree: [
    ['seoyun', '오늘은 도현 씨 마음대로 쳐 봐요. 어떤 곡이 나올지 기대돼요.', 'smile'],
    ['dohyun', '(악보 없이 그냥… 떠오르는 대로.)', 'normal'],
  ],
  // 곡을 시작할 때 가끔 (합주 곡은 band- 를 뗀 id 로 찾는다)
  song: {
    twinkle: [
      ['seoyun', '반짝 반짝 작은 별~ 아, 저도 모르게 따라 불렀네요.', 'blush'],
      ['dohyun', '(반짝 반짝 작은 별… 어릴 때 엄마가 자주 불러 줬는데.)', 'normal'],
    ],
    jingle: [
      ['seoyun', '징글벨! 벌써 크리스마스가 온 것 같아요.', 'smile'],
    ],
    mary: [
      ['seoyun', '떴다 떴다 비행기~ 이 곡은 다들 한 번쯤 쳐 봤을 거예요.', 'smile'],
    ],
    lightly: [
      ['seoyun', '나비야 나비야~ 봄 냄새가 나는 곡이죠.', 'smile'],
    ],
    birthday: [
      ['seoyun', '생일 축하합니다~ 누구 생일이라도 된 것 같네요.', 'smile'],
      ['dohyun', '(생일 축하… 마지막으로 축하받은 게 언제였더라.)', 'sad'],
    ],
    frere: [
      ['seoyun', '자크 형제, 돌림노래로 부르면 정말 재밌어요.', 'smile'],
    ],
    london: [
      ['seoyun', '런던 다리가 무너진대요~ 가사는 무서운데 멜로디는 귀엽죠.', 'smile'],
    ],
    silent: [
      ['seoyun', '고요한 밤… 이 곡을 들으면 눈 오는 밤이 떠올라요.', 'normal'],
    ],
    minuet: [
      ['seoyun', '미뉴에트… 이 노래 들으니 옛날 생각이 나네요. 처음 무대에 섰을 때 친 곡이에요.', 'sad'],
      ['seoyun', '이 곡은 제가 어릴 때 제일 많이 연습한 곡이에요.', 'normal'],
    ],
    ode: [
      ['seoyun', '환희의 송가. 들을 때마다 가슴이 벅차올라요.', 'smile'],
    ],
    elise: [
      ['seoyun', '엘리제를 위하여… 아버지가 제일 좋아하시던 곡이에요.', 'sad'],
      ['dohyun', '이 곡… 역에서 처음 선생님을 만났을 때 친 곡이네요.', 'blush'],
    ],
  },
  fantastic: [
    ['seoyun', '좋아요, 딱 맞았어요!', 'smile'],
    ['seoyun', '바로 그 느낌이에요.', 'smile'],
    ['seoyun', '역시, 귀가 정말 좋네요.', 'smile'],
    ['dohyun', '(됐다!)', 'smile'],
  ],
  combo: [
    ['seoyun', '연속으로 맞추고 있어요. 리듬을 탔네요!', 'surprise'],
    ['seoyun', '와, 멈추지 말아요. 그대로!', 'smile'],
    ['dohyun', '(손이 저절로 움직여…)', 'smile'],
  ],
  bad: [
    ['seoyun', '괜찮아요. 다음 음에 집중해요.', 'normal'],
    ['seoyun', '음, 조금 빗나갔네요. 다시 들어 봐요.', 'serious'],
    ['dohyun', '(으, 손이 꼬였다…)', 'sad'],
    ['dohyun', '(선생님이 쳐다보니까 더 긴장되네…)', 'blush'],
  ],
  clear: [
    ['seoyun', '한 페이지 깔끔하게! 박수 쳐 줄게요.', 'smile'],
    ['seoyun', '완벽해요. 이 페이지는 만점이에요.', 'smile'],
  ],
  timeup: [
    ['seoyun', '시간이 다 됐네요. 괜찮아요, 다음 페이지에서.', 'normal'],
  ],
  idle: [
    ['seoyun', '어디에 놓을지 고민돼요? 흘러오는 음을 따라가 봐요.', 'normal'],
    ['seoyun', '천천히 해도 돼요. 기다릴게요.', 'smile'],
    ['dohyun', '(음… 이건 어디에 놓지.)', 'serious'],
  ],
  bomb: [
    ['seoyun', '과감하네요!', 'surprise'],
    ['seoyun', '깔끔하게 정리했네요.', 'smile'],
  ],
  // 결과 화면 (별 개수별, 서윤)
  result3: [
    ['seoyun', '완벽했어요! 당장 무대에 세워도 되겠어요.', 'smile'],
    ['seoyun', '말도 안 돼… 정말 처음 치는 곡 맞아요?', 'surprise'],
    ['seoyun', '오늘 연주, 오래오래 기억할 것 같아요.', 'blush'],
  ],
  result2: [
    ['seoyun', '잘했어요! 조금만 더 다듬으면 완벽해요.', 'smile'],
    ['seoyun', '좋은 연주였어요. 다음엔 별 세 개, 노려 봐요.', 'smile'],
  ],
  result1: [
    ['seoyun', '아쉽네요. 그래도 중간중간 정말 좋은 부분이 있었어요.', 'normal'],
    ['seoyun', '조금 아쉬워요. 우리 한 번만 더 해 볼까요?', 'sad'],
  ],
  result0: [
    ['seoyun', '괜찮아요. 처음부터 잘하는 사람은 없어요.', 'sad'],
    ['seoyun', '실패해도 괜찮아요. 저도 수없이 틀렸는걸요.', 'smile'],
    ['seoyun', '오늘은 손이 덜 풀렸나 봐요. 다시 해 봐요, 같이.', 'normal'],
  ],
  resultFree: [
    ['seoyun', '도현 씨만의 곡이 생겼네요. 정말 멋져요.', 'smile'],
    ['seoyun', '이 멜로디, 저도 계속 흥얼거리게 될 것 같아요.', 'blush'],
  ],
};

// 대본 전체를 한 줄씩 (음성 생성용)
export function allBanterLines() {
  const out = [];
  for (const v of Object.values(BANTER)) {
    if (Array.isArray(v)) out.push(...v);
    else for (const list of Object.values(v)) out.push(...list);
  }
  return out;
}
