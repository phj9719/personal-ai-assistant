# UI 설계 v0.1

ChatGPT 유사 채팅 중심. 기본 진입 `/assistant`. PC 왼쪽 사이드바, 모바일 하단 메뉴(AI 비서/홈/일정/할 일/전체)와 전체 메뉴 drawer. 한국어, 라이트/다크, 반응형.

| 메뉴 | URL | 화면 |
|---|---|---|
| AI 비서 | /assistant | 새 채팅, 채팅 목록, 메시지, 입력창, 확인 카드 |
| 대시보드 | /dashboard | 오늘 일정·할 일·지출·재고·공과금·학습 요약 |
| 일정 | /schedule | 월간 캘린더, 상세·등록 |
| 할 일 | /tasks | 상태별 목록, 완료 |
| 가계부 | /finance | 수입·지출 내역, 고정 지출 관리, 저축 및 투자, 결제수단 관리, 월별 통계 탭 |
| 냉장고 | /inventory | 보관 장소 필터, 수량, 소비기한 |
| 공과금 | /utilities | 월별 관리비·가스비 등록, 거주 기간, 사용 구분 필터, 고지서 차액, 전월·전년 비교, 차트, 표·CSV 가져오기 |
| 메모 | /knowledge | 검색, 목록, 편집 |
| 개발·학습 | /learning | 프로젝트·목표·학습 기록 탭 |
| 생활 분석 | /analytics | 지출·완료율·학습·활동 통계 |
| 설정 | /settings | 테마, 모델, 연결 상태, 기억 관리 |
| 로그인 | /login | 인증 |

공통 컴포넌트: AppLayout, Sidebar, MobileNav, Header, PageHeader, DataTable, SearchFilter, FormDialog, ConfirmDialog, StatCard, ChatMessage, ChatInput, Loading, EmptyState, Toast. 모바일 표는 카드 또는 가로 스크롤로 대응. 키보드 접근성, 포커스, 오류 안내 포함.

초기 모든 화면은 가상 데이터로 먼저 구현하되 실제 데이터와 명확히 구분한다. 기능 연결 후 미구현 버튼은 비활성화/표시하고 성공한 것처럼 보이지 않게 한다. 파일 첨부·마이크·고급 알림은 후속이다. 화면 디자인과 입력 항목은 실사용하며 수정한다.
