# 우리 가족 앨범

가족끼리 사진과 영상을 올리고 함께 보는 앱입니다.

- **안드로이드**: APK 파일을 직접 설치합니다 (Play 스토어 불필요).
- **아이폰**: Safari로 웹앱을 열고 "홈 화면에 추가"를 누릅니다 (Apple 개발자 계정 불필요).
- **서버**: Cloudflare Workers(API) + R2(파일 저장) + D1(DB). 가족 규모라면 무료 범위 안에서 운영됩니다.

```
app/      Flutter 앱 (안드로이드 + 웹)
worker/   Cloudflare Worker API, DB 마이그레이션
```

## 동작 방식

```
앱 ──(로그인 · 목록 · 업로드 URL 요청)──▶ Worker ──▶ D1 (계정 · 사진 정보)
 │                                         │
 └──(서명된 URL로 직접 업로드/다운로드)──▶ R2 (원본 + 썸네일)
```

- **계정**: 가족마다 각자 계정을 만듭니다. 가입할 때 **초대 코드**가 필요해서 모르는 사람은 가입할 수 없습니다.
- **사진**: 원본을 그대로 올리고, 목록용 썸네일(짧은 변 480px)은 앱에서 만들어 함께 올립니다.
- **영상**: 안드로이드 앱에서는 **1080p로 압축**한 뒤 올립니다. 웹(아이폰)에서는 압축 없이 원본을 올립니다.
- **삭제**: 본인이 올린 것만 삭제할 수 있습니다.
- R2 버킷은 비공개입니다. 파일은 로그인한 사람에게만 서명된 URL(2일 유효)로 제공됩니다.

---

## 처음 설정하기

필요한 것: Cloudflare 계정(결제 수단 등록 필요, R2 사용 조건), Node.js 20 이상, Flutter SDK

### 1. Cloudflare 리소스 만들기

```bash
cd worker
npm install
npx wrangler login

npx wrangler r2 bucket create family-photos
npx wrangler d1 create family-photos      # 출력된 database_id 를 wrangler.toml 에 붙여넣기
```

`worker/wrangler.toml`에서 다음 두 값을 바꿉니다.

- `database_id`: 위 명령에서 출력된 값
- `R2_ACCOUNT_ID`: Cloudflare 대시보드 오른쪽에 보이는 계정 ID

### 2. R2 API 토큰 만들기

업로드/다운로드용 서명 URL을 만드는 데 필요합니다.

1. Cloudflare 대시보드 → **R2** → **API 토큰 관리** → **API 토큰 생성**
2. 권한: **객체 읽기 및 쓰기**, 버킷: `family-photos`만 지정
3. 만들어진 **Access Key ID**와 **Secret Access Key**를 아래 명령으로 등록합니다.

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put INVITE_CODE        # 가족에게 알려줄 초대 코드 (아무 문자열)
```

### 3. DB 만들고 배포하기

```bash
npm run db:migrate    # D1에 테이블 생성
npm run deploy        # Flutter 웹 빌드 + Worker 배포
```

배포가 끝나면 `https://family-photos.<계정>.workers.dev` 같은 주소가 출력됩니다. 이 주소가 웹앱 주소이자 API 주소입니다.

### 4. R2 CORS 설정 (웹앱용)

웹 브라우저에서 R2로 직접 업로드하려면 필요합니다.
대시보드 → **R2** → `family-photos` 버킷 → **설정** → **CORS 정책**에 아래 내용을 넣습니다 (주소는 본인 것으로 바꾸세요).

```json
[
  {
    "AllowedOrigins": ["https://family-photos.<계정>.workers.dev", "http://localhost:8787"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

### 5. 사용량 알림 켜기 (추천)

Cloudflare에는 사용 한도가 없어서 무료 범위를 넘으면 자동으로 청구됩니다.
대시보드 → **알림(Notifications)**에서 R2 사용량 / 청구 알림을 만들어 두세요.

---

## 가족에게 배포하기

### 안드로이드 (APK)

```bash
cd app
flutter build apk --release --dart-define=API_BASE_URL=https://family-photos.<계정>.workers.dev
```

만들어진 `app/build/app/outputs/flutter-apk/app-release.apk` 파일을 카카오톡이나 구글 드라이브로 보냅니다.
받은 사람이 파일을 누르고 "출처를 알 수 없는 앱 설치"를 허용하면 설치됩니다.

> **서명 키 주의:** 지금은 빌드한 PC의 디버그 키로 서명됩니다. 다른 PC에서 빌드하면 키가 달라서
> 기존 앱 위에 업데이트 설치가 안 됩니다. 오래 쓸 거라면 [릴리스 서명 키](https://docs.flutter.dev/deployment/android#sign-the-app)를
> 만들어서 안전하게 보관하세요.

### 아이폰 (웹앱)

1. Safari로 `https://family-photos.<계정>.workers.dev`를 엽니다.
2. 공유 버튼 → **홈 화면에 추가**를 누릅니다.
3. 홈 화면 아이콘으로 앱처럼 사용합니다.

### 가입

앱을 처음 열면 **가입하기** 탭에서 초대 코드, 아이디, 이름, 비밀번호를 입력합니다.

---

## 로컬에서 개발하기

```bash
cd worker
cp .dev.vars.example .dev.vars      # 값 채우기 (R2 키가 없으면 업로드만 안 됨)
npm run db:migrate:local
npm run build:web
npm run dev                         # http://localhost:8787
```

안드로이드 에뮬레이터에서는 `--dart-define=API_BASE_URL=http://10.0.2.2:8787`로 실행합니다.

## 알아둘 점

- **아이폰 영상 형식:** 아이폰은 HEVC(H.265)로 촬영합니다. 웹앱에서는 압축 없이 그대로 올라가서,
  오래된 안드로이드 기기에서는 재생되지 않을 수 있습니다.
  (아이폰 설정 → 카메라 → 포맷 → "높은 호환성"으로 바꾸면 H.264로 촬영되어 해결됩니다.)
- **HEIC 사진:** 아이폰 Safari는 사진을 올릴 때 JPEG로 자동 변환해 줍니다. 안드로이드 앱은 HEIC를 JPEG로 변환해서 올립니다.
- **업로드 중에는 앱을 닫지 마세요.** 특히 웹앱은 화면을 벗어나면 업로드가 멈출 수 있습니다.
- **비밀번호 해시 강도:** Workers 무료 플랜의 CPU 제한(요청당 10ms) 때문에 PBKDF2 반복 횟수를 20,000으로 잡았습니다.
  유료 플랜($5/월)이라면 `worker/src/crypto.ts`에서 100,000으로 올려도 됩니다. 기존 계정은 그대로 동작합니다.
- 하루 넘게 완료되지 않은 업로드와 만료된 로그인은 매일 자동으로 정리됩니다 (cron).
