'use strict';
/* 게임 데이터: 코인, 뉴스 템플릿, 유튜브 채널, 매니저, 채굴, 주식, 부동산, 사업, 라이프 */

/* ---------- 코인 ----------
   p: 시작가(원), vol: 일 변동성, rho: 시장(BTC) 상관, trend: 장기 일 드리프트,
   liq: 1% 가격 이동에 필요한 원화(유동성), dv: 일 거래대금, sup: 유통량
   real: 실제 존재하는 코인(참고 링크 제공), fut: 선물 지원, stake: 일 스테이킹 보상률, rug: 일 러그풀 확률 */
const COINS = [
  { sym: 'BTC', name: '비트코인', en: 'Bitcoin', p: 140000000, vol: 0.045, rho: 0.95, trend: 0.003, liq: 8e9, dv: 4e11, sup: 19.9e6, color: '#f7931a', tags: ['major', 'etf', 'real'], fut: true, real: true,
    desc: '최초의 암호화폐이자 시장의 기준. 반감기마다 채굴 보상이 절반으로 줄어듭니다.' },
  { sym: 'ETH', name: '이더리움', en: 'Ethereum', p: 5200000, vol: 0.055, rho: 0.88, trend: 0.003, liq: 3e9, dv: 2.5e11, sup: 120.5e6, color: '#627eea', tags: ['major', 'etf', 'l1', 'real'], fut: true, stake: 0.0008, real: true,
    desc: '스마트 계약 플랫폼 1위. 지분증명(PoS) 스테이킹으로 이자를 받을 수 있습니다.' },
  { sym: 'XRP', name: '리플', en: 'XRP', p: 3900, vol: 0.07, rho: 0.75, trend: 0.002, liq: 1.5e9, dv: 3e11, sup: 58e9, color: '#4a7aa8', tags: ['alt', 'etf', 'real'], fut: true, real: true,
    desc: '국제 송금용 코인. 국내 거래량이 유독 많은 "국민 코인".' },
  { sym: 'SOL', name: '솔라나', en: 'Solana', p: 280000, vol: 0.07, rho: 0.85, trend: 0.003, liq: 1e9, dv: 1.2e11, sup: 480e6, color: '#9945ff', tags: ['alt', 'etf', 'l1', 'real'], fut: true, stake: 0.0015, real: true,
    desc: '빠른 처리 속도의 레이어1. 밈코인 발행의 중심지이기도 합니다.' },
  { sym: 'DOGE', name: '도지코인', en: 'Dogecoin', p: 380, vol: 0.09, rho: 0.72, trend: 0.001, liq: 8e8, dv: 1.5e11, sup: 148e9, color: '#c2a633', tags: ['meme', 'real'], fut: true, real: true, mine: 1.0,
    desc: '원조 밈코인. 억만장자의 SNS 한 줄에 크게 출렁입니다. 채굴 가능.' },
  { sym: 'ADA', name: '에이다', en: 'Cardano', p: 1150, vol: 0.075, rho: 0.78, trend: 0.0015, liq: 5e8, dv: 4e10, sup: 36e9, color: '#2a6fdb', tags: ['alt', 'l1', 'real'], stake: 0.001, real: true,
    desc: '학술 연구 기반으로 개발되는 레이어1 플랫폼.' },
  { sym: 'AVAX', name: '아발란체', en: 'Avalanche', p: 42000, vol: 0.085, rho: 0.8, trend: 0.002, liq: 4e8, dv: 3e10, sup: 420e6, color: '#e84142', tags: ['alt', 'l1', 'real'], stake: 0.0018, real: true,
    desc: '서브넷 구조의 고성능 레이어1. 스테이킹 보상이 높은 편입니다.' },
  { sym: 'LINK', name: '체인링크', en: 'Chainlink', p: 28000, vol: 0.08, rho: 0.78, trend: 0.0025, liq: 4e8, dv: 3e10, sup: 680e6, color: '#375bd2', tags: ['alt', 'real'], real: true,
    desc: '블록체인에 외부 데이터를 연결하는 오라클 네트워크.' },
  { sym: 'SHIB', name: '시바이누', en: 'Shiba Inu', p: 0.032, vol: 0.11, rho: 0.65, trend: 0.0005, liq: 3e8, dv: 3e10, sup: 589e12, color: '#e2541b', tags: ['meme', 'real'], real: true,
    desc: '도지코인의 대항마로 등장한 밈코인. 1원도 안 되는 가격에 수량 맛으로 삽니다.' },
  { sym: 'PEPE', name: '페페', en: 'Pepe', p: 0.021, vol: 0.14, rho: 0.6, trend: 0, liq: 3e8, dv: 6e10, sup: 420e12, color: '#3d9a3d', tags: ['meme', 'real'], real: true,
    desc: '개구리 밈 기반 코인. 변동성이 매우 큽니다.' },
  { sym: 'AIX', name: '에이아이엑스', en: 'AIX', p: 2400, vol: 0.15, rho: 0.5, trend: 0.002, liq: 1e8, dv: 1.5e10, sup: 1e9, color: '#14a89a', tags: ['ai', 'fict'],
    desc: '(가상) AI 에이전트 결제용 토큰. AI 테마 뉴스에 민감합니다.' },
  { sym: 'KMC', name: '김치코인', en: 'KimchiCoin', p: 120, vol: 0.18, rho: 0.35, trend: -0.001, liq: 5e7, dv: 8e9, sup: 2e9, color: '#d9472b', tags: ['kr', 'fict'], rug: 0.005, mine: 1.7,
    desc: '(가상) 국내 재단이 발행한 잡코인. 채굴 효율이 높지만 러그풀 위험이 있습니다.' },
  { sym: 'DTR', name: '도토리', en: 'Dotori', p: 15, vol: 0.2, rho: 0.3, trend: -0.002, liq: 3e7, dv: 4e9, sup: 1e10, color: '#a0672b', tags: ['kr', 'fict'], stake: 0.008, rug: 0.007,
    desc: '(가상) 국산 디파이 토큰. 스테이킹 이자가 매우 높지만 그만큼 위험합니다.' },
  { sym: 'MOON', name: '문샷', en: 'Moonshot', p: 0.8, vol: 0.25, rho: 0.25, trend: -0.004, liq: 2e7, dv: 5e9, sup: 1e12, color: '#8b5cf6', tags: ['meme', 'fict'], rug: 0.012,
    desc: '(가상) 갓 상장한 밈코인. 하루에 몇 배씩 오르내리고 러그풀 확률도 가장 높습니다.' },
];
const COIN = Object.fromEntries(COINS.map(c => [c.sym, c]));

const COIN_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'own', label: '보유' },
  { id: 'fav', label: '관심' },
  { id: 'major', label: '메이저' },
  { id: 'alt', label: '알트' },
  { id: 'meme', label: '밈' },
  { id: 'fict', label: '잡코인' },
];

const COIN_POOLS = {
  any: COINS.map(c => c.sym),
  real: COINS.filter(c => c.real).map(c => c.sym),
  major: ['BTC', 'ETH'],
  btc: ['BTC'],
  alt: COINS.filter(c => c.tags.includes('alt')).map(c => c.sym),
  meme: COINS.filter(c => c.tags.includes('meme')).map(c => c.sym),
  fict: COINS.filter(c => c.tags.includes('fict')).map(c => c.sym),
  kr: ['KMC', 'DTR'],
  ai: ['AIX'],
  etf: ['BTC', 'ETH', 'SOL', 'XRP'],
  l1: ['ETH', 'SOL', 'ADA', 'AVAX'],
  listable: ['ADA', 'AVAX', 'LINK', 'SHIB', 'PEPE', 'AIX', 'KMC', 'DTR', 'MOON'],
};

