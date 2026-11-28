# PostgreSQL 기본 DB 설계 v0.1

초기 논리 설계 20개 테이블. 아래는 컬럼 및 관계 정의이며 실행 가능한 DDL은 개발 단계에서 생성·검증한다. UUID PK (`gen_random_uuid()`), 사용자 소유 테이블의 user_id FK, created_at/updated_at TIMESTAMPTZ 기본. 날짜 DATE, 금액 NUMERIC(15,2), 수량 NUMERIC(12,3), snake_case. 수정 시 updated_at 갱신. 시간대 Asia/Seoul. 상태는 CHECK 제약 적용.

| 테이블 | 기본 업무 컬럼 (공통 컬럼 제외) |
|---|---|
| users | email unique, name, password_hash (Auth.js Credentials 후보) |
| user_settings | user_id unique, theme, language, timezone, ai_provider, ai_model |
| categories | module, name, color, sort_order |
| activity_logs | module, action, target_id, source, details JSONB |
| chat_sessions | title, summary, last_message_at |
| chat_messages | session_id, role, content, model, metadata JSONB |
| chat_memories | category, content, source_message_id nullable, is_active |
| ai_execution_logs | message_id, tool_name, arguments JSONB, result JSONB, status, duration_ms, idempotency_key, expires_at, confirmed_at |
| schedules | title, description, start_at, end_at, all_day, location, category_id |
| tasks | title, description, due_at, status, priority, completed_at, category_id, project_id nullable |
| transactions | transaction_date, type, amount, category_id, merchant, payment_method, description |
| inventory_items | name, category_id, quantity, unit, storage_type, purchase_date, expiry_date |
| inventory_history | item_id, type, quantity, transaction_id nullable, description |
| utility_bills | billing_month, bill_type, total_amount, due_date, paid_date, status, transaction_id nullable |
| utility_bill_items | bill_id, item_name, usage_amount, usage_unit, amount, period_start, period_end |
| notes | title, content, category_id, tags TEXT[], is_favorite |
| projects | name, description, start_date, target_date, status, progress, repository_url |
| learning_goals | title, description, target_date, target_minutes, status |
| learning_logs | goal_id nullable, project_id nullable, learning_date, duration_minutes, content |
| daily_activities | activity_date, activity_type, start_at, end_at, duration_minutes, description |

## 관계 및 제약
- users 1:N 각 소유 테이블, user_settings 1:1. 관련 FK는 같은 사용자 데이터만 연결할 수 있도록 복합 FK 또는 서비스 검증을 적용한다. 가능하면 DB 제약을 우선한다.
- categories → schedules/tasks/transactions/inventory_items/notes. 분류의 module 일치 검증.
- chat_sessions → chat_messages → ai_execution_logs; chat_messages → chat_memories (선택적 출처, 삭제 정책 명시).
- inventory_items → inventory_history; transactions → inventory_history (선택적 연결); utility_bills → utility_bill_items; transactions → utility_bills (초기 납부 1건당 지출 1건, 중복 방지 unique).
- projects → tasks/learning_logs; learning_goals → learning_logs. 부모 삭제 시 이력 보존 여부 명시, 무조건 cascade 금지.
- amount > 0 (거래), 재고 >= 0, 변경 수량 > 0 및 유형으로 방향 구분, 진행률 0~100, 시작 <= 종료, 사용량·학습시간 음수 금지. 단위 변경 시 기존 이력과 일관성 유지. 동일 식품도 구매일/소비기한이 다르면 별도 재고 행 가능.
- 재고 변경과 이력은 같은 트랜잭션 및 동시성 검증 적용. 청구 총액은 항목과 일치 검증. 청구월은 월 첫날로 정규화. 실제 납부 시 가계부 연동 중복 방지.
- AI 실행 기록은 pending/confirmed/success/failed/expired 등 상태 및 동일 요청의 재실행 방지 키를 저장. 확인 및 실제 실행 상태 전이는 트랜잭션으로 처리. 로그에 비밀값을 남기지 않는다.
- 인덱스: user_id 및 각 FK, 자주 조회할 (user_id, 날짜), (session_id, created_at) 등. 실제 쿼리에 맞게 추가.

