BEGIN;

SET LOCAL TIME ZONE 'Asia/Seoul';

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')),
  language text NOT NULL DEFAULT 'ko',
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  ai_provider text NOT NULL DEFAULT 'mock' CHECK (ai_provider IN ('mock','ollama')),
  ai_model text,
  UNIQUE (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE TRIGGER user_settings_set_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  module text NOT NULL,
  name text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (user_id,module,name),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  module text NOT NULL,
  action text NOT NULL,
  target_id uuid,
  source text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE TRIGGER activity_logs_set_updated_at BEFORE UPDATE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  summary text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE TRIGGER chat_sessions_set_updated_at BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content text NOT NULL,
  model text,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY (user_id, session_id) REFERENCES chat_sessions(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX chat_messages_session_id_idx ON chat_messages(user_id, session_id);
CREATE TRIGGER chat_messages_set_updated_at BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chat_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL,
  content text NOT NULL,
  source_message_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (user_id, source_message_id) REFERENCES chat_messages(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX chat_memories_source_message_id_idx ON chat_memories(user_id, source_message_id);
CREATE TRIGGER chat_memories_set_updated_at BEFORE UPDATE ON chat_memories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ai_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  message_id uuid NOT NULL,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  status text NOT NULL CHECK (status IN ('pending','confirmed','success','failed','expired')),
  duration_ms integer CHECK (duration_ms >= 0),
  idempotency_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  UNIQUE (user_id,idempotency_key),
  FOREIGN KEY (user_id, message_id) REFERENCES chat_messages(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX ai_execution_logs_message_id_idx ON ai_execution_logs(user_id, message_id);
CREATE TRIGGER ai_execution_logs_set_updated_at BEFORE UPDATE ON ai_execution_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  location text,
  category_id uuid,
  CHECK (start_at <= end_at),
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX schedules_category_id_idx ON schedules(user_id, category_id);
CREATE TRIGGER schedules_set_updated_at BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  description text,
  start_date date,
  target_date date,
  status text NOT NULL CHECK (status IN ('planned','active','done','paused')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  repository_url text,
  CHECK (start_date <= target_date),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status text NOT NULL CHECK (status IN ('planned','active','done')),
  priority integer NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  completed_at timestamptz,
  category_id uuid,
  project_id uuid,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX tasks_category_id_idx ON tasks(user_id, category_id);
CREATE INDEX tasks_project_id_idx ON tasks(user_id, project_id);
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  transaction_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  category_id uuid,
  merchant text,
  payment_method text,
  description text,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX transactions_category_id_idx ON transactions(user_id, category_id);
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  category_id uuid,
  quantity numeric(12,3) NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  storage_type text NOT NULL CHECK (storage_type IN ('refrigerated','frozen','pantry')),
  purchase_date date,
  expiry_date date,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX inventory_items_category_id_idx ON inventory_items(user_id, category_id);
CREATE TRIGGER inventory_items_set_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  item_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('add','remove')),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  transaction_id uuid,
  description text,
  FOREIGN KEY (user_id, item_id) REFERENCES inventory_items(user_id, id),
  FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX inventory_history_item_id_idx ON inventory_history(user_id, item_id);
CREATE INDEX inventory_history_transaction_id_idx ON inventory_history(user_id, transaction_id);
CREATE TRIGGER inventory_history_set_updated_at BEFORE UPDATE ON inventory_history
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE utility_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  billing_month date NOT NULL CHECK (EXTRACT(DAY FROM billing_month) = 1),
  bill_type text NOT NULL,
  total_amount numeric(15,2) NOT NULL CHECK (total_amount >= 0),
  due_date date,
  paid_date date,
  status text NOT NULL CHECK (status IN ('unpaid','paid')),
  transaction_id uuid UNIQUE,
  FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX utility_bills_transaction_id_idx ON utility_bills(user_id, transaction_id);
CREATE TRIGGER utility_bills_set_updated_at BEFORE UPDATE ON utility_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE utility_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  bill_id uuid NOT NULL,
  item_name text NOT NULL,
  usage_amount numeric(12,3) CHECK (usage_amount >= 0),
  usage_unit text,
  amount numeric(15,2) NOT NULL CHECK (amount >= 0),
  period_start date,
  period_end date,
  CHECK (period_start <= period_end),
  FOREIGN KEY (user_id, bill_id) REFERENCES utility_bills(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX utility_bill_items_bill_id_idx ON utility_bill_items(user_id, bill_id);
CREATE TRIGGER utility_bill_items_set_updated_at BEFORE UPDATE ON utility_bill_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  content text NOT NULL,
  category_id uuid,
  tags text[] NOT NULL DEFAULT '{}',
  is_favorite boolean NOT NULL DEFAULT false,
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX notes_category_id_idx ON notes(user_id, category_id);
CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE learning_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  target_date date,
  target_minutes integer CHECK (target_minutes >= 0),
  status text NOT NULL CHECK (status IN ('planned','active','done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE TRIGGER learning_goals_set_updated_at BEFORE UPDATE ON learning_goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE learning_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  goal_id uuid,
  project_id uuid,
  learning_date date NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes >= 0),
  content text NOT NULL,
  FOREIGN KEY (user_id, goal_id) REFERENCES learning_goals(user_id, id),
  FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX learning_logs_goal_id_idx ON learning_logs(user_id, goal_id);
CREATE INDEX learning_logs_project_id_idx ON learning_logs(user_id, project_id);
CREATE TRIGGER learning_logs_set_updated_at BEFORE UPDATE ON learning_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE daily_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  activity_date date NOT NULL,
  activity_type text NOT NULL,
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes integer CHECK (duration_minutes >= 0),
  description text,
  CHECK (start_at <= end_at),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE TRIGGER daily_activities_set_updated_at BEFORE UPDATE ON daily_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX schedules_start_idx ON schedules(user_id, start_at);
CREATE INDEX tasks_due_idx ON tasks(user_id, due_at);
CREATE INDEX transactions_date_idx ON transactions(user_id, transaction_date);
CREATE INDEX utility_bills_month_idx ON utility_bills(user_id, billing_month);
CREATE INDEX chat_messages_created_idx ON chat_messages(session_id, created_at);
CREATE INDEX learning_logs_date_idx ON learning_logs(user_id, learning_date);
CREATE INDEX daily_activities_date_idx ON daily_activities(user_id, activity_date);

COMMIT;