const KR_EX = ['한빛거래소', '코인마루', '비트온', '업플로우'];
const GL_EX = ['Binora', 'CoinPort', 'Krakenix', 'OKEY'];
const CORPS = ['메타소프트', '테슬로', '마이크로웨어', '블록록 자산운용', '스트래티지랩'];
const KR_SRC = ['코인일보', '한빛경제', '블록타임스 코리아', '디지털자산신문', '서울파이낸스데일리'];
const GL_SRC = ['CoinWire', 'The Ledger Post', 'Global Crypto Times', 'Hashline', 'Satoshi Street'];

/* ---------- 뉴스 템플릿 ----------
   tone: +1 호재 / -1 악재, pool: 대상 코인 풀(null=시장 전체, 'none'=코인 영향 없음)
   mag: 누적 영향(로그수익률), dur: 반영 기간(틱), perm: 영구 반영 비율, rev: 재료 소멸(되돌림) 비율
   cred: 신뢰도(루머), big: 속보, fx: 부가 효과, all: 풀 전체 코인에 적용 */
const NEWS_KR = [
  { w: 3, tone: 1, pool: null, mag: [0.02, 0.045], dur: 60, perm: 0.5, t: '금융위, 가상자산 2단계 법안 발표…"제도권 편입 가속"', b: '법인 투자 허용과 이용자 보호 장치를 함께 담았다. 업계는 시장 신뢰도가 높아질 것이라며 환영했다.' },
  { w: 2, tone: -1, pool: null, mag: [0.02, 0.04], dur: 50, perm: 0.3, t: '국세청, 가상자산 과세 일정 재확인…"추가 유예 없다"', b: '코인 양도차익 과세가 예정대로 시행될 가능성이 커지면서 투자 심리가 위축됐다.' },
  { w: 1.5, tone: 1, pool: 'listable', mag: [0.15, 0.45], dur: 25, perm: 0.2, rev: 0.6, revDelay: 40, big: true, t: '{ex}, {c}({s}) 원화마켓 신규 상장', b: '상장 직후 매수 주문이 몰리며 체결이 일시 지연됐다. 단기 급등 뒤 변동성 확대에 유의해야 한다.' },
  { w: 1, tone: -1, pool: 'fict', mag: [0.2, 0.4], dur: 20, perm: 0.4, big: true, fx: 'warn', t: '{ex}, {c}({s}) 투자유의 종목 지정', b: '유통량 공시 위반 의혹으로 거래소가 투자유의를 지정했다. 소명에 실패하면 상장폐지될 수 있다.' },
  { w: 2, tone: 1, pool: null, mag: [0.008, 0.02], dur: 40, rev: 0.8, revDelay: 60, fx: 'kpUp', t: '김치 프리미엄 {kp}% 돌파…국내 매수세 과열', b: '해외 시세보다 국내 시세가 높게 형성되며 개인 투자자 매수가 급증했다. 과거 김프 고점은 단기 꼭지와 겹친 경우가 많았다.' },
  { w: 2, tone: 1, pool: null, mag: [0.015, 0.035], dur: 50, perm: 0.5, t: '대형 증권사 3곳, 가상자산 수탁 사업 진출 선언', b: '기관 자금이 들어올 통로가 열린다는 기대감이 커졌다.' },
  { w: 2, tone: 1, pool: null, mag: [0.015, 0.03], dur: 50, perm: 0.4, t: '시중은행, 법인 코인 계좌 개설 허용', b: '상장사와 대학 기금도 가상자산 투자가 가능해진다.' },
  { w: 2, tone: -1, pool: null, mag: [0.01, 0.02], dur: 30, perm: 0.1, t: '보이스피싱 연루 계좌 대거 동결…원화 입출금 지연', b: '일부 거래소에서 원화 출금이 최대 72시간 지연되고 있다.' },
  { w: 2, tone: 1, pool: 'real', mag: [0.04, 0.1], dur: 40, perm: 0.4, t: '{c} 재단, 국내 대기업과 블록체인 파트너십 체결', b: '결제·물류 분야에서 {s} 네트워크를 시범 도입한다.' },
  { w: 1, tone: -1, pool: null, mag: [0.01, 0.025], dur: 15, fx: 'volUp', t: '{ex} 서버 장애로 1시간 거래 중단…집단소송 예고', b: '급등 구간에서 주문이 체결되지 않아 피해를 봤다는 민원이 쏟아졌다.' },
  { w: 2, tone: 1, pool: 'kr', mag: [0.12, 0.3], dur: 30, perm: 0.3, rev: 0.4, revDelay: 50, t: '국내 게임사, {c}({s}) 기반 아이템 거래소 도입', b: '이용자 300만 명 규모의 게임에 토큰 결제가 붙는다.' },
  { w: 1, tone: -1, pool: null, mag: [0.008, 0.02], dur: 30, t: '금감원, 코인 리딩방 불법행위 집중 단속', b: '유료 리딩방 운영자 40여 명이 수사기관에 넘겨졌다.' },
  { w: 2, tone: 1, pool: null, mag: [0.01, 0.025], dur: 30, rev: 0.5, revDelay: 60, fx: 'fgUp', t: '국내 코인 거래대금 하루 {n}조 돌파…"불장 왔다"', b: '코스피 거래대금을 넘어섰다. 신규 가입자의 절반이 20~30대다.' },
  { w: 1, tone: -1, pool: 'none', fx: 'reDown', t: '정부, 수도권 주택담보대출 규제 강화', b: 'DSR 규제가 강화되며 부동산 매수 심리가 얼어붙었다.' },
  { w: 1, tone: 1, pool: 'none', fx: 'reUp', t: '서울 아파트 청약 경쟁률 역대 최고…"집값 바닥 찍었다"', b: '강남권 청약에 수만 명이 몰렸다.' },
  { w: 1, tone: 1, pool: 'none', fx: 'kospiUp', t: '외국인 코스피 1조원 순매수…반도체 랠리', b: '반도체 업황 개선 기대감에 대형주가 일제히 올랐다.' },
  { w: 1, tone: -1, pool: 'none', fx: 'kospiDown', t: '코스피, 수출 부진 우려에 2% 급락', b: '외국인과 기관이 동반 매도에 나섰다.' },
  { w: 1, tone: -1, pool: 'fict', mag: [0.08, 0.2], dur: 20, cred: 0.6, t: '{c}({s}) 재단 지갑에서 대량 물량 이동 포착', b: '재단 측은 "단순 지갑 정리"라고 해명했지만 커뮤니티는 술렁이고 있다.' },
  { w: 1, tone: 1, pool: 'ai', mag: [0.1, 0.22], dur: 25, rev: 0.4, revDelay: 40, t: '국내 AI 스타트업, {c}({s}) 결제 도입 발표', b: 'AI 에이전트끼리 {s}로 서비스 이용료를 주고받는 구조다.' },
  { w: 1, tone: -1, pool: null, mag: [0.008, 0.018], dur: 30, t: '"코인 빚투" 20대 연체율 급증…금융당국 경고', b: '레버리지 투자 손실이 신용대출 연체로 번지고 있다.' },
  { w: 1, tone: 1, pool: 'none', fx: 'elecDown', t: '한전, 산업용 전기요금 동결 발표', b: '채굴업계와 제조업계가 한숨 돌렸다.' },
  { w: 1, tone: -1, pool: 'none', fx: 'elecUp', t: '산업용 전기요금 10% 인상…채굴업계 비상', b: '전기료 비중이 큰 채굴장 수익성이 크게 악화될 전망이다.' },
];

