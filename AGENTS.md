# AGENTS.md — 개인 AI 비서 개발 지침

## 목표 및 범위
- 본인 1인용 한국어 반응형 웹 서비스. AI 채팅을 기본 진입 화면으로 하고 8개 관리 모듈을 제공한다.
- 모든 주요 화면을 먼저 구현하고 실제 사용하면서 세부 기능을 개선한다. 103개 세부 기능 후보를 일괄 구현하지 않는다.
- 요구사항은 `docs/REQUIREMENTS.md`, 구조는 `docs/ARCHITECTURE.md`, DB는 `docs/DATABASE.md`, UI는 `docs/UI_DESIGN.md`, 작업 순서는 `docs/TASKS.md`를 참조한다.

## 기술 및 구현 규칙
- Next.js App Router, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide, Recharts, FullCalendar(무료 기능), PostgreSQL 로컬, Auth.js, Ollama 로컬, Docker Compose, Tailscale, GitHub Private.
- 패키지 버전은 개발 환경 확인 후 호환되는 안정 버전을 선정하고 lockfile로 고정한다. npm을 기본으로 제안한다. 유료 의존성은 임의로 추가하지 않는다.
- 기능별 모듈을 분리하고 Route Handler → Service → Repository 구조를 사용한다. UI와 AI는 동일 서비스 로직을 사용한다. SQL은 파라미터 바인딩한다.
- 모든 입력을 서버에서 검증한다. 금액과 재고 계산은 SQL/서버에서 처리한다. 시간대 Asia/Seoul, 저장 시 TIMESTAMPTZ, 금액 NUMERIC.
- AI Provider 인터페이스를 통해 모델을 교체 가능하게 한다. 초기 모델은 gemma3:4b 테스트 후보이며 최종 모델은 미정이다. 중국 기업 개발 모델 및 외부 AI API는 사용하지 않는다.
- AI는 허용된 도구만 요청할 수 있다. 임의 SQL, 셸 명령, 파일 접근 및 외부 네트워크 도구를 제공하지 않는다. 모델 출력은 신뢰하지 않는다.
- 데이터 변경은 검증된 요청을 서버에 보관한 후 사용자 확인을 받아 실행한다. 확인은 사용자·세션·요청에 묶고 만료 및 재실행 방지 키를 적용한다. 성공 응답은 DB 커밋 후에만 표시한다.
- 로그인 및 모든 업무 API에 인증·소유권 검증을 적용한다. Auth.js Credentials + 해시 비밀번호 + JWT 세션을 초기 후보로 삼고 호환성을 확인한다. 공개 회원가입은 제외한다. 로그인 시도 제한, 안전한 쿠키, CSRF/Origin 검증을 적용한다.
- DB와 Ollama 포트는 인터넷에 공개하지 않는다. 운영 웹은 Tailscale 전용 HTTPS 접근을 목표로 한다. Ollama 호스트 연결은 실제 환경에서 검증하며 무조건 전체 인터페이스에 바인딩하지 않는다.
- 비밀번호, API 키, 운영 DB, 실제 채팅·가계부 데이터, 백업은 Git에 커밋하거나 Codex 프롬프트에 포함하지 않는다. 예시 데이터는 가상 데이터만 사용한다. 로그에 비밀값 및 불필요한 원문을 남기지 않는다.
- AI 장애 시에도 수동 CRUD가 가능해야 한다. AI 타임아웃, 취소, 오류 안내를 구현한다.
- 적용된 DB 마이그레이션 수정 금지. 새 파일로 변경한다. 운영 데이터 삭제·초기화, 방화벽 변경, 외부 전송, 유료 서비스 도입은 사용자 승인 없이 수행하지 않는다.

## 작업 방식
1. 먼저 저장소 및 설치 환경을 확인하고 계획과 변경 대상 파일을 제시한다. 설치되지 않은 프로그램은 명시한다.
2. TASKS의 현재 단계만 구현하고 범위를 임의 확대하지 않는다. 설계 변경은 이유와 영향 범위를 보고한다.
3. 변경 후 lint, typecheck, 테스트, build를 가능한 범위에서 실행하고 실제 결과를 기록한다. 실행하지 못한 검증은 명시한다.
4. 완료한 작업만 체크하고 다음 작업을 제안한다. 실제 운영 배포는 사용자 승인 후 수행한다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
