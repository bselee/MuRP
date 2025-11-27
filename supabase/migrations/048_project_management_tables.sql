-- ============================================================================
-- Migration: Project Management & Internal Ticketing System
-- ============================================================================
-- Creates infrastructure for Kanban-based task management with role-based
-- delegation settings. Enables upward questions (staff → managers/admins)
-- and configurable approval/delegation workflows.
--
-- Tables:
--   - projects: Top-level project containers
--   - tickets: Individual work items / tasks / questions
--   - ticket_comments: Discussion threads
--   - ticket_activity: Audit log of changes
--   - delegation_settings: Role-based delegation configuration
--
-- Author: MuRP Team
-- Date: 2025-11-27
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DELEGATION SETTINGS TABLE
-- ============================================================================
-- Configurable permissions for who can delegate specific task types
-- e.g., which roles can assign maintenance tasks, approve BOMs, etc.

CREATE TABLE IF NOT EXISTS delegation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Task type this setting applies to
  task_type TEXT NOT NULL CHECK (task_type IN (
    'maintenance',
    'build_order',
    'bom_revision_approval',
    'artwork_approval',
    'po_approval',
    'requisition_approval',
    'general_task',
    'question',
    'follow_up'
  )),
  
  -- Who can create/assign this type of task
  can_create_roles TEXT[] DEFAULT ARRAY['Admin', 'Manager', 'Staff'],
  can_assign_roles TEXT[] DEFAULT ARRAY['Admin', 'Manager'],
  
  -- Who can be assigned (target roles)
  assignable_to_roles TEXT[] DEFAULT ARRAY['Admin', 'Manager', 'Operations'],
  
  -- Department restrictions (null = all departments)
  restricted_to_departments TEXT[],
  
  -- Workflow settings
  requires_approval BOOLEAN DEFAULT false,
  approval_chain TEXT[], -- e.g., ['Manager', 'Operations', 'Admin']
  auto_escalate_hours INTEGER, -- Hours before auto-escalation
  escalation_target_role TEXT,
  
  -- Notifications
  notify_on_create BOOLEAN DEFAULT true,
  notify_on_assign BOOLEAN DEFAULT true,
  notify_on_complete BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  UNIQUE(task_type)
);

-- ============================================================================
-- 2. PROJECTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core fields
  name TEXT NOT NULL,
  description TEXT,
  code TEXT UNIQUE, -- Short code like "MRP-001"
  
  -- Status and type
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  project_type TEXT DEFAULT 'general' CHECK (project_type IN (
    'general',
    'production',
    'maintenance',
    'compliance',
    'development',
    'operations'
  )),
  
  -- Ownership
  owner_id UUID REFERENCES auth.users(id),
  department TEXT,
  
  -- Configuration
  default_assignee_id UUID REFERENCES auth.users(id),
  board_columns JSONB DEFAULT '["open", "in_progress", "review", "done"]'::JSONB,
  
  -- Dates
  start_date DATE,
  target_end_date DATE,
  actual_end_date DATE,
  
  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_department ON projects(department);

-- ============================================================================
-- 3. TICKETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference number (auto-generated)
  ticket_number SERIAL,
  
  -- Project relationship (optional - can have standalone tickets)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Core fields
  title TEXT NOT NULL,
  description TEXT,
  
  -- Status workflow
  status TEXT DEFAULT 'open' CHECK (status IN (
    'open',
    'in_progress',
    'review',
    'blocked',
    'done',
    'closed',
    'cancelled'
  )),
  
  -- Classification
  ticket_type TEXT DEFAULT 'task' CHECK (ticket_type IN (
    'task',
    'question',      -- Staff asking managers/admin
    'bug',
    'feature',
    'maintenance',
    'follow_up',
    'approval_request',
    'escalation'
  )),
  
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Assignment
  reporter_id UUID REFERENCES auth.users(id),  -- Who created the ticket
  assignee_id UUID REFERENCES auth.users(id),  -- Who is responsible
  
  -- For questions/escalations: who should respond
  directed_to_id UUID REFERENCES auth.users(id),
  directed_to_role TEXT, -- e.g., 'Manager', 'Admin', 'Operations'
  
  -- Department context
  department TEXT,
  
  -- Dates
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Estimation
  estimated_hours DECIMAL(6,2),
  actual_hours DECIMAL(6,2),
  
  -- Hierarchical structure (subtasks)
  parent_ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Related entities (link to PO, BOM, Requisition, etc.)
  related_entity_type TEXT, -- 'purchase_order', 'bom', 'requisition', 'build_order'
  related_entity_id TEXT,
  
  -- Tags and labels
  tags TEXT[],
  
  -- Kanban position
  board_column TEXT DEFAULT 'open',
  board_position INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON tickets(reporter_id);
