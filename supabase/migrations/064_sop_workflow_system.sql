-- SOP Workflow System Migration
-- Enables staff to create/submit SOP changes, approval processes, and interdepartmental updates

-- Create SOP submissions table for staff to submit changes
CREATE TABLE IF NOT EXISTS sop_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sop_id TEXT NOT NULL REFERENCES sop_repository(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES auth.users(id),
    submission_type TEXT NOT NULL CHECK (submission_type IN ('create', 'update', 'deprecate')),
    title TEXT NOT NULL,
    description TEXT,
    content TEXT, -- Full SOP content for new/updated SOPs
    department_id UUID REFERENCES sop_departments(id),
    role_id UUID REFERENCES sop_roles(id),
    affected_departments UUID[] DEFAULT '{}', -- Array of department IDs that may be affected
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'implemented')),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create SOP approvals table for multi-step approval workflow
CREATE TABLE IF NOT EXISTS sop_approvals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES sop_submissions(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES auth.users(id),
    department_id UUID REFERENCES sop_departments(id), -- Department-specific approval
    approval_level TEXT NOT NULL CHECK (approval_level IN ('department_lead', 'compliance_officer', 'executive', 'interdepartmental')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
    comments TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create SOP reviews table for collaborative review process
CREATE TABLE IF NOT EXISTS sop_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES sop_submissions(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES auth.users(id),
    review_type TEXT NOT NULL CHECK (review_type IN ('technical', 'compliance', 'operational', 'interdepartmental')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'requires_changes')),
    comments TEXT,
    suggested_changes JSONB DEFAULT '{}', -- Store structured change suggestions
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create department notifications table for interdepartmental updates
CREATE TABLE IF NOT EXISTS department_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sop_id TEXT REFERENCES sop_repository(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES sop_submissions(id) ON DELETE CASCADE,
    notifying_department UUID NOT NULL REFERENCES sop_departments(id),
    affected_department UUID NOT NULL REFERENCES sop_departments(id),
    notification_type TEXT NOT NULL CHECK (notification_type IN ('impact_assessment', 'review_request', 'implementation_notice', 'change_alert')),
    message TEXT NOT NULL,
    requires_response BOOLEAN DEFAULT FALSE,
    response_deadline TIMESTAMPTZ,
    response_status TEXT DEFAULT 'pending' CHECK (response_status IN ('pending', 'acknowledged', 'concerns_raised', 'approved', 'blocked')),
    response_comments TEXT,
    responded_by UUID REFERENCES auth.users(id),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create SOP change history table to track all modifications
CREATE TABLE IF NOT EXISTS sop_change_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sop_id TEXT NOT NULL REFERENCES sop_repository(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES sop_submissions(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES auth.users(id),
    change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'approved', 'implemented', 'deprecated')),
    previous_content TEXT,
    new_content TEXT,
    change_summary TEXT,
    affected_departments UUID[] DEFAULT '{}',
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sop_submissions_sop_id ON sop_submissions(sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_submissions_submitted_by ON sop_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_sop_submissions_status ON sop_submissions(status);
CREATE INDEX IF NOT EXISTS idx_sop_submissions_department ON sop_submissions(department_id);
CREATE INDEX IF NOT EXISTS idx_sop_submissions_role ON sop_submissions(role_id);

CREATE INDEX IF NOT EXISTS idx_sop_approvals_submission_id ON sop_approvals(submission_id);
CREATE INDEX IF NOT EXISTS idx_sop_approvals_approver_id ON sop_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_sop_approvals_status ON sop_approvals(status);
CREATE INDEX IF NOT EXISTS idx_sop_approvals_department ON sop_approvals(department_id);

CREATE INDEX IF NOT EXISTS idx_sop_reviews_submission_id ON sop_reviews(submission_id);
CREATE INDEX IF NOT EXISTS idx_sop_reviews_reviewer_id ON sop_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_sop_reviews_status ON sop_reviews(status);

CREATE INDEX IF NOT EXISTS idx_department_notifications_sop_id ON department_notifications(sop_id);
CREATE INDEX IF NOT EXISTS idx_department_notifications_submission_id ON department_notifications(submission_id);
CREATE INDEX IF NOT EXISTS idx_department_notifications_affected_dept ON department_notifications(affected_department);
CREATE INDEX IF NOT EXISTS idx_department_notifications_status ON department_notifications(response_status);

CREATE INDEX IF NOT EXISTS idx_sop_change_history_sop_id ON sop_change_history(sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_change_history_submission_id ON sop_change_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_sop_change_history_changed_by ON sop_change_history(changed_by);

-- Row Level Security Policies

-- SOP Submissions: Users can view submissions they created or are assigned to review
ALTER TABLE sop_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own submissions" ON sop_submissions
    FOR SELECT USING (submitted_by = auth.uid());

CREATE POLICY "Department leads can view department submissions" ON sop_submissions
    FOR SELECT USING (
        department_id IN (
            SELECT udr.department_id FROM user_department_roles udr
            JOIN sop_roles sr ON udr.role_id = sr.id
            WHERE udr.user_id = auth.uid() AND sr.name = 'lead'
        )
    );

CREATE POLICY "Compliance officers can view all submissions" ON sop_submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_department_roles udr
            JOIN sop_roles sr ON udr.role_id = sr.id
            WHERE udr.user_id = auth.uid() AND sr.name = 'compliance_officer'
        )
    );

CREATE POLICY "Users can create submissions" ON sop_submissions
    FOR INSERT WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Users can update their own draft submissions" ON sop_submissions
    FOR UPDATE USING (
        submitted_by = auth.uid() AND status = 'draft'
    );

-- SOP Approvals: Approvers can view and update their assigned approvals
ALTER TABLE sop_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvers can view their assigned approvals" ON sop_approvals
    FOR SELECT USING (approver_id = auth.uid());

CREATE POLICY "Approvers can update their assigned approvals" ON sop_approvals
    FOR UPDATE USING (approver_id = auth.uid() AND status = 'pending');

-- SOP Reviews: Reviewers can view and update their assigned reviews
ALTER TABLE sop_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers can view their assigned reviews" ON sop_reviews
    FOR SELECT USING (reviewer_id = auth.uid());

CREATE POLICY "Reviewers can update their assigned reviews" ON sop_reviews
    FOR UPDATE USING (reviewer_id = auth.uid());

CREATE POLICY "Reviewers can create reviews for submissions they can access" ON sop_reviews
    FOR INSERT WITH CHECK (
        reviewer_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM sop_submissions
            WHERE id = submission_id AND (
                submitted_by = auth.uid() OR
                department_id IN (
                    SELECT department_id FROM user_department_roles
                    WHERE user_id = auth.uid()
                )
            )
        )
    );

-- Department Notifications: Users can view notifications for their departments
ALTER TABLE department_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notifications for their departments" ON department_notifications
    FOR SELECT USING (
        affected_department IN (
            SELECT udr.department_id FROM user_department_roles udr
            WHERE udr.user_id = auth.uid()
        ) OR
        notifying_department IN (
            SELECT udr.department_id FROM user_department_roles udr
            WHERE udr.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update notifications requiring their response" ON department_notifications
    FOR UPDATE USING (
        affected_department IN (
            SELECT udr.department_id FROM user_department_roles udr
            WHERE udr.user_id = auth.uid()
        ) AND requires_response = TRUE
    );

-- SOP Change History: Read-only for audit purposes
ALTER TABLE sop_change_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view change history for SOPs they can access" ON sop_change_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sop_repository
            WHERE id = sop_change_history.sop_id AND (
                created_by = auth.uid()::text
            )
        )
    );

-- Functions for workflow automation

-- Function to automatically create department notifications when SOP changes affect other departments
CREATE OR REPLACE FUNCTION notify_affected_departments()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert notifications for each affected department
    INSERT INTO department_notifications (
        sop_id,
        submission_id,
        notifying_department,
        affected_department,
        notification_type,
        message,
        requires_response
    )
    SELECT
        NEW.sop_id,
        NEW.id,
        NEW.department_id,
        unnest(NEW.affected_departments),
        CASE
            WHEN NEW.submission_type = 'create' THEN 'implementation_notice'
            WHEN NEW.submission_type = 'update' THEN 'change_alert'
            ELSE 'review_request'
        END,
        CASE
            WHEN NEW.submission_type = 'create' THEN 'New SOP may impact your department: ' || NEW.title
            WHEN NEW.submission_type = 'update' THEN 'SOP update may affect your department: ' || NEW.title
            ELSE 'SOP change requires review: ' || NEW.title
        END,
        NEW.priority IN ('high', 'critical')
    FROM sop_submissions
    WHERE id = NEW.id AND array_length(NEW.affected_departments, 1) > 0;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically notify affected departments when submissions are created
CREATE TRIGGER trigger_notify_affected_departments
    AFTER INSERT ON sop_submissions
    FOR EACH ROW
    EXECUTE FUNCTION notify_affected_departments();

-- Function to automatically assign reviewers based on department and role
CREATE OR REPLACE FUNCTION assign_sop_reviewers()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-assign compliance officers for compliance-related SOPs
    IF NEW.department_id IN (
        SELECT id FROM sop_departments WHERE name ILIKE '%compliance%'
    ) THEN
        INSERT INTO sop_reviews (submission_id, reviewer_id, review_type)
        SELECT
            NEW.id,
            udr.user_id,
            'compliance'
        FROM user_department_roles udr
        WHERE udr.role = 'compliance_officer'
        AND udr.department_id = NEW.department_id;
    END IF;

    -- Auto-assign department leads for department-specific SOPs
    INSERT INTO sop_reviews (submission_id, reviewer_id, review_type)
    SELECT
        NEW.id,
        udr.user_id,
        'operational'
    FROM user_department_roles udr
    WHERE udr.role = 'lead'
    AND udr.department_id = NEW.department_id
    AND udr.user_id != NEW.submitted_by; -- Don't assign to submitter

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically assign reviewers when submissions are created
CREATE TRIGGER trigger_assign_sop_reviewers
    AFTER INSERT ON sop_submissions
    FOR EACH ROW
    EXECUTE FUNCTION assign_sop_reviewers();

-- Function to update SOP status when all approvals are complete
CREATE OR REPLACE FUNCTION update_sop_submission_status()
RETURNS TRIGGER AS $$
DECLARE
    total_approvals INTEGER;
    approved_count INTEGER;
    rejected_count INTEGER;
BEGIN
    -- Count approvals for this submission
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'approved'),
        COUNT(*) FILTER (WHERE status = 'rejected')
    INTO total_approvals, approved_count, rejected_count
    FROM sop_approvals
    WHERE submission_id = NEW.submission_id;

    -- Update submission status based on approvals
    IF rejected_count > 0 THEN
        UPDATE sop_submissions
        SET status = 'rejected', updated_at = NOW()
        WHERE id = NEW.submission_id;
    ELSIF approved_count = total_approvals AND total_approvals > 0 THEN
        UPDATE sop_submissions
        SET status = 'approved', updated_at = NOW()
        WHERE id = NEW.submission_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update submission status when approvals change
CREATE TRIGGER trigger_update_submission_status
    AFTER UPDATE ON sop_approvals
    FOR EACH ROW
    EXECUTE FUNCTION update_sop_submission_status();

-- Function to implement approved SOP changes
CREATE OR REPLACE FUNCTION implement_sop_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- When submission status changes to 'approved', implement the changes
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        -- Update the SOP repository with the new content
        UPDATE sop_repository
        SET
            title = NEW.title,
            content = NEW.content,
            updated_at = NOW(),
            version = version + 1,
            last_modified_by = NEW.submitted_by
        WHERE id = NEW.sop_id;

        -- Record the change in history
        INSERT INTO sop_change_history (
            sop_id,
            submission_id,
            changed_by,
            change_type,
            previous_content,
            new_content,
            change_summary,
            affected_departments,
            change_reason
        )
        SELECT
            NEW.sop_id,
            NEW.id,
            NEW.submitted_by,
            'implemented',
            sr.content,
            NEW.content,
            'SOP updated via approval workflow',
            NEW.affected_departments,
            NEW.description
        FROM sop_repository sr
        WHERE sr.id = NEW.sop_id;

        -- Mark submission as implemented
        UPDATE sop_submissions
        SET status = 'implemented', updated_at = NOW()
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to implement approved SOP changes
CREATE TRIGGER trigger_implement_sop_changes
    AFTER UPDATE ON sop_submissions
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
    EXECUTE FUNCTION implement_sop_changes();

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sop_submissions_updated_at
    BEFORE UPDATE ON sop_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_department_notifications_updated_at
    BEFORE UPDATE ON department_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sop_departments_updated_at
    BEFORE UPDATE ON sop_departments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sop_roles_updated_at
    BEFORE UPDATE ON sop_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