const NEWS_GL = [
  { w: 0.6, tone: 1, pool: 'etf', etf: 'approve', mag: [0.08, 0.16], dur: 50, perm: 0.6, big: true, fx: 'bull', spill: 0.35, t: '美 SEC, {c} 현물 ETF 최종 승인', b: '월가 자금이 본격적으로 들어올 수 있게 됐다. 시장 전반이 들썩였다.' },
  { w: 1.2, tone: -1, pool: 'etf', etf: 'delay', mag: [0.02, 0.05], dur: 30, perm: 0.2, t: 'SEC, {c} ETF 승인 결정 또 연기', b: '추가 의견 수렴을 이유로 결정을 45일 미뤘다.' },
  { w: 1, tone: -1, pool: null, mag: [0.03, 0.07], dur: 30, perm: 0.3, big: true, fx: 'volUp', t: '해외 대형 거래소 {gx} 해킹…{n}억 달러 규모 유출', b: '핫월렛에서 자산이 빠져나갔다. 거래소는 입출금을 전면 중단했다.' },
  { w: 3, tone: -1, pool: 'real', mag: [0.02, 0.05], dur: 20, cred: 0.7, t: '고래 지갑, {c} {q}개 거래소로 이동', b: '대량 매도 물량이 될 수 있다는 우려가 나온다.' },
  { w: 2, tone: 1, pool: 'major', mag: [0.04, 0.08], dur: 40, perm: 0.5, t: '글로벌 기업 {corp}, 재무제표에 {c} 편입', b: '현금성 자산 일부를 {s}로 보유하기로 했다.' },
  { w: 2, tone: 1, pool: 'l1', mag: [0.04, 0.1], dur: 40, perm: 0.4, rev: 0.3, revDelay: 40, t: '{c} 네트워크 대규모 업그레이드 성공', b: '수수료가 절반 이하로 내려가고 처리 속도가 빨라졌다.' },
  { w: 2, tone: -1, pool: 'l1', mag: [0.05, 0.1], dur: 25, perm: 0.2, t: '{c} 메인넷 {h}시간 블록 생성 중단', b: '검증인 소프트웨어 버그가 원인으로 지목됐다.' },
  { w: 1.5, tone: 1, pool: 'meme', mag: [0.1, 0.3], dur: 12, rev: 0.9, revDelay: 20, big: true, t: '억만장자 CEO, SNS에 "{s} to the moon" 게시', b: '게시 5분 만에 거래량이 10배로 뛰었다.' },
  { w: 1, tone: -1, pool: 'btc', mag: [0.02, 0.04], dur: 30, fx: 'mineDown', t: '중국, 가상자산 채굴 단속 재강화', b: '채굴업자들이 대거 이탈하면서 채굴 난이도가 떨어질 전망이다.' },
  { w: 2, tone: -1, pool: null, mag: [0.02, 0.04], dur: 40, fx: 'nasdaqDown', t: '美 CPI 예상치 상회…금리 인하 기대 후퇴', b: '물가가 잡히지 않으면서 위험자산 전반이 약세다.' },
  { w: 2, tone: 1, pool: null, mag: [0.015, 0.035], dur: 40, fx: 'nasdaqUp', t: '美 고용지표 둔화…"다음 FOMC 금리 인하 유력"', b: '채권 금리가 급락하고 위험자산 선호가 살아났다.' },
  { w: 1, tone: -1, pool: 'btc', mag: [0.03, 0.06], dur: 30, cred: 0.5, big: true, t: '"美 정부, 압류 비트코인 대량 매각 준비" 보도', b: '정부 지갑에서 테스트 송금이 포착됐다는 주장이 나왔다.' },
  { w: 1, tone: 1, pool: 'major', mag: [0.04, 0.08], dur: 40, cred: 0.6, t: '중동 국부펀드, {c} 대규모 매입 착수설', b: '복수의 관계자가 "검토 중"이라고 전했다.' },
  { w: 2, tone: 1, pool: 'alt', mag: [0.03, 0.07], dur: 20, rev: 0.5, revDelay: 30, t: '{gx}, {c} 무기한 선물 신규 상장', b: '최대 50배 레버리지가 지원된다.' },
  { w: 1, tone: -1, pool: 'alt', mag: [0.04, 0.09], dur: 30, t: '美 법원, {c} 증권성 판단 재심리 결정', b: '규제 불확실성이 다시 커졌다.' },
  { w: 1, tone: 1, pool: 'ai', mag: [0.1, 0.25], dur: 25, cred: 0.55, rev: 0.3, revDelay: 40, t: '글로벌 빅테크, AI 에이전트 결제에 {c} 채택 검토', b: '내부 문건에 {s} 이름이 등장했다는 보도다.' },
  { w: 2, tone: -1, pool: null, mag: [0.01, 0.03], dur: 20, fx: 'volUp', t: '비트코인 선물 미결제약정 사상 최대…"청산 폭탄 주의"', b: '레버리지가 과도하게 쌓여 작은 충격에도 연쇄 청산이 날 수 있다.' },
  { w: 1, tone: 1, pool: 'none', fx: 'nasdaqUp', t: '나스닥, AI 반도체 실적 서프라이즈에 신고가', b: '빅테크 실적이 시장 예상을 크게 웃돌았다.' },
  { w: 1, tone: -1, pool: 'none', fx: 'nasdaqDown', t: '뉴욕증시, 경기침체 우려에 일제히 하락', b: '장단기 금리 역전이 다시 심해졌다.' },
  { w: 1, tone: 1, pool: null, mag: [0.02, 0.04], dur: 50, perm: 0.5, t: '스테이블코인 법안 美 상원 통과', b: '달러 스테이블코인이 제도권에 편입된다.' },
  { w: 1, tone: -1, pool: 'meme', all: true, mag: [0.05, 0.12], dur: 40, t: '밈코인 거래량 급감…"투기 열기 식었다"', b: '신규 밈코인 발행 건수도 한 달 새 70% 줄었다.' },
];

/* 시장 국면 */
const REGIMES = {
  side:  { name: '횡보장', drift: 0,        vm: 1.0,  len: [120, 360] },
  bull:  { name: '상승장', drift: 0.00035,  vm: 1.05, len: [240, 600] },
  bear:  { name: '하락장', drift: -0.00035, vm: 1.1,  len: [240, 600] },
  mania: { name: '광기',   drift: 0.0012,   vm: 1.5,  len: [60, 180] },
  crash: { name: '패닉',   drift: -0.0018,  vm: 1.8,  len: [25, 80] },
};

const REGIME_NEWS = {
  mania: { cat: 'gl', t: '비트코인 신고가 경신…"포모(FOMO) 매수 폭발"', b: '전 세계 거래소 신규 가입자가 하루 만에 두 배로 늘었다.' },
  crash: { cat: 'gl', t: '[속보] 코인 시장 급락…24시간 선물 청산 {n}조원', b: '연쇄 청산이 이어지며 알트코인 낙폭이 더 컸다.' },
  bull:  { cat: 'kr', t: '코인 시장 훈풍…"상승 추세 전환" 분석', b: '이동평균선이 정배열로 돌아섰다는 분석이 나온다.' },
  bear:  { cat: 'kr', t: '코인 투자심리 냉각…거래대금 3개월 최저', b: '관망세가 짙어지며 하락 추세가 이어지고 있다.' },
};

/* ---------- 유튜브 ---------- */
const YT_CH = [
  { name: '코인왕 김부자TV', subs: 870000, style: 'hype', hue: 8 },
  { name: '차트 읽어주는 남자', subs: 420000, style: 'analyst', hue: 210 },
  { name: '존버의 신', subs: 250000, style: 'hodl', hue: 40 },
  { name: '곧 폭락 연구소', subs: 310000, style: 'doom', hue: 270 },
  { name: '경제 읽어주는 형', subs: 1200000, style: 'calm', hue: 160 },
  { name: 'Crypto Wolf', subs: 2100000, style: 'hype', hue: 330 },
  { name: 'Moon Mission TV', subs: 640000, style: 'hype', hue: 280 },
  { name: '코린이 탈출기', subs: 95000, style: 'diary', hue: 190 },
  { name: '월가 아재', subs: 530000, style: 'analyst', hue: 225 },
];

