# 온하루 · Personal AI Assistant

일정, 할 일, 가계부, 냉장고, 공과금, 메모, 개발·학습, 생활 분석을 채팅과 관리 화면에서 사용하는 개인 AI 비서입니다.

## 개발 실행

Node.js 24와 npm이 필요합니다.

```sh
npm ci
npm run dev
```

개발 서버 포트는 3000입니다. 기본 화면은 `/assistant`입니다. 기본 설정에서는 로그인 없이 Mock Provider를 사용합니다. 가상 레코드, 채팅 세션, 테마와 직접 저장한 기억은 브라우저에 보관됩니다. 브라우저 데이터를 지우면 초기 예시가 다시 표시됩니다. 다른 기기와 동기화되지 않으므로 실제 개인정보를 입력하지 마세요.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## 집 PC에서 PostgreSQL 모드로 실행

Docker Desktop의 Linux 컨테이너 모드를 사용합니다. 새로 설치할 때는 `.env.example`을 복사해 운영용 `.env.prod`와 개발용 `.env.dev`를 따로 만듭니다. 두 환경의 DB 비밀번호와 인증 비밀키는 서로 다르게 생성합니다.

- 운영용은 `WEB_PORT=3001`, `RESTART_POLICY=unless-stopped`로 설정하고, 개발용은 `WEB_PORT=3002`, `RESTART_POLICY=no`로 설정합니다. 로컬 접속 시 `AUTH_URL`은 해당 주소와 포트로 설정합니다. 실제 접속 주소가 HTTPS 주소라면 `AUTH_URL`도 그 주소로 맞춥니다.
- `DEMO_MODE=false`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `AUTH_SECRET`, 최초 계정의 `ADMIN_EMAIL` 및 `ADMIN_PASSWORD_HASH`를 설정합니다.
- Compose 내부의 `DATABASE_URL` 형식은 `postgresql://assistant:<URL로 인코딩한 비밀번호>@db:5432/assistant`입니다. 외부 PostgreSQL을 사용할 때는 제공자의 연결 URL 및 TLS 설정을 사용합니다. 마이그레이션에는 세션 단위 잠금을 지원하는 직접 접속 또는 세션 풀러를 사용합니다.
- `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`로 `AUTH_SECRET`을 생성합니다. PowerShell 7 이상에서는 `Read-Host "온하루 비밀번호" -MaskInput | node scripts/password-hash.mjs`로 첫 계정의 해시를 생성합니다. 계정 생성은 기존 이메일의 비밀번호를 덮어쓰지 않습니다.

새 운영 환경에서는 다음 순서로 실행합니다.

```sh
docker compose --env-file .env.prod -p onharu-prod --profile database up -d --wait db
docker compose --env-file .env.prod -p onharu-prod build web
docker compose --env-file .env.prod -p onharu-prod run --rm --no-deps web node scripts/db.mjs migrate
docker compose --env-file .env.prod -p onharu-prod run --rm --no-deps web node scripts/db.mjs create-owner
docker compose --env-file .env.prod -p onharu-prod up -d web
```

개발 환경은 같은 명령에서 `.env.dev`와 `-p onharu-dev`를 사용합니다. 프로젝트별 Compose 네트워크와 볼륨이 분리되며 PostgreSQL 포트는 호스트에 게시하지 않습니다. 외부 PostgreSQL을 쓰는 경우 Compose `db`를 시작하는 첫 명령은 생략합니다. 개발 셸에서 DB에 접근할 수 있다면 환경 변수를 주입한 뒤 `npm run db:migrate`와 `npm run db:create-owner`를 직접 실행할 수도 있습니다.

### 관리비·공과금

같은 청구월에 실제 관리비와 참고용 관리비를 각각 등록할 수 있습니다. 월별·연간 통계와 전년 동월 비교는 입력한 고지서 합계를 사용합니다. 주차비는 항목별로 확인할 수 있으며, 확인된 0원과 미입력을 구분합니다. 총 주거비는 관리비 고지서 합계와 별도 입력한 가스비를 합산합니다. 연간 비교 합계에는 양쪽 연도의 고지서 합계가 확인된 동일 월을 반영합니다.

월 중간에 입주하거나 퇴거한 달과 일부가 겹치는 가스 사용 기간도 실제 관리비로 등록할 수 있습니다. 거주 기간 밖 청구는 실제 관리비 선택을 확인한 후 입력 금액 그대로 저장합니다. 표·CSV 가져오기도 같은 기준을 적용합니다. PostgreSQL 운영 모드는 아래 업데이트 절차에서 `009_utility_parking.sql`을 적용합니다.

### 정산·대납 관리

가계부의 **정산·대납 관리**에서 일반 정산, 대납, 입금 이력과 미수금을 관리합니다. 이미 입력한 결제·출금·입금은 기존 거래로 연결합니다. 카드 승인 원금과 실제 카드대금 출금은 따로 기록하고, 연결된 거래를 다시 등록하지 않습니다. 원본 거래의 금액·일자·분류를 변경하려면 정산에서 연결을 먼저 해제합니다. 운영 DB에는 실행기로 `005` 마이그레이션까지 적용합니다.

### 야구 직관·예매

사이드바의 **야구**에서 대시보드, 달력, 예매, 직관 기록, 통계를 확인합니다. 설정에서 기본 응원팀(롯데 자이언츠)을 바꿀 수 있습니다. 경기 CSV는 일시와 경기 머리글을 포함하며, 경기 기록과 예매는 각각 관리합니다. 전체 데모 데이터를 옮길 때는 설정의 브라우저 JSON 내보내기를 사용합니다. 운영 DB에는 `006` 마이그레이션까지 적용합니다. 예매 알림은 앱을 열어 확인하는 방식입니다.

