# Personal AI Assistant

개인 일정, 할 일, 가계부, 식품 재고, 공과금, 메모, 개발·학습, 생활 패턴을 채팅과 관리 화면으로 통합하는 개인 AI 비서 프로젝트.

## 상태
2026-11-27 기준 기획·기본 설계 초안 완료. 소스코드 및 실행 환경은 아직 구축하지 않았다. 아래 실행 명령은 구현 후 목표 명령이며 지금은 실행할 수 없다.

## 환경
Windows 집 PC (Ryzen 5 5600, RAM 16GB, RTX 4060 8GB, NVMe 512GB — 기존 제공 사양). Next.js/PostgreSQL은 Docker Compose 운영, Ollama는 Windows 직접 설치, 외부 접속은 Tailscale. 개발은 Windows에서 npm 개발 서버를 우선 고려한다.

## 시작 전 확인 (PowerShell)
```powershell
code --version
node -v
npm -v
git --version
docker --version
docker compose version
wsl -l -v
python --version
codex --version
ollama --version
```
Ollama 설치: https://ollama.com/download/windows
```powershell
ollama run gemma3:4b
# 채팅 종료: /bye
ollama list
ollama ps
```
`ollama ps`는 모델이 메모리에 로드된 동안 확인한다. 최종 모델은 한국어 및 기능 호출 테스트 후 선정한다.

## 목표 실행 절차 (구현 후)
1. `.env.example`을 참고하여 로컬 환경변수 파일 생성 (비밀값은 직접 설정).
2. `npm ci` (lockfile 생성 이후), 개발용 DB 실행, 마이그레이션 및 최초 사용자 생성.
3. `npm run dev` — 개발 포트 3000 제안.
4. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
5. 운영은 `docker compose up -d --build` — 운영 포트 3001 제안. Tailscale HTTPS 연결 및 접근 정책 확인 후 사용.

## 문서
- [개발 지침](AGENTS.md)
- [요구사항](docs/REQUIREMENTS.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [DB 설계](docs/DATABASE.md)
- [UI 설계](docs/UI_DESIGN.md)
- [개발 작업](docs/TASKS.md)

추가 AI API 비용 0원 목표. 전기료와 기존 ChatGPT 구독료는 별도이며 무료 소프트웨어·서비스 정책은 설치 시 확인한다. 집 PC가 꺼지면 서비스 사용 불가.