const YT_STYLE = {
  hype: {
    rel: 0.3, bait: true, tone: 1, pool: ['meme', 'fict', 'alt'], mag: [0.03, 0.09],
    titles: ['[긴급] {c} 지금 안 사면 평생 후회합니다 ㄷㄷ', '{c} 100배 간다… 세력 매집 끝났습니다', '이번 불장 마지막 기회! {c} 목표가 공개', '{s} 떡상 신호 떴다!! 당장 확인하세요'],
    points: ['근거 없이 목표가만 반복 강조', '"지금 안 사면 늦는다"며 조급함 유도', '댓글창은 "가즈아"로 도배'],
  },
  doom: {
    rel: 0.3, bait: true, tone: -1, pool: ['major'], mag: [0.01, 0.03], market: true,
    titles: ['곧 폭락 옵니다. 지금 당장 대피하세요', '비트코인 반토막 시나리오, 이렇게 대비하세요', '{c} 고점 신호 3가지… 저는 전량 매도했습니다'],
    points: ['과거 폭락 차트와 단순 비교', '공포를 자극하는 빨간 썸네일', '구체적인 시점은 끝까지 말하지 않음'],
  },
  analyst: {
    rel: 0.68, tone: 0, pool: ['real'], mag: [0.005, 0.015],
    titles: ['{c} 차트 분석: 이 자리 반드시 지켜야 합니다', '{c} 주봉 골든크로스? 냉정하게 분석했습니다', '세력 평단가 계산해보니… {c} 지금 위치는?'],
    points: ['지지선·저항선 기준 시나리오 2가지 제시', '거래량 증감으로 수급 동향 추정', '손절 라인부터 정하라고 조언'],
  },
  calm: {
    rel: 0.72, tone: 0, pool: ['major'], mag: [0.003, 0.01], market: true,
    titles: ['금리와 코인, 이번 FOMC가 중요한 이유', '김치 프리미엄 {kp}%… 지금 사도 될까?', '코인 vs 부동산 vs 주식, 지금 돈 어디에 넣을까'],
    points: ['거시경제 지표와 코인의 상관관계 설명', '분산 투자와 현금 비중 강조', '단기 가격 예측은 자제'],
  },
  hodl: {
    rel: 0.5, tone: 1, pool: ['major'], mag: [0.002, 0.008],
    titles: ['비트코인 매일 1만원씩 1년 모은 결과', '{c} 존버 3년차, 계좌 공개합니다', '하락장에 더 사는 이유 (feat. 반감기)'],
    points: ['장기 적립식 매수 결과 공개', '단기 등락에 흔들리지 말 것', '수수료와 세금까지 계산한 실수익 공개'],
  },
  diary: {
    rel: 0.5, tone: 0, flavor: true, pool: ['any'], mag: [0, 0],
    titles: ['월급 300 직장인 코인 적립식 6개월 후기', '코린이가 레버리지 쓰면 생기는 일 (실화)', '매니저 고용해서 코인 굴려봤습니다'],
    points: ['초보자 시행착오 공유', '수익보다 손실 경험 위주', '재미 위주 브이로그 구성'],
  },
};

/* ---------- 연속 보도: 단계별로 이어지는 이슈 ----------
   steps는 차례대로 보도된다. branch 단계는 시작할 때 결과가 정해지지만(인맥 귀띔으로만 미리 알 수 있음) 보도 전까지 공개되지 않는다.
   gap: 다음 보도까지 틱, 나머지 필드는 뉴스 템플릿과 같다 */
