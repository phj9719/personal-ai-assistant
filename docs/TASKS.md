# 개발 작업 체크리스트

기본 설계와 가상 데이터 UI를 구현했다. 클라우드에서 Linux, Node.js 24, npm 11, Git 및 Docker Compose를 확인했다. Windows 집 PC와 실제 PostgreSQL·Ollama 검증은 남아 있다. 전체 기본 화면 → 실제 데이터 → AI 연동 → 배포 순으로 진행한다. 체크는 검증까지 완료한 경우만 한다.

## 0. 환경 확인
- [ ] Windows, Node/npm, Git, VS Code, Docker/Compose, WSL, Codex 설치 확인
- [ ] Ollama 설치 및 gemma3:4b 한국어 대화, GPU 확인
- [ ] 호환되는 패키지 및 런타임 버전 결정

## 1. 프로젝트 초기화 및 전체 UI
- [x] Git 저장소, Next.js App Router + TypeScript + Tailwind, 공통 UI 설치
- [x] .gitignore, .env.example, lint/typecheck/test/build 스크립트
- [x] 공통 레이아웃, PC 사이드바, 모바일 하단 메뉴, 라이트/다크
- [x] 12개 화면 모두 생성, 가상 데이터 및 공통 CRUD 컴포넌트
- [x] PC/모바일 화면 확인 및 빌드

## 2. DB 및 인증

PostgreSQL 초기 DDL, 데이터베이스 Compose 프로필, 환경 변수 계정의 Auth.js Credentials/JWT 구조를 작성했다. DB 연결 및 사용자 생성은 남아 있다.
- [ ] 개발용 PostgreSQL Compose, 운영과 분리된 볼륨 및 계정
- [ ] 기본 마이그레이션 20개 테이블(의존성 순서 및 검증 포함)
- [ ] Auth.js 로그인, 최초 사용자 생성, 비밀번호 해시, 세션 보호
- [ ] 인증·소유권 검증 및 가상 데이터 seed

## 3. 실제 기능 연결
- [ ] 일정, 할 일 CRUD
- [ ] 가계부 및 공과금 CRUD와 집계
- [ ] 냉장고 재고 CRUD와 변경 이력
- [ ] 메모 CRUD 및 검색
- [ ] 프로젝트, 학습 목표·기록 관리
- [ ] 활동 기록 및 생활 통계, 대시보드
- [ ] 전체 API·UI 정상 동작, 오류 및 빈 상태 확인

## 4. AI 비서

Mock과 Ollama Provider를 구현했다. 채팅 세션과 명시적 기억은 브라우저에 저장하며, 기억을 모델에 주입하거나 업무 도구를 호출하는 기능은 남아 있다.
- [ ] Provider 및 Ollama 연결, 모델 설정, 연결 오류 처리
- [ ] 채팅방 및 이력 저장, 최근 문맥과 명시적 기억 관리
- [ ] 도구 레지스트리, 읽기/쓰기 구분, 구조화 출력 검증
- [ ] 기본 조회 및 등록 도구를 각 업무 모듈에 연결
- [ ] 등록/변경 확인, 중복 실행 방지, 로그 및 트랜잭션
- [ ] 한국어 의도 처리, 잘못된 입력, AI 오프라인, 권한, 재시도 테스트

## 5. 운영 배포
- [ ] 별도 운영 Compose, 환경변수, 영구 저장 및 백업/복구 검증
- [ ] Docker에서 Ollama 접근 검증, DB/Ollama 인터넷 공개 금지
- [ ] Tailscale HTTPS 및 기기 접근 제한, 스마트폰 로그인 확인
- [ ] lint/typecheck/test/build, 운영 기동 및 기본 기능 스모크 테스트
- [ ] 사용자 승인 후 실제 데이터 입력 시작

## 이후 개선
- [ ] 실사용 불편 사항을 이슈로 관리하고 작은 단위로 개선
- [ ] 요약, RAG, 복합 도구 호출, 반복 일정, 알림 등 필요한 기능부터 확장

## 최초 Codex 요청 예시
저장소의 AGENTS.md와 README.md 및 docs 문서 전체를 읽어라. 현재 설치 환경과 파일 구조를 확인하고 TASKS.md 0단계의 결과 및 1단계 구현 계획을 알려줘. 환경이 준비되어 있으면 1단계(전체 기본 화면과 공통 UI)까지만 구현하고 lint/typecheck/build 결과를 보고해 줘. DB·AI 실제 연결과 운영 배포는 다음 단계에서 진행한다. 미확정 버전이나 설치가 필요한 항목은 명시하고, 유료 API 및 중국 기업 모델은 사용하지 마라. 실제 개인 데이터는 사용하지 마라.
