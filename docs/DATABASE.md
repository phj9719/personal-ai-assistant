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