const STORIES = [
  { id: 'etf', name: '현물 ETF 심사', cat: 'gl', pool: 'etf', etf: true, w: 1, steps: [
    { t: '자산운용사 5곳, {c} 현물 ETF 신청서 제출', b: '승인되면 연기금과 기관 자금이 {s}에 직접 들어올 수 있다.', tone: 1, mag: [0.03, 0.06], dur: 40, gap: [70, 130] },
    { t: 'SEC, {c} ETF 의견 수렴 기간 연장', b: '시장 감시 체계에 대한 추가 자료를 요구했다. 최종 결정은 다음 달로 밀렸다.', tone: -1, mag: [0.02, 0.04], dur: 30, gap: [70, 130] },
    { branch: [
      { p: 0.6, t: '[속보] 美 SEC, {c} 현물 ETF 최종 승인', b: '첫날 거래대금이 수십억 달러에 이를 전망이다. 시장 전반이 들썩였다.', tone: 1, mag: [0.08, 0.15], dur: 50, perm: 0.6, big: true, fx: 'bull', spill: 0.3, etfDone: true, hint: '승인 쪽으로 기울었다' },
      { p: 0.4, t: '[속보] SEC, {c} 현물 ETF 거절…"시장 조작 우려 여전"', b: '업계는 즉시 재신청하겠다고 밝혔지만 실망 매물이 쏟아졌다.', tone: -1, mag: [0.06, 0.1], dur: 40, big: true, hint: '거절될 것 같다' },
    ] },
  ] },
  { id: 'hack', name: '거래소 해킹 사태', cat: 'gl', pool: null, w: 1, steps: [
    { t: '[속보] 해외 거래소 {gx} 출금 전면 중단…해킹 의심', b: '거래소는 "정기 점검"이라고 밝혔지만 대량 출금 흔적이 포착됐다.', tone: -1, mag: [0.02, 0.04], dur: 20, big: true, fx: 'volUp', gap: [25, 50] },
    { t: '{gx} "핫월렛 해킹 확인…피해 {n}억 달러"', b: '도난 자산 일부가 다른 거래소로 옮겨지고 있다.', tone: -1, mag: [0.02, 0.05], dur: 30, gap: [50, 100] },
    { branch: [
      { p: 0.6, t: '{gx}, 피해액 전액 보상 발표…출금 재개', b: '자체 보험 기금으로 고객 피해를 메우기로 했다. 시장이 안도했다.', tone: 1, mag: [0.03, 0.05], dur: 30, hint: '전액 보상한다' },
      { p: 0.4, t: '[속보] {gx} 파산 신청…고객 자산 동결', b: '고객 자산 수십억 달러가 묶였다. 연쇄 청산 우려가 커졌다.', tone: -1, mag: [0.05, 0.09], dur: 40, big: true, fx: 'volUp', hint: '파산까지 갈 것 같다' },
    ] },
  ] },
  { id: 'listing', name: '원화마켓 상장설', cat: 'kr', pool: 'listable', w: 1.3, steps: [
    { t: '"{ex}, {c} 원화마켓 상장 검토" 업계 소식', b: '거래소 측은 "확인해 줄 수 없다"는 입장이다.', tone: 1, mag: [0.05, 0.12], dur: 25, cred: true, gap: [40, 90] },
    { branch: [
      { p: 0.65, t: '{ex}, {c}({s}) 원화마켓 상장 확정 공지', b: '공지 직후 매수 주문이 몰렸다. 상장 직후 고점에 물리는 투자자가 많다는 경고도 나온다.', tone: 1, mag: [0.15, 0.35], dur: 25, big: true, rev: 0.55, revDelay: 35, hint: '상장 공지 곧 나간다' },
      { p: 0.35, t: '{ex} "{c} 상장 계획 없다" 공식 부인', b: '상장 기대감으로 올랐던 가격이 빠르게 되돌려지고 있다.', tone: -1, mag: [0.08, 0.15], dur: 20, hint: '상장 계획 없다' },
    ] },
  ] },
  { id: 'law', name: '가상자산법 국회 처리', cat: 'kr', pool: null, w: 1, steps: [
    { t: '여야, 가상자산 2단계법 발의…법인 투자 허용 담아', b: '스테이블코인 발행 규정과 거래소 책임 강화 내용도 포함됐다.', tone: 1, mag: [0.01, 0.025], dur: 40, gap: [90, 160] },
    { t: '가상자산법 국회 정무위 통과…본회의만 남았다', b: '여야 이견이 컸던 과세 조항은 빠졌다.', tone: 1, mag: [0.015, 0.03], dur: 40, gap: [90, 160] },
    { branch: [
      { p: 0.7, t: '[속보] 가상자산 2단계법 본회의 통과…내년 시행', b: '기관 자금 유입의 길이 열렸다는 평가다.', tone: 1, mag: [0.03, 0.05], dur: 50, perm: 0.5, big: true, hint: '본회의 통과 확실하다' },
      { p: 0.3, t: '가상자산법 본회의 상정 무산…"다음 회기로"', b: '정치권 공방에 밀려 처리가 미뤄졌다.', tone: -1, mag: [0.02, 0.04], dur: 30, hint: '이번 회기엔 안 된다' },
    ] },
  ] },
  { id: 'upgrade', name: '메인넷 업그레이드', cat: 'gl', pool: 'l1', w: 1, steps: [
    { t: '{c} 대규모 업그레이드 일정 확정', b: '처리 속도를 두 배로 높이고 수수료를 낮추는 내용이다.', tone: 1, mag: [0.03, 0.06], dur: 40, gap: [70, 130] },
    { t: '{c} 업그레이드 테스트넷 순항…개발자들 "예정대로"', b: '테스트넷에서 큰 오류 없이 블록이 생성되고 있다.', tone: 1, mag: [0.02, 0.04], dur: 30, gap: [70, 130] },
    { branch: [
      { p: 0.7, t: '{c} 메인넷 업그레이드 성공…수수료 절반으로', b: '기대가 이미 반영돼 "재료 소멸" 매물이 나올 수 있다는 분석도 있다.', tone: 1, mag: [0.04, 0.08], dur: 25, rev: 0.7, revDelay: 30, hint: '업그레이드 문제없이 끝난다' },
      { p: 0.3, t: '{c} 업그레이드 버그로 연기…"2주 뒤 재시도"', b: '검증인 노드 일부가 멈추면서 일정을 미뤘다.', tone: -1, mag: [0.05, 0.1], dur: 30, hint: '업그레이드 연기된다' },
    ] },
  ] },
  { id: 'whale', name: '고래 움직임', cat: 'gl', pool: 'real', w: 1.3, steps: [
    { t: '고래 지갑, {c} {q}개 거래소로 이동', b: '대량 매도 물량이 될 수 있다는 우려가 나온다.', tone: -1, mag: [0.02, 0.04], dur: 20, gap: [15, 35] },
    { branch: [
      { p: 0.55, t: '{c} 대량 매도 물량 출회…순식간에 급락', b: '같은 지갑에서 시장가 매도가 연달아 체결됐다.', tone: -1, mag: [0.04, 0.08], dur: 15, hint: '그 고래 곧 던진다' },
      { p: 0.45, t: '"{c} 고래 이동은 거래소 지갑 정리" 확인', b: '거래소가 콜드월렛을 교체하는 과정이었다고 밝혔다.', tone: 1, mag: [0.02, 0.04], dur: 20, hint: '그냥 거래소 지갑 정리한다' },
    ] },
  ] },
  { id: 'foundation', name: '재단 물량 논란', cat: 'kr', pool: 'fict', w: 1, steps: [
    { t: '{c}({s}) 재단 지갑에서 대량 물량 이동 포착', b: '커뮤니티에서 "먹튀" 의혹이 번지고 있다.', tone: -1, mag: [0.06, 0.12], dur: 20, gap: [30, 60] },
    { t: '{c} 재단 "단순 지갑 정리" 해명…커뮤니티는 반신반의', b: '재단은 온체인 증명 자료를 곧 공개하겠다고 밝혔다.', tone: 1, mag: [0.03, 0.06], dur: 20, gap: [40, 80] },
    { branch: [
      { p: 0.5, t: '[속보] {ex}, {c}({s}) 투자유의 종목 지정', b: '재단이 유통량 자료를 제때 내지 못했다. 소명에 실패하면 상장폐지된다.', tone: -1, mag: [0.2, 0.35], dur: 20, big: true, fx: 'warn', hint: '유의종목 지정된다' },
      { p: 0.5, t: '{c} 재단, 보유 물량 2년 락업 발표', b: '시장에 풀릴 물량이 줄어든다는 기대에 매수세가 붙었다.', tone: 1, mag: [0.08, 0.15], dur: 25, hint: '락업 발표 나온다' },
    ] },
  ] },
  { id: 'meme', name: '밈코인 열풍', cat: 'gl', pool: 'meme', w: 1.2, steps: [
    { t: '억만장자 CEO, SNS 프로필을 {c} 캐릭터로 변경', b: '변경 10분 만에 {s} 거래량이 열 배로 뛰었다.', tone: 1, mag: [0.08, 0.2], dur: 12, big: true, rev: 0.5, revDelay: 20, gap: [20, 40] },
    { t: '{c} 커뮤니티 "화성 간다" 열풍…신규 지갑 폭증', b: '하루 새 신규 지갑이 수십만 개 생겼다.', tone: 1, mag: [0.05, 0.12], dur: 15, rev: 0.6, revDelay: 15, gap: [30, 60] },
    { t: '{c} 급등 뒤 고래 차익실현…"밈은 밈일 뿐"', b: '초기 매수자들이 물량을 넘기면서 상승분 상당 부분을 반납했다.', tone: -1, mag: [0.08, 0.15], dur: 20 },
  ] },
];

/* 큰 뉴스가 나오면 유튜버들이 반응 영상을 올린다. {topic}: 뉴스 요약 */
const YT_REACT = {
  hype: ['[속보 해설] {topic}… {c} 지금 사야 합니다', '{topic}?! {c} 이제 시작입니다 ㄷㄷ', '{topic} 뜨자마자 {s} 풀매수했습니다'],
  doom: ['{topic}… 이거 진짜 위험합니다', '{topic}, 개미들 또 털립니다', '{topic} 이후 폭락 시나리오 정리'],
  analyst: ['{topic} 이후 {c} 차트, 냉정하게 봤습니다', '{topic}의 진짜 의미 (feat. 거래량)', '{topic}, 세력은 이미 알고 있었다?'],
  calm: ['{topic}, 내 자산엔 어떤 영향?', '3분 정리: {topic}', '{topic} 뉴스, 이렇게 읽으세요'],
  hodl: ['{topic}? 저는 그냥 계속 모읍니다', '{topic}에도 존버하는 이유'],
  diary: ['{topic} 뉴스 보고 바로 매수해봤습니다 (결과 공개)', '{topic} 때문에 계좌가 이렇게 됐습니다'],
};

/* ---------- 매니저 ---------- */
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const GIVEN = ['민준', '서연', '도윤', '하은', '지호', '수아', '현우', '지민', '예준', '채원', '준서', '유나', '건우', '다은', '우진', '서진', '민서', '태윤', '소율', '지훈', '은비', '성민', '가온', '시우', '하린'];
const MGR_BG = [
  ['유튜브 보고 입문한 대학생', '코인 카페 눈팅 3년차', '전직 편의점 알바생', '모의투자 대회 입상자'],
  ['전직 증권사 리서치 인턴', '코인 커뮤니티 고인물', '중소 운용사 트레이더', '前 거래소 고객지원팀장'],
  ['여의도 증권사 애널리스트 출신', '퀀트 헤지펀드 출신', '前 대형 거래소 마켓메이커', '월가 프랍 트레이더 출신'],
];

