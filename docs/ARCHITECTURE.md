# 아키텍처 v0.1

모듈러 모놀리스. 별도 Spring Boot, nginx, Redis, Kafka, Kubernetes, LangChain은 초기 제외.

```mermaid
flowchart TD
  U[PC / 스마트폰] --> T[Tailscale HTTPS]
  T --> N[Next.js / Auth.js]
  N --> S[Service / validation]
  S --> R[Repository]
  R --> P[(PostgreSQL Docker)]
  S --> A[AI Provider / tool registry]
  A --> O[Ollama Windows]
  A --> S
```
Next.js 및 PostgreSQL은 운영 Docker Compose, Ollama는 호스트 직접 설치. Docker 내부 PostgreSQL은 서비스명으로 접근하며 운영 DB 포트는 publish하지 않는다. Docker Desktop에서 Ollama 접속은 `host.docker.internal:11434` 후보이나 기본 loopback 바인딩과 실제 접근 가능성을 확인해야 한다. 필요 시 제한된 호스트 인터페이스/방화벽 규칙을 승인 후 구성하거나 초기 Next.js를 호스트에서 실행한다. Tailscale Serve HTTPS로 웹만 제공하고 Funnel은 사용하지 않는다. 외부 포트포워딩 금지.

## 폴더
```
src/app/(auth)/login/
src/app/(dashboard)/[각 화면]/
src/app/api/
src/components/
src/features/[모듈]/
src/services/
src/repositories/
src/lib/ai/
src/lib/db/
src/types/
src/hooks/
database/migrations/
database/seeds/
docs/
tests/
```
API: GET/POST `/api/schedules`, GET/PATCH/DELETE `/api/schedules/:id`를 기본 패턴으로 한다. `/api/tasks`, `/api/transactions`, `/api/inventory`, `/api/utilities`, `/api/notes`, `/api/learning`, `/api/analytics`, `/api/dashboard`, `/api/settings`, `/api/ai/chat`, `/api/chat/sessions`, `/api/ai/confirm` 등. 조회 전용 기능에는 불필요한 CRUD를 만들지 않는다. 응답 오류는 일관된 코드와 사용자 메시지를 사용한다.

## AI 처리
Provider 인터페이스는 메시지, 허용 도구 스키마, 모델 설정을 받고 구조화된 응답/도구 요청을 반환한다. Ollama `/api/chat` 우선. 모델별 도구 호출 지원과 JSON 구조화 출력 검증; 필요 시 JSON 의도 분류로 대체한다. 서버에서 도구 이름과 파라미터 검증, 사용자 소유권 검사, 읽기는 즉시 실행, 쓰기는 확인 후 실행. 결과를 모델에 전달하거나 서버에서 성공 메시지 생성. 도구 반복 횟수 제한, 타임아웃 및 취소 적용. 데이터 원문은 신뢰하지 않는다.

컨텍스트: 시스템 규칙 + 필요한 사용자 기억 + 최근 메시지(초기 10개 상한 후보, 토큰 예산도 적용) + 관련 데이터 + 현재 요청. 전체 DB나 대화 이력을 매번 전달하지 않는다. 장기 기억은 사용자가 수정·삭제 가능하도록 한다. 데이터 삭제 정책과 로그 보존 기간은 구현 때 확정한다.

## 환경 분리
개발 3000, 운영 3001 제안. 별도 DB/계정/볼륨/환경변수. 운영 데이터 복제 금지. `.env.example`에는 placeholder만. 개발 DB 포트가 필요하면 loopback에만 바인딩. 운영 DB 백업은 암호화 및 별도 저장장치 권장, 복구 테스트 필수.

초기 라이브러리 추가 제안: pg(파라미터 SQL), Zod(검증), Argon2id 또는 bcrypt(비밀번호 해시). 실제 호환성과 환경 확인 후 확정. Auth.js Credentials/JWT 사용 시 사용자 레코드 및 비밀번호 검증은 앱이 관리하고, 공개 회원가입 없이 최초 계정 생성 절차를 제공한다.