## 마이그레이션
`database/migrations/001_create_common.sql`부터 순차 관리. 의존 순서를 준수한다(예: projects 전에 tasks의 project FK를 만들지 않음, transactions는 inventory/utility보다 먼저, AI는 users 이후). 초기 seed는 가상 데이터 또는 기본 카테고리만. 적용 이력을 기록하고 이미 적용한 파일을 수정하지 않는다. 통계는 SQL 집계로 구현. pgvector, 반복 일정, 파일 첨부, 알림, 예산은 추후 확장.

인증 방식에 따라 users 컬럼 및 추가 테이블이 달라질 수 있으며, 실제 DDL과 제약/삭제 정책은 구현 시 검증해야 한다.

## 월별 관리비와 가스비

현재 운영 화면은 `workspace_documents`의 사용자별 `utilities` 도메인에 청구를 저장한다. 청구월·청구 종류(관리비, 가스비)·데이터 유형(실제, 참고용)의 조합은 도메인에서 유일하다. `parking`은 선택적 숫자이며 기존 데이터의 없는 키와 NULL을 모두 미확인으로 읽는다. 비교·통계는 고지서 원본 합계를 사용한다. 기존 JSON의 `parkingInBase`는 호환성을 위해 수용한다. 과거 CSV의 주차비 포함 여부 열도 읽을 수 있으며 금액 계산에 반영하지 않는다.

초기 정규화 스키마의 `utility_bills`, `utility_bill_items`, `user_settings`는 유지한다. `009_utility_parking.sql`은 관계형 월별 청구의 유일 키에 `usage_scope`를 포함하고 기본 관리비에 포함된 주차비를 나타내는 `parking_in_base`를 추가한다. 정규화 항목으로 이관 시 주차비는 기존 `utility_bill_items.item_code`의 `parking`으로 표현할 수 있다. 기존 `parking_in_base` 열은 보존한다. 이번 계산 기준 변경에는 신규 마이그레이션이 없다. 참고용 청구의 가계부 거래 연결 제한은 유지한다.

API는 사용자 소유 잠금과 문서 리비전을 사용한다. 같은 거주 기간 판정으로 입력 및 일괄 가져오기를 검증하며, 거주 기간 밖에 실제 청구를 추가·수정하면 확인을 받는다. 가계부의 연결 조회는 실제 청구의 원본 금액만 읽는다.

## 고정 지출 및 자금 이동

`003_fixed_expenses.sql`은 결제수단(`finance_payment_accounts`), 반복 설정(`finance_expense_rules`), 청구월별 예정·납부 기록(`finance_expense_months`), 직접 입력한 저축·투자(`finance_transfers`)를 추가한다. 결제수단 유형과 은행·카드사는 필수이며, 선택 별칭이 비어 있으면 빈 문자열로 저장한다. 기존 DB 구조와 결제수단 ID 참조를 유지한다. 소유자 복합 FK를 사용하고, 설정·청구월과 공과금 종류·청구월의 유일 제약으로 생성 재시도 시 중복을 방지한다. 설정 보관과 변경은 이미 생성한 월별 내역을 바꾸지 않는다. 월별 행 삭제는 계정별 문서 잠금 및 리비전 검증 안에서 청구월과 설정 ID로 대상을 확정한다. 일괄 삭제는 미납 행에 한정하며 구독 결제 참조가 있는 행은 연결 해제 후 삭제할 수 있다.

연동 시 관리비·도시가스의 본인 청구는 종류와 청구월로 조회해 고지액을 표시한다. 고지액은 실제 납부 전까지 예정액이며, 납부가 완료되면 월별 기록의 실제 금액만 집계한다. 이 경로에서 기존 `transactions`에 지출을 추가하거나 공과금의 `transaction_id`로 반영된 동일 지출을 다시 합산하지 않는다. 향후 서버에서 기존 공과금에 연결된 거래를 이관할 때 중복 거래의 연결 여부를 먼저 확인해야 한다.

