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

## 집 PC에서 실행

Docker Desktop의 Linux 컨테이너 모드를 사용합니다. `.env.example`을 `.env`로 복사한 뒤 `docker compose up -d --build web`으로 시작합니다. 웹은 집 PC의 루프백 포트 3001에서 접속할 수 있습니다.

- **PostgreSQL 초기화** — 로컬 `.env`에 개발용 `POSTGRES_PASSWORD`를 설정하고 `docker compose --profile database up -d db`를 실행합니다. 새 볼륨에서 [초기 마이그레이션](database/migrations/001_create_common.sql)이 실행됩니다. `docker compose exec db psql -U assistant -d assistant -c '\dt'`로 20개 테이블을 확인합니다. 초기화 SQL은 기존 볼륨에 다시 적용되지 않습니다. 앱의 CRUD는 현재 브라우저에 저장됩니다.
- **Auth.js 로그인** — `DEMO_MODE=false`, 접속 주소에 맞는 `AUTH_URL`, 생성한 `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`를 설정합니다. `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`로 비밀키를 생성합니다. 해시는 비밀번호를 표준 입력으로 전달해 `node scripts/password-hash.mjs`로 생성합니다. PowerShell에서는 아래 명령을 이용할 수 있습니다. 환경 변수 파일과 파일에 넣은 해시는 개인적으로 관리하세요. 인증은 단일 환경 변수 계정과 JWT 세션을 사용합니다.
- **Ollama** — Windows에서 Ollama를 실행하고 `ollama pull gemma3:4b`를 실행합니다. 로그인 설정을 완료한 뒤 `AI_PROVIDER=ollama`와 `OLLAMA_MODEL=gemma3:4b`를 설정합니다. 웹을 Windows에서 직접 실행할 때는 `OLLAMA_BASE_URL=http://127.0.0.1:11434`를 사용합니다. Docker에서는 `http://host.docker.internal:11434`의 연결을 확인합니다. 연결이 안 되면 웹을 호스트에서 직접 실행해 먼저 검증하세요. Ollama와 PostgreSQL 포트는 외부에 공개하지 않습니다.
- **원격 접속** — 집 PC에서 검증을 마친 뒤 Tailscale Serve의 HTTPS 주소와 접근 정책을 확인하고 인증 설정을 맞춥니다.

PowerShell 7 이상에서 비밀번호 입력과 해시 생성 예시

```powershell
Read-Host "개발용 비밀번호" -MaskInput | node scripts/password-hash.mjs
```

Ollama Provider는 한국어 채팅에 응답합니다. 업무 데이터 조회와 변경, 채팅 기억의 모델 연동, DB 로그인, 운영 백업은 후속 작업입니다.

## 설계 문서

- [개발 지침](AGENTS.md)
- [요구사항](docs/REQUIREMENTS.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [DB 설계](docs/DATABASE.md)
- [UI 설계](docs/UI_DESIGN.md)
- [개발 작업](docs/TASKS.md)