### 일상 기록과 구독 서비스

사이드바의 **일상 기록**에서는 활동, 완료한 기존 일정·할 일, 실제 관람·학습으로 구성된 타임라인을 볼 수 있습니다. 돌아가며 결제는 그룹별 차례와 결제 통계를 제공하며 가계부와 별도로 집계합니다. 가계부의 **구독 서비스 관리**에서는 결제 주기, 예상액, 실제 결제와 이력을 확인합니다. 실제 결제를 기록할 때 가계부 반영 또는 기존 거래·고정지출 납부 연결을 선택할 수 있습니다.

두 메뉴의 가져오기에서 Excel·Markdown·CSV를 확인 후 추가하고, JSON으로 내보낼 수 있습니다. 구독 알림은 일정과 대시보드에서 확인합니다.

### 채팅과 AI 오류

Enter로 전송하고 Shift+Enter로 줄을 바꿉니다. 모바일에서는 입력창 옆 줄바꿈 버튼도 사용할 수 있습니다. 이전 대화에서 제목을 바꾸거나 대화를 삭제할 수 있으며, 전체 삭제는 확인 문구 `전체 삭제`가 필요합니다. 채팅을 삭제해도 설정에 저장한 AI 기억은 유지됩니다.

Ollama가 업데이트 또는 시작 중이면 화면 안내를 확인해 잠시 후 **같은 메시지로 다시 시도**를 선택합니다. AI 서버 대기 시간은 `AI_TIMEOUT_MS`(기본 25000ms, 허용 1000~120000ms)로 조절합니다. 실패 로그에는 Provider, 분류, 응답 소요 시간과 확인 가능한 HTTP 상태를 기록합니다. 프롬프트와 인증정보는 기록하지 않습니다.

### 기존 DB와 브라우저 데이터

기존 Compose에서 업그레이드할 때는 먼저 DB 백업을 검증하고 **기존 폴더, 프로젝트 이름, 볼륨**을 사용합니다. 이름을 새 운영 프로젝트로 바꾸면 별도 빈 볼륨이 연결됩니다. 변경된 이미지를 빌드하고 일반 `migrate`를 실행합니다. 기존 초기화 스크립트로 만든 DB라는 진단을 받으면, 이전 001–003 중 적용된 범위를 확인한 뒤 다음 명령을 실행합니다.

```sh
docker compose run --rm --no-deps web node scripts/db.mjs migrate --adopt-legacy
```

마이그레이션은 파일명과 체크섬을 기록하며, 이미 적용한 SQL과 기존 행을 유지합니다. 기존 이메일이 대소문자만 다른 상태로 중복되어 있으면 마이그레이션이 중단됩니다. 계정 병합·삭제는 관리자가 판단합니다.

설정의 **브라우저 데이터 가져오기**에서 대상과 계정을 확인한 뒤 가져옵니다. 데모와 운영 주소가 다르면 데모 설정에서 JSON 파일로 내보냈다가 운영 설정에서 선택합니다. 기존 PostgreSQL의 대상 영역에 데이터가 있으면 덮어쓰지 않으며, 계정당 한 번만 가져옵니다. 파일과 브라우저 원본은 그대로 남습니다. 운영 중 DB 연결이 끊기면 오류를 표시합니다.

### 집 PC의 개발·운영 업데이트

일상·구독 기능과 주차비 개선에는 각각 008과 009 마이그레이션이 필요합니다. 개발은 아래 명령의 환경 파일과 프로젝트를 .env.dev, onharu-dev로 바꿔 먼저 확인하세요. 개발 포트 3002·재시작 정책 no와 운영 포트 3001·재시작 정책 unless-stopped를 유지합니다.

기존 `onharu-prod_assistant-db` 볼륨의 백업과 SHA-256 체크섬을 먼저 확인합니다. 최신 코드를 받은 뒤 현재 `.env.prod`에 `RESTART_POLICY=unless-stopped`를 추가합니다. 기존 DB 연결 정보, 포트 3001, Tailscale 접속 주소는 유지합니다. 현재 환경 이름과 볼륨을 그대로 사용하는 순서는 다음과 같습니다.

```sh
docker compose --env-file .env.prod -p onharu-prod build web
docker compose --env-file .env.prod -p onharu-prod stop web
docker compose --env-file .env.prod -p onharu-prod --profile database up -d --wait db
docker compose --env-file .env.prod -p onharu-prod run --rm --no-deps web node scripts/db.mjs migrate
docker compose --env-file .env.prod -p onharu-prod up -d web
```

`007`은 기존 채팅의 저장 위치를 변경하므로 이전 WEB을 중지하고 마이그레이션을 성공적으로 적용한 후 새 WEB을 시작합니다. 이전 버전으로 복구하려면 마이그레이션 전 백업을 사용합니다. 개발 환경은 `.env.dev`에 `RESTART_POLICY=no`를 지정하고 `onharu-dev`와 기존 포트 3002를 사용합니다. 두 환경 모두 볼륨 삭제 옵션을 사용하지 않습니다.

업데이트 후 `docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' onharu-prod-web-1 onharu-prod-db-1`로 운영 정책을 확인하고, 개발 컨테이너에도 같은 방식으로 `no`가 설정됐는지 확인합니다. 이전 대화와 AI 기억이 남아 있는지, 스마트폰에서 새 대화를 시작할 수 있는지 확인합니다.

## 설계 문서

- [개발 지침](AGENTS.md)
- [요구사항](docs/REQUIREMENTS.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [DB 설계](docs/DATABASE.md)
- [UI 설계](docs/UI_DESIGN.md)
- [개발 작업](docs/TASKS.md)
