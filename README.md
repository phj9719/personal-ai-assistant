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

- 운영용은 `WEB_PORT=3001`, `AUTH_URL=http://localhost:3001`, 개발용은 `WEB_PORT=3002`, `AUTH_URL=http://localhost:3002`로 설정합니다. 실제 접속 주소가 HTTPS 주소라면 `AUTH_URL`도 그 주소로 맞춥니다.
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

### 정산·대납 관리

가계부의 **정산·대납 관리**에서 일반 정산, 대납, 입금 이력과 미수금을 관리합니다. 이미 입력한 결제·출금·입금은 기존 거래로 연결합니다. 카드 승인 원금과 실제 카드대금 출금은 따로 기록하고, 연결된 거래를 다시 등록하지 않습니다. 원본 거래의 금액·일자·분류를 변경하려면 정산에서 연결을 먼저 해제합니다. 운영 DB에는 실행기로 `005` 마이그레이션까지 적용합니다.

### 기존 DB와 브라우저 데이터

기존 Compose에서 업그레이드할 때는 먼저 DB 백업을 검증하고 **기존 폴더, 프로젝트 이름, 볼륨**을 사용합니다. 이름을 새 운영 프로젝트로 바꾸면 별도 빈 볼륨이 연결됩니다. 변경된 이미지를 빌드하고 일반 `migrate`를 실행합니다. 기존 초기화 스크립트로 만든 DB라는 진단을 받으면, 이전 001–003 중 적용된 범위를 확인한 뒤 다음 명령을 실행합니다.

```sh
docker compose run --rm --no-deps web node scripts/db.mjs migrate --adopt-legacy
```

마이그레이션은 파일명과 체크섬을 기록하며, 이미 적용한 SQL과 기존 행을 유지합니다. 기존 이메일이 대소문자만 다른 상태로 중복되어 있으면 마이그레이션이 중단됩니다. 계정 병합·삭제는 관리자가 판단합니다.

설정의 **브라우저 데이터 가져오기**에서 대상과 계정을 확인한 뒤 가져옵니다. 데모와 운영 주소가 다르면 데모 설정에서 JSON 파일로 내보냈다가 운영 설정에서 선택합니다. 기존 PostgreSQL의 대상 영역에 데이터가 있으면 덮어쓰지 않으며, 계정당 한 번만 가져옵니다. 파일과 브라우저 원본은 그대로 남습니다. 운영 중 DB 연결이 끊기면 오류를 표시합니다.

### 집 PC에서 확인할 항목

- Windows Docker Desktop에서 운영·개발 프로젝트의 볼륨과 계정이 서로 다른지, DB 포트가 외부에 열리지 않는지 확인합니다.
- 기존 운영 볼륨의 백업·복원과 마이그레이션을 먼저 확인한 뒤 실제 데이터를 가져옵니다.
- 집 PC의 실제 접속 주소와 `AUTH_URL` 일치, Tailscale Serve HTTPS 및 기기 접근 정책을 확인합니다.
- 기본 AI Provider는 Mock입니다. 실제 Ollama 연결과 AI 도구 호출 검증은 후속 작업입니다.

## 설계 문서

- [개발 지침](AGENTS.md)
- [요구사항](docs/REQUIREMENTS.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [DB 설계](docs/DATABASE.md)
- [UI 설계](docs/UI_DESIGN.md)
- [개발 작업](docs/TASKS.md)
