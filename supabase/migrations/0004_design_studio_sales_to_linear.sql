-- Baseline migration 0004
-- Purpose: Design Studio (Attio deals) -> Production (Linear projects/issues)
-- NOTE: Repository convention: use schema "bot".

-- 1) Deal stages (canonical list + ordering + semantics)
CREATE TABLE IF NOT EXISTS bot.deal_stages (
  stage_key text PRIMARY KEY,
  stage_name text NOT NULL,
  order_index integer NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  is_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_stages_stage_name_unique UNIQUE(stage_name)
);

-- 2) Aliases to map free-form input -> stage_key
CREATE TABLE IF NOT EXISTS bot.deal_stage_aliases (
  alias text PRIMARY KEY,
  stage_key text NOT NULL REFERENCES bot.deal_stages(stage_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Link Attio deal -> Linear project (1:1)
CREATE TABLE IF NOT EXISTS bot.deal_linear_links (
  attio_deal_id text PRIMARY KEY,
  linear_project_id text NOT NULL,
  linear_team_id text,
  project_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Template tasks already created for a Linear project (idempotency)
CREATE TABLE IF NOT EXISTS bot.project_template_tasks (
  linear_project_id text NOT NULL,
  template_task_key text NOT NULL,
  linear_issue_id text,
  linear_issue_identifier text,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (linear_project_id, template_task_key)
);

-- 5) Reminders: paused deals
CREATE TABLE IF NOT EXISTS bot.reminders (
  reminder_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attio_deal_id text NOT NULL,
  reminder_type text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reminders_due_at_idx ON bot.reminders(due_at);
CREATE INDEX IF NOT EXISTS reminders_status_due_at_idx ON bot.reminders(status, due_at);
CREATE INDEX IF NOT EXISTS reminders_deal_idx ON bot.reminders(attio_deal_id);

-- Seed canonical stages
INSERT INTO bot.deal_stages(stage_key, stage_name, order_index, is_terminal, is_hold)
VALUES
  ('new_lead', 'Новый лид', 10, false, false),
  ('qualification', 'Квалификация', 20, false, false),
  ('briefing', 'Брифинг', 30, false, false),
  ('proposal_sent', 'КП отправлено', 40, false, false),
  ('negotiation', 'Переговоры', 50, false, false),
  ('contract_approval', 'Согласование договора', 60, false, false),
  ('paused', 'На паузе', 70, false, true),
  ('won', 'Выиграно', 80, true, false),
  ('lost', 'Проиграно', 90, true, false)
ON CONFLICT (stage_key) DO UPDATE
SET stage_name = EXCLUDED.stage_name,
    order_index = EXCLUDED.order_index,
    is_terminal = EXCLUDED.is_terminal,
    is_hold = EXCLUDED.is_hold;

-- Seed pragmatic aliases
INSERT INTO bot.deal_stage_aliases(alias, stage_key)
VALUES
  ('лид', 'new_lead'),
  ('новый', 'new_lead'),
  ('квалиф', 'qualification'),
  ('квалификация', 'qualification'),
  ('бриф', 'briefing'),
  ('брифинг', 'briefing'),
  ('кп', 'proposal_sent'),
  ('коммерческое', 'proposal_sent'),
  ('переговоры', 'negotiation'),
  ('договор', 'contract_approval'),
  ('пауза', 'paused'),
  ('выиграно', 'won'),
  ('проиграно', 'lost')
ON CONFLICT (alias) DO NOTHING;