const STRATS = {
  scalp: { name: '단타 스캘퍼', every: 2, tp: 0.015, sl: 0.012, quote: ['하루 수십 번, 작게 먹고 빠집니다.', '틱 단위로 봅니다.'], desc: '짧은 반등과 눌림목을 노려 자주 사고팝니다.' },
  trend: { name: '추세 추종', every: 5, tp: 0.08, sl: 0.04, quote: ['추세는 친구입니다.', '골든크로스 나오면 탑니다.'], desc: '이동평균선 정배열에 사고 역배열에 팝니다.' },
  dip:   { name: '저점 매수', every: 5, tp: 0.05, sl: 0.06, quote: ['공포에 사고 환희에 팝니다.', 'RSI 30 아래는 바겐세일이죠.'], desc: 'RSI 과매도에 사서 과매수에 팝니다.' },
  hodl:  { name: '장기 존버', every: 25, tp: 0.3, sl: 0.25, quote: ['10년 볼 거 아니면 10분도 보지 마세요.', '존버는 승리합니다.'], desc: '조금씩 모아서 크게 오를 때까지 버팁니다.' },
  news:  { name: '뉴스 트레이더', every: 3, tp: 0.06, sl: 0.035, quote: ['뉴스 뜨면 0.1초 안에 들어갑니다.', '재료 소멸 전에 탈출합니다.'], desc: '호재·악재 뉴스에 가장 먼저 반응합니다.' },
};

const ROLES = {
  trade: { name: '자율 매매', desc: '맡긴 운용자금으로 직접 사고팝니다. 수익은 운용자금에 쌓입니다.' },
  buy:   { name: '매수 전담', desc: '예산으로 지정 코인을 좋은 타이밍에 나눠 사서 내 지갑에 넣어줍니다.' },
  sell:  { name: '매도 전담', desc: '내 지갑의 지정 코인을 익절·손절 기준에 맞춰 나눠 팝니다.' },
};

/* ---------- 채굴 ---------- */
const MINE_COINS = ['BTC', 'DOGE', 'KMC'];
const MINE_MULT = { BTC: 1.3, DOGE: 1.0, KMC: 1.7 };
const HASH_YIELD = 300; // 해시 1H당 틱당 원화 가치(난이도 1 기준)
const RIGS = [
  { id: 'gpu', name: '중고 그래픽카드', desc: '게이밍 PC에서 떼어낸 채굴용 GPU', cost: 2e5, h: 1, e: 40 },
  { id: 'rig6', name: '6-Way GPU 채굴기', desc: '그래픽카드 6장을 꽂은 오픈 프레임 리그', cost: 2.5e6, h: 14, e: 560 },
  { id: 'asic', name: 'ASIC 채굴기', desc: '채굴 전용 칩을 탑재한 전문 장비', cost: 3e7, h: 180, e: 7200 },
  { id: 'container', name: '컨테이너 채굴장', desc: '40피트 컨테이너에 ASIC 200대', cost: 4e8, h: 2600, e: 100000 },
  { id: 'hydro', name: '수력발전 채굴단지', desc: '댐 옆 값싼 전기로 24시간 가동', cost: 6e9, h: 42000, e: 900000 },
  { id: 'orbital', name: '우주 태양광 채굴위성', desc: '궤도 위 태양광 패널로 전력 걱정 없음', cost: 1.2e11, h: 900000, e: 4000000 },
];

/* ---------- 주식 (단순) ---------- */
const STOCKS = [
  { sym: 'HBE', name: '한빛전자', mkt: 'KR', sector: '반도체', p: 72000, vol: 0.022, beta: 1.1, div: 0.004, trend: 0.0012 },
  { sym: 'DHM', name: '대한모터스', mkt: 'KR', sector: '자동차', p: 215000, vol: 0.02, beta: 0.9, div: 0.006, trend: 0.0008 },
  { sym: 'NEO', name: '네오플랫폼', mkt: 'KR', sector: '인터넷', p: 185000, vol: 0.028, beta: 1.2, div: 0.001, trend: 0.0012 },
  { sym: 'SFG', name: '서울금융지주', mkt: 'KR', sector: '금융', p: 61000, vol: 0.015, beta: 0.7, div: 0.012, trend: 0.0005 },
  { sym: 'KBG', name: 'K-바이오젠', mkt: 'KR', sector: '바이오', p: 83000, vol: 0.045, beta: 1.0, div: 0, trend: 0.001 },
  { sym: 'SBE', name: '별빛엔터', mkt: 'KR', sector: '엔터', p: 42000, vol: 0.035, beta: 1.0, div: 0.002, trend: 0.001 },
  { sym: 'NVC', name: '노바칩', mkt: 'US', sector: 'AI 반도체', p: 250000, vol: 0.035, beta: 1.4, div: 0.0005, trend: 0.002 },
  { sym: 'VLT', name: '볼트라 모터스', mkt: 'US', sector: '전기차', p: 480000, vol: 0.04, beta: 1.5, div: 0, trend: 0.0015 },
  { sym: 'ORB', name: '오르빗 스페이스', mkt: 'US', sector: '우주항공', p: 38000, vol: 0.05, beta: 1.3, div: 0, trend: 0.0015 },
  { sym: 'MGM', name: '메가마트', mkt: 'US', sector: '유통', p: 130000, vol: 0.014, beta: 0.6, div: 0.008, trend: 0.0006 },
  { sym: 'CMX', name: '코인마루 홀딩스', mkt: 'US', sector: '가상자산', p: 320000, vol: 0.04, beta: 0.8, crypto: 0.9, div: 0, trend: 0.0015 },
];
const STOCK = Object.fromEntries(STOCKS.map(s => [s.sym, s]));
const INDEX_NAME = { KR: 'K-지수', US: 'N-지수' };

/* ---------- 부동산 (단순) ---------- */
const PROPS = [
  { id: 'goshi', name: '고시원 1실', area: '서울 관악구', p: 3e7, rent: 0.012, beta: 0.6, floors: 2 },
  { id: 'officetel', name: '원룸 오피스텔', area: '경기 수원시', p: 1.6e8, rent: 0.009, beta: 0.8, floors: 5 },
  { id: 'apt_local', name: '지방 아파트 34평', area: '대전 유성구', p: 3.8e8, rent: 0.006, beta: 0.8, floors: 7 },
  { id: 'villa', name: '서울 빌라', area: '서울 마포구', p: 4.5e8, rent: 0.007, beta: 0.9, floors: 4 },
  { id: 'apt_seoul', name: '서울 아파트 34평', area: '서울 성동구', p: 1.45e9, rent: 0.0045, beta: 1.2, floors: 9 },
  { id: 'apt_gangnam', name: '강남 아파트 34평', area: '서울 강남구', p: 3.6e9, rent: 0.0035, beta: 1.6, floors: 11 },
  { id: 'kkoma', name: '꼬마빌딩', area: '서울 성수동', p: 8.5e9, rent: 0.0075, beta: 1.1, floors: 6 },
  { id: 'mall', name: '상가 빌딩', area: '서울 강남대로', p: 4.2e10, rent: 0.0085, beta: 1.0, floors: 13 },
  { id: 'tower', name: '랜드마크 타워', area: '서울 여의도', p: 5e11, rent: 0.008, beta: 1.0, floors: 18 },
];