## 운영 화면 저장

`004_workspace_storage.sql`은 사용자별 도메인 문서, 리비전, 최초 가져오기 이력을 추가한다. 기존 업무·채팅·재무 테이블의 행은 그대로 보존된다. 업무 화면 문서는 검증된 도메인 JSONB에 저장한다. 채팅의 별도 이관은 아래를 참조한다. `schema_migrations`는 실행기가 이름, SHA-256 체크섬, 적용 시간을 기록한다.

## 정산·대납 저장

`005_settlement_workspace.sql`은 사용자별 운영 문서에 `settlements` 배열을 추가한다. 기존 원본 거래 ID로 결제, 실제 카드 출금 및 입금을 참조한다. 같은 사용자의 `records` 또는 `settlements`를 변경할 때 Repository가 사용자 행을 잠그고, Service 검증으로 연결 대상의 종류·일자·금액과 전체 연결의 고유성을 확인한다. 연결된 원본은 연결을 해제한 뒤 수정하거나 삭제할 수 있다. 입금 취소는 정산 참조 및 집계만 되돌리며 연결 원본 거래는 보존한다. 기존 운영 문서와 거래 행은 마이그레이션 후에도 유지된다.

## 야구 저장과 연결

`006_baseball_workspace.sql`은 사용자별 PostgreSQL 운영 문서의 `baseball` 영역을 추가한다. 경기의 고유 기준은 서울 경기일, 원정팀, 홈팀, 더블헤더 번호다. 예약 내역은 경기 ID를 참조한다. 일정은 원본 ID를 붙인 조회용 일정으로 생성하며 별도 복제 행을 저장하지 않는다.

야구·거래·정산 저장을 같은 사용자 잠금 안에서 검증한다. 실제 기록한 티켓은 순액이 일치하는 일반 거래 또는 티켓만 포함하는 정산에 한 번 연결한다. 연결 원본은 기존 집계가 담당한다. 독립 티켓은 예매 완료월에 결제 순액과 본인 부담을 각각 현금 및 소비 통계에 반영한다. 나중에 기록한 환불은 예매월 순액에 반영되며 별도 환불일 집계는 지원하지 않는다. 결제일을 모르는 과거 경기의 직접 티켓값은 관람월로 집계한다.

## 채팅 이관과 삭제 정책

`007_relational_chat_history.sql`은 기존 `chat` JSONB 문서의 제목과 메시지를 정규화 테이블로 이관한다. 이전 문서에 개별 메시지 시각이 없으므로 세션 및 메시지 순서를 보존하고 새 식별자를 부여한다. 기존 정규화 세션은 보존된다. 새 운영 채팅은 `chat_sessions`와 `chat_messages`를 사용하고 질문별 답변은 유일 인덱스로 중복을 막는다.

대화 삭제는 해당 사용자의 세션과 메시지에 적용된다. 메시지에 종속된 AI 실행 로그도 삭제한다. `chat_memories`의 복합 FK는 원본 메시지 ID만 NULL로 변경하며 사용자와 기억 내용은 유지한다. 설정에 별도로 저장된 기억 문서도 채팅 삭제의 영향을 받지 않는다.

## 일상 기록·구독

008 마이그레이션은 기존 workspace_documents에 life와 subscriptions 객체 도메인을 추가한다. 기존 daily_activities, 채팅, 업무 테이블과 문서 행은 보존한다. 일상 타임라인은 기존 원본을 조회하고, 신규 일상 활동·결제 순서·그룹과 구독 서비스·결제 스냅샷·변경 이력만 각 문서에 저장한다. 신규 행은 UUID를 사용하며 구독 ID와 예정일 조합을 유일하게 검증한다. 과거 납부의 고정지출 ID 및 월, 당시 예상 요금제와 통화·환율은 현재 설정과 별도로 보존한다.
