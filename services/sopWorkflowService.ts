import { supabase } from '../lib/supabase/client';

export interface SOPSubmission {
  id: string;
  sop_id: string;
  submitted_by: string;
  submission_type: 'create' | 'update' | 'deprecate';
  title: string;
  description?: string;
  content?: string;
  department_id?: string;
  role_id?: string;
  affected_departments: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'implemented';
  submitted_at: string;
  updated_at: string;
}

export interface SOPApproval {
  id: string;
  submission_id: string;
  approver_id: string;
  department_id?: string;
  approval_level: 'department_lead' | 'compliance_officer' | 'executive' | 'interdepartmental';
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  comments?: string;
  approved_at?: string;
}

export interface SOPReview {
  id: string;
  submission_id: string;
  reviewer_id: string;
  review_type: 'technical' | 'compliance' | 'operational' | 'interdepartmental';
  status: 'pending' | 'completed' | 'requires_changes';
  comments?: string;
  suggested_changes: Record<string, any>;
  reviewed_at?: string;
}

export interface DepartmentNotification {
  id: string;
  sop_id?: string;
  submission_id?: string;
  notifying_department: string;
  affected_department: string;
  notification_type: 'impact_assessment' | 'review_request' | 'implementation_notice' | 'change_alert';
  message: string;
  requires_response: boolean;
  response_deadline?: string;
  response_status: 'pending' | 'acknowledged' | 'concerns_raised' | 'approved' | 'blocked';
  response_comments?: string;
  responded_by?: string;
  responded_at?: string;
}

class SOPWorkflowService {
  // SOP Submissions
  async createSubmission(submission: Omit<SOPSubmission, 'id' | 'submitted_at' | 'updated_at' | 'status'>) {
    const { data, error } = await supabase
      .from('sop_submissions')
      .insert({
        ...submission,
        status: 'draft'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateSubmission(id: string, updates: Partial<SOPSubmission>) {
    const { data, error } = await supabase
      .from('sop_submissions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async submitForReview(id: string) {
    const { data, error } = await supabase
      .from('sop_submissions')
      .update({
        status: 'submitted',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getSubmissions(filters?: {
    status?: string;
    department_id?: string;
    submitted_by?: string;
  }) {
    let query = supabase
      .from('sop_submissions')
      .select(`
        *,
        submitted_by_user:auth.users!submitted_by(id, email, raw_user_meta_data),
        department:sop_departments(id, name),
        role:sop_roles(id, name)
      `)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters?.submitted_by) {
      query = query.eq('submitted_by', filters.submitted_by);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getSubmissionById(id: string) {
    const { data, error } = await supabase
      .from('sop_submissions')
      .select(`
        *,
        submitted_by_user:auth.users!submitted_by(id, email, raw_user_meta_data),
        department:sop_departments(id, name),
        role:sop_roles(id, name),
        approvals:sop_approvals(*, approver:auth.users(id, email, raw_user_meta_data)),
        reviews:sop_reviews(*, reviewer:auth.users(id, email, raw_user_meta_data))
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // SOP Approvals
  async createApproval(approval: Omit<SOPApproval, 'id' | 'approved_at'>) {
    const { data, error } = await supabase
      .from('sop_approvals')
      .insert(approval)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateApproval(id: string, updates: Partial<SOPApproval>) {
    const updateData: any = { ...updates };
    if (updates.status === 'approved' || updates.status === 'rejected') {
      updateData.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('sop_approvals')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getApprovalsForSubmission(submissionId: string) {
    const { data, error } = await supabase
      .from('sop_approvals')
      .select(`
        *,
        approver:auth.users(id, email, raw_user_meta_data),
        department:sop_departments(id, name)
      `)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  // SOP Reviews
  async createReview(review: Omit<SOPReview, 'id' | 'reviewed_at'>) {
    const { data, error } = await supabase
      .from('sop_reviews')
      .insert(review)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateReview(id: string, updates: Partial<SOPReview>) {
    const updateData: any = { ...updates };
    if (updates.status === 'completed' || updates.status === 'requires_changes') {
      updateData.reviewed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('sop_reviews')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getReviewsForSubmission(submissionId: string) {
    const { data, error } = await supabase
      .from('sop_reviews')
      .select(`
        *,
        reviewer:auth.users(id, email, raw_user_meta_data)
      `)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  // Department Notifications
  async getNotificationsForUser(userId: string) {
    // Get user's departments
    const { data: userDepts, error: deptError } = await supabase
      .from('user_department_roles')
      .select('department_id')
      .eq('user_id', userId);

    if (deptError) throw deptError;

    const departmentIds = userDepts?.map(d => d.department_id) || [];

    const { data, error } = await supabase
      .from('department_notifications')
      .select(`
        *,
        notifying_department_info:sop_departments!notifying_department(id, name),
        affected_department_info:sop_departments!affected_department(id, name),
        sop:sop_repository(id, title),
        submission:sop_submissions(id, title, status)
      `)
      .or(`affected_department.in.(${departmentIds.join(',')}),notifying_department.in.(${departmentIds.join(',')})`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async respondToNotification(id: string, response: {
    response_status: DepartmentNotification['response_status'];
    response_comments?: string;
  }) {
    const { data, error } = await supabase
      .from('department_notifications')
      .update({
        ...response,
        responded_by: (await supabase.auth.getUser()).data.user?.id,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Workflow helpers
  async canUserApprove(userId: string, submissionId: string): Promise<boolean> {
    // Check if user is assigned as an approver for this submission
    const { data, error } = await supabase
      .from('sop_approvals')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('approver_id', userId)
      .eq('status', 'pending')
      .single();

    return !error && !!data;
  }

  async canUserReview(userId: string, submissionId: string): Promise<boolean> {
    // Check if user is assigned as a reviewer or has department access
    const { data: reviewData, error: reviewError } = await supabase
      .from('sop_reviews')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('reviewer_id', userId)
      .eq('status', 'pending')
      .single();

    if (!reviewError && reviewData) return true;

    // Check department access
    const { data: submission, error: subError } = await supabase
      .from('sop_submissions')
      .select('department_id')
      .eq('id', submissionId)
      .single();

    if (subError) return false;

    const { data: userDept, error: deptError } = await supabase
      .from('user_department_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('department_id', submission.department_id)
      .single();

    return !deptError && !!userDept;
  }

  async getWorkflowStats() {
    const { data, error } = await supabase
      .from('sop_submissions')
      .select('status')
      .then(result => {
        if (result.error) throw result.error;
        return result.data;
      });

    if (error) throw error;

    const stats = {
      draft: 0,
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      implemented: 0
    };

    data?.forEach(submission => {
      stats[submission.status as keyof typeof stats]++;
    });

    return stats;
  }
}

export const sopWorkflowService = new SOPWorkflowService();