/* ---------- 사업 (단순, 레벨업형) ---------- */
const BIZ = [
  { id: 'bung', name: '붕어빵 노점', mark: '붕', base: 5e4, inc: 120, mult: 1.15 },
  { id: 'cvs', name: '편의점', mark: '편', base: 1.2e6, inc: 1800, mult: 1.15 },
  { id: 'chicken', name: '치킨집', mark: '치', base: 1.5e7, inc: 18000, mult: 1.15 },
  { id: 'pcbang', name: 'PC방', mark: 'PC', base: 1.8e8, inc: 190000, mult: 1.15 },
  { id: 'cafe', name: '카페 프랜차이즈', mark: '카', base: 2.4e9, inc: 2.2e6, mult: 1.15 },
  { id: 'webtoon', name: '웹툰 스튜디오', mark: '웹', base: 3.5e10, inc: 2.8e7, mult: 1.15 },
  { id: 'gamedev', name: '게임 개발사', mark: '게', base: 5.5e11, inc: 3.8e8, mult: 1.15 },
  { id: 'exchange', name: '코인 거래소', mark: '거', base: 9e12, inc: 5.5e9, mult: 1.15 },
];
const BIZ_MILESTONES = [[10, 2], [25, 2], [50, 2], [100, 3], [200, 4]];

const SU_PRE = ['딥', '핀', '로켓', '그린', '바이오', '메타', '퀀텀', '하이퍼', '누리', '온', '블루', '스텔라', '모아', '픽셀', '루프'];
const SU_SUF = ['랩스', '웍스', '테크', '플랫폼', '에너지', '헬스', '모빌리티', 'AI', '스튜디오', '로보틱스', '페이', '푸드'];
const SU_SECTOR = ['AI', '핀테크', '바이오', '모빌리티', '푸드테크', '게임', '로봇', '기후테크', '콘텐츠'];
const SU_STAGE = {
  seed: { name: '시드', prob: 0.1, mult: [4, 18], days: [8, 16] },
  a:    { name: '시리즈A', prob: 0.25, mult: [2, 6], days: [6, 12] },
  b:    { name: '시리즈B', prob: 0.45, mult: [1.4, 3], days: [4, 9] },
};

/* ---------- 라이프: 자동차 / 연애 / 인맥 / 소비 ---------- */
const CARS = [
  { id: 'kei', name: '피콜로', type: '경차', price: 1.4e7, charm: 5 },
  { id: 'sedan', name: '아우로라', type: '중형 세단', price: 3.3e7, charm: 12 },
  { id: 'suv', name: '트레일러너', type: '패밀리 SUV', price: 4.6e7, charm: 15 },
  { id: 'import', name: '슈테른 E', type: '수입 세단', price: 9e7, charm: 28 },
  { id: 'flag', name: '모나크 G90', type: '플래그십 세단', price: 1.1e8, charm: 30 },
  { id: 'sports', name: '벨록스 911', type: '스포츠카', price: 2e8, charm: 55 },
  { id: 'offroad', name: '겔란데 G', type: '럭셔리 오프로더', price: 2.7e8, charm: 62 },
  { id: 'super1', name: '로쏘 V12', type: '슈퍼카', price: 4.8e8, charm: 95 },
  { id: 'super2', name: '토로 아벤투라', type: '슈퍼카', price: 6.5e8, charm: 110 },
  { id: 'limo', name: '스피릿 팬텀', type: '초호화 리무진', price: 8e8, charm: 120 },
  { id: 'hyper', name: '베이론 SS', type: '하이퍼카', price: 5e9, charm: 220 },
];
const CAR = Object.fromEntries(CARS.map(c => [c.id, c]));

const GF_NAMES = ['지수', '서윤', '하린', '예린', '수빈', '민지', '유진', '채아', '다인', '소연', '나은', '지아', '윤서', '가은', '아린'];
const GF_TYPES = {
  simple: { name: '소박한', decay: 3, like: ['street', 'picnic', 'movie'], dislike: ['luxury'] },
  active: { name: '활발한', decay: 4, like: ['picnic', 'festival', 'jeju'], dislike: ['exhibit'] },
  luxury: { name: '럭셔리', decay: 6, like: ['dining', 'luxury', 'europe'], dislike: ['street', 'picnic'] },
  smart:  { name: '지적인', decay: 3.5, like: ['exhibit', 'movie', 'europe'], dislike: ['festival'] },
};
const GF_JOBS = [
  { job: '증권사 애널리스트', contact: 'analyst', w: 2 },
  { job: '거래소 직원', contact: 'exchange', w: 2 },
  { job: '공인중개사', contact: 'realtor', w: 2 },
  { job: '회계사', contact: 'tax', w: 2 },
  { job: '코인 유튜버', contact: 'youtuber', w: 2 },
  { job: '벤처캐피탈 심사역', contact: 'vc', w: 1.5 },
  { job: '재벌가 막내', contact: 'heir', w: 0.4, premium: true },
  { job: '승무원', w: 2 }, { job: '약사', w: 2 }, { job: '디자이너', w: 2 },
  { job: '초등학교 교사', w: 2 }, { job: '간호사', w: 2 }, { job: '웹툰 작가', w: 2 },
];
const MEETS = [
  { id: 'app', name: '데이팅 앱', cost: 3e4, charm: 0, fame: 0, base: 0.3, std: [5, 35] },
  { id: 'blind', name: '소개팅', cost: 1.5e5, charm: 10, fame: 0, base: 0.4, std: [15, 55] },
  { id: 'lounge', name: '청담 라운지', cost: 8e5, charm: 35, fame: 0, base: 0.38, std: [40, 100] },
  { id: 'gallery', name: '갤러리 오프닝 파티', cost: 5e6, charm: 70, fame: 25, base: 0.38, std: [70, 160], premium: 0.15 },
  { id: 'yacht', name: '요트 파티', cost: 5e7, charm: 130, fame: 50, base: 0.4, std: [120, 260], premium: 0.4 },
];
const DATES = [
  { id: 'street', name: '동네 분식 데이트', cost: 2e4, aff: 4, happy: 3 },
  { id: 'picnic', name: '한강 피크닉', cost: 5e4, aff: 6, happy: 5 },
  { id: 'exhibit', name: '전시회 + 북카페', cost: 1e5, aff: 7, happy: 4 },
  { id: 'movie', name: '영화 + 맛집', cost: 1.5e5, aff: 7, happy: 5 },
  { id: 'festival', name: '음악 페스티벌', cost: 4e5, aff: 10, happy: 8 },
  { id: 'dining', name: '파인다이닝', cost: 8e5, aff: 11, happy: 7 },
  { id: 'jeju', name: '제주도 여행', cost: 3e6, aff: 16, happy: 15 },
  { id: 'luxury', name: '명품 선물', cost: 5e6, aff: 18, happy: 6 },
  { id: 'europe', name: '유럽 여행', cost: 3e7, aff: 28, happy: 30 },
];
const DATE_CD = 30; // 데이트 쿨다운(틱)