CREATE INDEX IF NOT EXISTS idx_tickets_directed_to ON tickets(directed_to_id);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_due_date ON tickets(due_date);
CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(parent_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_related ON tickets(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_board ON tickets(board_column, board_position);

-- ============================================================================
-- 4. TICKET COMMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  
  -- Content
  content TEXT NOT NULL,
  
  -- Comment type
  comment_type TEXT DEFAULT 'comment' CHECK (comment_type IN (
    'comment',
    'reply',
    'resolution',
    'internal_note',
    'system'  -- Auto-generated comments
  )),
  
  -- For replies to other comments
  parent_comment_id UUID REFERENCES ticket_comments(id) ON DELETE CASCADE,
  
  -- Mentions
  mentioned_user_ids UUID[],
  
  -- Attachments (references to storage)
  attachments JSONB DEFAULT '[]'::JSONB,
  
  -- Metadata
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_author ON ticket_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_parent ON ticket_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_created ON ticket_comments(created_at DESC);

-- ============================================================================
-- 5. TICKET ACTIVITY TABLE (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  
  -- Action type
  action TEXT NOT NULL CHECK (action IN (
    'created',
    'updated',
    'status_changed',
    'assigned',
    'unassigned',
    'priority_changed',
    'due_date_changed',
    'commented',
    'mentioned',
    'moved',  -- Board position change
    'linked',
    'unlinked',
    'escalated',
    'resolved',
    'reopened',
    'closed'
  )),
  
  -- What changed
  field_name TEXT,
  old_value JSONB,
  new_value JSONB,
  
  -- Additional context
  comment TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_actor ON ticket_activity(actor_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_action ON ticket_activity(action);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_created ON ticket_activity(created_at DESC);

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE delegation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_activity ENABLE ROW LEVEL SECURITY;

-- Delegation settings: Admin only for write, everyone can read
DROP POLICY IF EXISTS delegation_settings_select ON delegation_settings;
CREATE POLICY delegation_settings_select ON delegation_settings 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS delegation_settings_admin ON delegation_settings;
CREATE POLICY delegation_settings_admin ON delegation_settings 
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role = 'Admin'
    )
  );

-- Projects: All authenticated users can view, creators and admins can modify
DROP POLICY IF EXISTS projects_select ON projects;
CREATE POLICY projects_select ON projects 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS projects_insert ON projects;
CREATE POLICY projects_insert ON projects 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS projects_update ON projects;
CREATE POLICY projects_update ON projects 
  FOR UPDATE TO authenticated 
  USING (
    owner_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('Admin', 'Manager')
    )
  );

-- Tickets: Viewable by all, editable by reporter, assignee, and admins/managers
DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tickets_insert ON tickets;
CREATE POLICY tickets_insert ON tickets 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets 
  FOR UPDATE TO authenticated 
  USING (
    reporter_id = auth.uid()
    OR assignee_id = auth.uid()
    OR directed_to_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('Admin', 'Manager')
    )
  );

DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets 
  FOR DELETE TO authenticated 
  USING (
    reporter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role = 'Admin'
    )
  );

-- Comments: Anyone can read, authors can edit their own
DROP POLICY IF EXISTS ticket_comments_select ON ticket_comments;
CREATE POLICY ticket_comments_select ON ticket_comments 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ticket_comments_insert ON ticket_comments;
CREATE POLICY ticket_comments_insert ON ticket_comments 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS ticket_comments_update ON ticket_comments;
CREATE POLICY ticket_comments_update ON ticket_comments 
  FOR UPDATE TO authenticated 
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS ticket_comments_delete ON ticket_comments;
CREATE POLICY ticket_comments_delete ON ticket_comments 
  FOR DELETE TO authenticated 
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role = 'Admin'
    )
  );

-- Activity: Read-only for authenticated, system writes
DROP POLICY IF EXISTS ticket_activity_select ON ticket_activity;
CREATE POLICY ticket_activity_select ON ticket_activity 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ticket_activity_insert ON ticket_activity;
CREATE POLICY ticket_activity_insert ON ticket_activity 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

-- ============================================================================
-- 7. DEFAULT DELEGATION SETTINGS
-- ============================================================================

INSERT INTO delegation_settings (task_type, can_create_roles, can_assign_roles, assignable_to_roles, requires_approval, approval_chain, notify_on_create)
VALUES 
  ('question', ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager', 'Operations'], false, NULL, true),
  ('maintenance', ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager'], ARRAY['Admin', 'Manager', 'Staff'], false, NULL, true),
  ('build_order', ARRAY['Admin', 'Manager'], ARRAY['Admin', 'Manager'], ARRAY['Manager', 'Staff'], false, NULL, true),
  ('bom_revision_approval', ARRAY['Admin', 'Manager'], ARRAY['Admin'], ARRAY['Admin', 'Operations'], true, ARRAY['Manager', 'Admin'], true),
  ('artwork_approval', ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager'], ARRAY['Admin', 'Manager'], true, ARRAY['Manager'], true),
  ('po_approval', ARRAY['Admin', 'Manager'], ARRAY['Admin'], ARRAY['Admin', 'Operations', 'Manager'], true, ARRAY['Manager', 'Admin'], true),
  ('requisition_approval', ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager'], ARRAY['Manager', 'Operations', 'Admin'], true, ARRAY['Manager', 'Operations'], true),
  ('general_task', ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager'], ARRAY['Admin', 'Manager', 'Staff'], false, NULL, true),
  ('follow_up', ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager', 'Staff'], ARRAY['Admin', 'Manager', 'Staff'], false, NULL, true)
ON CONFLICT (task_type) DO NOTHING;

-- ============================================================================
-- 8. TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_delegation_settings_updated_at
    BEFORE UPDATE ON delegation_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Get tickets assigned to or directed to a user
CREATE OR REPLACE FUNCTION get_my_tickets(user_id UUID)
RETURNS SETOF tickets AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM tickets
  WHERE 
    assignee_id = user_id
    OR reporter_id = user_id
    OR directed_to_id = user_id
  ORDER BY 
    CASE priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'medium' THEN 3 
      WHEN 'low' THEN 4 
    END,
    created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Count open tickets for badge
CREATE OR REPLACE FUNCTION count_open_tickets_for_user(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  ticket_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ticket_count
  FROM tickets
  WHERE 
    (assignee_id = user_id OR directed_to_id = user_id)
    AND status NOT IN ('done', 'closed', 'cancelled');
  RETURN ticket_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