/* 인맥: 친밀도 1~100, Lv2 ≥ 50, Lv3 ≥ 85 */
const CONTACTS = {
  analyst:    { name: '증권사 애널리스트', who: '여의도 리서치센터', perks: ['뉴스별 영향 강도 표시', '큰 뉴스 사전 귀띔 (정확도 75%)', '귀띔 정확도 95%'] },
  exchange:   { name: '거래소 임원', who: '코인마루 상무', perks: ['코인 수수료 0.05% → 0.035%', '코인 수수료 0.02%', '신규 상장 정보 사전 입수'] },
  realtor:    { name: '강남 부동산 중개인', who: '압구정 부동산', perks: ['부동산 취득비용 4% → 3%', '임대 수익 +10%', '취득비용 1.5% · 임대 +20%'] },
  vc:         { name: 'VC 심사역', who: '판교 벤처캐피탈', perks: ['스타트업 성공 확률 +5%p', '성공 확률 +10%p', '프라이빗 딜 제안'] },
  tax:        { name: '세무사', who: '강남 세무법인', perks: ['인건비·전기료 -10%', '인건비·전기료 -20%', '인건비·전기료 -30%'] },
  youtuber:   { name: '코인 유튜버 친구', who: '구독자 50만 채널', perks: ['낚시 영상 판별', '영상 신뢰도 표시', '영상 공개 전 내용 귀띔'] },
  headhunter: { name: '헤드헌터', who: '금융권 서치펌', perks: ['지원자 교체 하루 1회 무료', '고급 인재 확률 증가', 'S급 인재 추천'] },
  banker:     { name: 'PB 센터장', who: '시중은행 PB센터', perks: ['주식 배당 +10%', '현금 이자 하루 0.02%', '주식 배당 +25%'] },
  heir:       { name: '재벌 3세 친구', who: '○○그룹 오너가', perks: ['명성 +10', '프라이빗 딜 제안', '거대 딜 수익률 상승'] },
  club:       { name: '슈퍼카 동호회장', who: '청담 슈퍼카 클럽', perks: ['매력 +10%', '매력 +20%', '파티·소개팅 성공률 +15%p'] },
};
const NET_EVENTS = [
  { id: 'meetup', name: '스타트업 밋업', cost: 3e5, charm: 0, fame: 0, p: 0.35, pool: ['vc', 'youtuber', 'headhunter'] },
  { id: 'seminar', name: '투자 세미나', cost: 1e6, charm: 10, fame: 0, p: 0.35, pool: ['analyst', 'exchange', 'banker'] },
  { id: 'golf', name: '골프 모임', cost: 5e6, charm: 40, fame: 10, p: 0.4, pool: ['realtor', 'tax', 'banker', 'club'] },
  { id: 'gala', name: '자선 갈라 디너', cost: 5e7, charm: 80, fame: 45, p: 0.45, pool: ['heir', 'vc', 'banker', 'exchange'] },
];
const MEET_GIFTS = [
  { id: 'meal', name: '밥 한 끼 사기', cost: 3e5, gain: 8 },
  { id: 'golf', name: '골프 라운딩 접대', cost: 3e6, gain: 15 },
  { id: 'gift', name: '명절 선물 세트', cost: 1e7, gain: 22 },
];
const CONTACT_CD = 60;

const ITEMS = [
  { id: 'sneakers', name: '한정판 스니커즈', price: 1.2e6, charm: 2, fame: 0, happy: 8 },
  { id: 'suit', name: '맞춤 정장', price: 3e6, charm: 5, fame: 0, happy: 5 },
  { id: 'bag', name: '명품 가방', price: 8e6, charm: 6, fame: 1, happy: 8 },
  { id: 'watch', name: '명품 시계', price: 2.5e7, charm: 10, fame: 3, happy: 10 },
  { id: 'art', name: '현대미술 작품', price: 3e8, charm: 8, fame: 10, happy: 10 },
  { id: 'penthouse', name: '펜트하우스 인테리어', price: 1.5e9, charm: 20, fame: 12, happy: 20 },
  { id: 'yacht', name: '개인 요트', price: 8e9, charm: 45, fame: 20, happy: 25 },
  { id: 'jet', name: '전용기', price: 9e10, charm: 80, fame: 40, happy: 30 },
];
const SPENDS = [
  { id: 'omakase', name: '오마카세 한 끼', price: 3e5, happy: 8 },
  { id: 'spa', name: '호텔 스파', price: 8e5, happy: 12 },
  { id: 'treat', name: '친구들 한턱 쏘기', price: 2e6, happy: 15, fame: 0.5 },
  { id: 'trip', name: '혼자 해외여행', price: 5e6, happy: 30 },
  { id: 'donate', name: '기부 (총자산 1%)', price: 0, happy: 10, fame: 3, donate: true },
];

/* ---------- 등급 ---------- */
const RANKS = [
  [0, '코린이'], [1e7, '개미'], [1e8, '불개미'], [1e9, '슈퍼개미'], [1e10, '돌고래'],
  [1e11, '고래'], [1e12, '메가고래'], [1e14, '코인황제'],
];

/* ---------- 업적 ---------- */
const ACHS = [
  { id: 'tap', name: '첫 채굴', desc: '코인을 직접 탭해서 채굴했다', test: S => S.stats.taps >= 1 },
  { id: 'buy', name: '첫 매수', desc: '코인을 처음 샀다', test: S => S.stats.buys >= 1 },
  { id: 'profit', name: '첫 익절', desc: '수익을 내고 팔았다', test: S => S.stats.wins >= 1 },
  { id: 'loss', name: '손절의 아픔', desc: '손해를 보고 팔았다', test: S => S.stats.losses >= 1 },
  { id: 'btc1', name: '1 BTC 클럽', desc: '비트코인 1개 이상 보유', test: S => (S.hold.BTC?.q || 0) >= 1 },
  { id: 'nw1', name: '천만장자', desc: '총자산 1천만 원', test: S => S.stats.peak >= 1e7 },
  { id: 'nw2', name: '억대 자산가', desc: '총자산 1억 원', test: S => S.stats.peak >= 1e8 },
  { id: 'nw3', name: '10억 클럽', desc: '총자산 10억 원', test: S => S.stats.peak >= 1e9 },
  { id: 'nw4', name: '100억 부자', desc: '총자산 100억 원', test: S => S.stats.peak >= 1e10 },
  { id: 'nw5', name: '조만장자', desc: '총자산 1조 원', test: S => S.stats.peak >= 1e12 },
  { id: 'mgr1', name: '첫 매니저', desc: '매니저를 처음 고용했다', test: S => S.stats.hires >= 1 },
  { id: 'mgr3', name: '트레이딩 팀', desc: '매니저 3명을 동시에 운용', test: S => S.managers.length >= 3 },
  { id: 'liq', name: '강제청산', desc: '선물 포지션이 청산당했다', test: S => S.stats.liqs >= 1 },
  { id: 'lev', name: '레버리지 장인', desc: '선물 ROE +100% 이상으로 종료', test: S => S.stats.bestRoe >= 1 },
  { id: 'rig10', name: '채굴장 사장', desc: '채굴 장비 10대 보유', test: S => Object.values(S.rigs).reduce((a, b) => a + b, 0) >= 10 },
  { id: 'home', name: '내 집 마련', desc: '첫 부동산을 샀다', test: S => Object.values(S.props).some(n => n > 0) },
  { id: 'gangnam', name: '강남 입성', desc: '강남 아파트 보유', test: S => (S.props.apt_gangnam || 0) > 0 },
  { id: 'bizall', name: '문어발 경영', desc: '모든 사업을 1단계 이상 운영', test: S => BIZ.every(b => (S.biz[b.id] || 0) > 0) },
  { id: 'stake', name: '이자 농사', desc: '처음으로 스테이킹했다', test: S => Object.values(S.staked).some(q => q > 0) },
  { id: 'div', name: '배당 생활자', desc: '첫 배당금을 받았다', test: S => S.stats.divs > 0 },
  { id: 'exit', name: '엑싯 성공', desc: '스타트업 투자로 3배 이상 회수', test: S => S.stats.bestExit >= 3 },
  { id: 'rug', name: '러그풀 피해자', desc: '보유 코인이 러그풀 당했다', test: S => S.stats.rugged >= 1 },
  { id: 'car', name: '오너 드라이버', desc: '첫 차를 샀다', test: S => Object.keys(S.life.cars).length >= 1 },
  { id: 'supercar', name: '슈퍼카 오너', desc: '슈퍼카를 샀다', test: S => ['super1', 'super2', 'hyper'].some(id => S.life.cars[id]) },
  { id: 'gf', name: '솔로 탈출', desc: '여자친구가 생겼다', test: S => S.stats.gfs >= 1 },
  { id: 'married', name: '결혼 골인', desc: '프로포즈에 성공했다', test: S => !!S.life.married },
  { id: 'network5', name: '마당발', desc: '인맥 5명 이상', test: S => Object.keys(S.life.contacts).length >= 5 },
  { id: 'flex', name: '플렉스', desc: '라이프에 1억 원 이상 썼다', test: S => S.stats.spent >= 1e8 },
];
