/**
 * Project Management & Ticketing Hooks
 * 
 * Real-time data hooks for projects, tickets, comments, and activity
 * Follows existing useSupabaseData patterns with postgres_changes subscriptions
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Project,
  Ticket,
  TicketComment,
  TicketActivity,
  DelegationSetting,
  CreateTicketInput,
  UpdateTicketInput,
  CreateProjectInput,
  TicketStatus,
  User,
  mockProjects,
  mockTickets,
} from '../types';
import { isE2ETesting } from '../lib/auth/guards';
import { createNotificationWithPrefs, type TicketNotificationData } from '../services/notificationService';

// ============================================================================
// TYPES
// ============================================================================

interface UseDataResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseSingleResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface MutationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// PROJECTS HOOK
// ============================================================================

export function useProjects(): UseDataResult<Project> {
  const [data, setData] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchProjects = useCallback(async () => {
    if (isE2ETesting()) {
      const { mockProjects } = await import('../types');
      setData(mockProjects);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: projects, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const transformed = (projects || []).map(transformProjectFromDb);
      setData(transformed);
      setError(null);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isE2ETesting()) {
      import('../types').then(({ mockProjects }) => {
        setData(mockProjects);
        setLoading(false);
      });
      return;
    }

    fetchProjects();

    const newChannel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    setChannel(newChannel);

    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchProjects]);

  return { data, loading, error, refetch: fetchProjects };
}

// ============================================================================
// TICKETS HOOK
// ============================================================================

export function useTickets(projectId?: string): UseDataResult<Ticket> {
  const [data, setData] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchTickets = useCallback(async () => {
    if (isE2ETesting()) {
      const { mockTickets } = await import('../types');
      const filtered = projectId 
        ? mockTickets.filter(t => t.projectId === projectId)
        : mockTickets;
      setData(filtered);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let query = supabase
        .from('tickets')
        .select(`
          *,
          reporter:user_profiles!tickets_reporter_id_fkey(id, name, email, role, department),
          assignee:user_profiles!tickets_assignee_id_fkey(id, name, email, role, department),
          directed_to:user_profiles!tickets_directed_to_id_fkey(id, name, email, role, department)
        `)
        .order('board_position', { ascending: true })
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: tickets, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const transformed = (tickets || []).map(transformTicketFromDb);
      setData(transformed);
      setError(null);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isE2ETesting()) {
      import('../types').then(({ mockTickets }) => {
        const filtered = projectId 
          ? mockTickets.filter(t => t.projectId === projectId)
          : mockTickets;
        setData(filtered);
        setLoading(false);
      });
      return;
    }

    fetchTickets();

    const channelName = projectId ? `tickets-${projectId}` : 'tickets-all';
    const newChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        fetchTickets();
      })
      .subscribe();

    setChannel(newChannel);

    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
    };
  }, [fetchTickets, projectId]);

  return { data, loading, error, refetch: fetchTickets };
}

// ============================================================================
// MY TICKETS HOOK (tickets assigned to or directed to current user)
// ============================================================================

export function useMyTickets(userId?: string): UseDataResult<Ticket> {
  const [data, setData] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMyTickets = useCallback(async () => {
    if (!userId || isE2ETesting()) {
      const { mockTickets } = await import('../types');
      setData(mockTickets.slice(0, 2));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: tickets, error: fetchError } = await supabase
        .from('tickets')
        .select(`
          *,
          reporter:user_profiles!tickets_reporter_id_fkey(id, name, email, role, department),
          assignee:user_profiles!tickets_assignee_id_fkey(id, name, email, role, department),
          project:projects(id, name, code)
        `)
        .or(`assignee_id.eq.${userId},reporter_id.eq.${userId},directed_to_id.eq.${userId}`)
        .not('status', 'in', '("done","closed","cancelled")')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const transformed = (tickets || []).map(transformTicketFromDb);
      setData(transformed);
      setError(null);
    } catch (err) {
      console.error('Error fetching my tickets:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMyTickets();

    if (!userId || isE2ETesting()) return;

    const channel = supabase
      .channel(`my-tickets-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        fetchMyTickets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMyTickets, userId]);

  return { data, loading, error, refetch: fetchMyTickets };
}

// ============================================================================
// TICKET COMMENTS HOOK
// ============================================================================

export function useTicketComments(ticketId: string): UseDataResult<TicketComment> {
  const [data, setData] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchComments = useCallback(async () => {
    if (!ticketId || isE2ETesting()) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: comments, error: fetchError } = await supabase
        .from('ticket_comments')
        .select(`
          *,
          author:user_profiles!ticket_comments_author_id_fkey(id, name, email, role)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      const transformed = (comments || []).map(transformCommentFromDb);
      setData(transformed);
      setError(null);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchComments();

    if (!ticketId || isE2ETesting()) return;

    const channel = supabase
      .channel(`comments-${ticketId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` }, () => {
        fetchComments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchComments, ticketId]);

  return { data, loading, error, refetch: fetchComments };
}

// ============================================================================
// TICKET ACTIVITY HOOK
// ============================================================================

export function useTicketActivity(ticketId: string): UseDataResult<TicketActivity> {
  const [data, setData] = useState<TicketActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!ticketId || isE2ETesting()) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: activity, error: fetchError } = await supabase
        .from('ticket_activity')
        .select(`
          *,
          actor:user_profiles!ticket_activity_actor_id_fkey(id, name, email, role)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const transformed = (activity || []).map(transformActivityFromDb);
      setData(transformed);
      setError(null);
    } catch (err) {
      console.error('Error fetching activity:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return { data, loading, error, refetch: fetchActivity };
}

// ============================================================================
// DELEGATION SETTINGS HOOK
// ============================================================================

export function useDelegationSettings(): UseDataResult<DelegationSetting> {
  const [data, setData] = useState<DelegationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    if (isE2ETesting()) {
      setData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: settings, error: fetchError } = await supabase
        .from('delegation_settings')
        .select('*')
        .order('task_type', { ascending: true });

      if (fetchError) throw fetchError;

      const transformed = (settings || []).map(transformDelegationSettingFromDb);
      setData(transformed);
      setError(null);
    } catch (err) {
      console.error('Error fetching delegation settings:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { data, loading, error, refetch: fetchSettings };
}

// ============================================================================
// MUTATIONS
// ============================================================================

// Helper function to get user profile
async function getUserProfile(userId: string): Promise<{ id: string; name: string; email: string } | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, name, email')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data;
}

export async function createProject(input: CreateProjectInput): Promise<MutationResult<Project>> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: input.name,
        description: input.description,
        code: input.code,
        project_type: input.projectType || 'general',
        department: input.department,
        default_assignee_id: input.defaultAssigneeId ?? input.delegateId,
        owner_id: input.ownerId,
        delegate_id: input.delegateId,
        start_date: input.startDate,
        target_end_date: input.targetEndDate,
        tags: input.tags,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: transformProjectFromDb(data) };
  } catch (err) {
    console.error('Error creating project:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function createTicket(input: CreateTicketInput, reporterId: string): Promise<MutationResult<Ticket>> {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .insert({
        project_id: input.projectId,
        title: input.title,
        description: input.description,
        ticket_type: input.ticketType || 'task',
        priority: input.priority || 'medium',
        reporter_id: reporterId,
        assignee_id: input.assigneeId,
        directed_to_id: input.directedToId,
        directed_to_role: input.directedToRole,
        department: input.department,
        due_date: input.dueDate,
        estimated_hours: input.estimatedHours,
        parent_ticket_id: input.parentTicketId,
        related_entity_type: input.relatedEntityType,
        related_entity_id: input.relatedEntityId,
        tags: input.tags,
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('ticket_activity').insert({
      ticket_id: data.id,
      actor_id: reporterId,
      action: 'created',
    });

    // Send notifications
    const reporter = await getUserProfile(reporterId);
    const notificationData: TicketNotificationData = {
      ticketId: data.id,
      ticketNumber: data.ticket_number,
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: data.status,
      reporterName: reporter?.name || 'Unknown',
      assigneeName: data.assignee ? data.assignee.name : undefined,
      directedToName: data.directed_to ? data.directed_to.name : undefined,
      projectName: data.project ? data.project.name : undefined,
      dueDate: data.due_date,
      action: 'created',
      actorName: reporter?.name || 'Unknown',
    };

    // Send notification asynchronously (don't block ticket creation)
    createNotificationWithPrefs(notificationData).catch(error => {
      console.error('Failed to send ticket creation notification:', error);
    });

    return { success: true, data: transformTicketFromDb(data) };
  } catch (err) {
    console.error('Error creating ticket:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function updateTicket(
  ticketId: string,
  input: UpdateTicketInput,
  actorId: string
): Promise<MutationResult<Ticket>> {
  try {
    // Get current ticket for activity logging
    const { data: currentTicket } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    const updates: Record<string, unknown> = {};
    const activityLogs: Array<{ action: string; field_name?: string; old_value?: unknown; new_value?: unknown }> = [];

    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    
    if (input.status !== undefined && input.status !== currentTicket?.status) {
      updates.status = input.status;
      activityLogs.push({
        action: 'status_changed',
        field_name: 'status',
        old_value: currentTicket?.status,
        new_value: input.status,
      });
      
      if (input.status === 'in_progress' && !currentTicket?.started_at) {
        updates.started_at = new Date().toISOString();
      }
      if (input.status === 'done' || input.status === 'closed') {
        updates.completed_at = new Date().toISOString();
      }
    }

    if (input.priority !== undefined && input.priority !== currentTicket?.priority) {
      updates.priority = input.priority;
      activityLogs.push({
        action: 'priority_changed',
        field_name: 'priority',
        old_value: currentTicket?.priority,
        new_value: input.priority,
      });
    }

    if (input.assigneeId !== undefined && input.assigneeId !== currentTicket?.assignee_id) {
      updates.assignee_id = input.assigneeId;
      activityLogs.push({
        action: input.assigneeId ? 'assigned' : 'unassigned',
        field_name: 'assignee_id',
        old_value: currentTicket?.assignee_id,
        new_value: input.assigneeId,
      });
    }

    if (input.dueDate !== undefined && input.dueDate !== currentTicket?.due_date) {
      updates.due_date = input.dueDate;
      activityLogs.push({
        action: 'due_date_changed',
        field_name: 'due_date',
        old_value: currentTicket?.due_date,
        new_value: input.dueDate,
      });
    }

    if (input.boardColumn !== undefined) updates.board_column = input.boardColumn;
    if (input.boardPosition !== undefined) updates.board_position = input.boardPosition;
    if (input.tags !== undefined) updates.tags = input.tags;
    if (input.estimatedHours !== undefined) updates.estimated_hours = input.estimatedHours;
    if (input.actualHours !== undefined) updates.actual_hours = input.actualHours;

    const { data, error } = await supabase
      .from('tickets')
      .update(updates)
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;

    // Log activities
    for (const log of activityLogs) {
      await supabase.from('ticket_activity').insert({
        ticket_id: ticketId,
        actor_id: actorId,
        ...log,
      });
    }

    // Send notifications for significant changes
    const updatedTicket = transformTicketFromDb(data);
    const actor = await getUserProfile(actorId);

    // Notify on assignment
    if (input.assigneeId !== undefined && input.assigneeId !== currentTicket?.assignee_id) {
      const notificationData: TicketNotificationData = {
        ticketId: ticketId,
        ticketNumber: updatedTicket.ticketNumber,
        title: updatedTicket.title,
        description: updatedTicket.description,
        priority: updatedTicket.priority,
        status: updatedTicket.status,
        reporterName: updatedTicket.reporter?.name || 'Unknown',
        assigneeName: updatedTicket.assignee?.name,
        directedToName: updatedTicket.directedTo?.name,
        projectName: updatedTicket.project?.name,
        dueDate: updatedTicket.dueDate,
        action: 'assigned',
        actorName: actor?.name || 'Unknown',
        oldValue: currentTicket?.assignee?.name,
        newValue: updatedTicket.assignee?.name,
      };

      createNotificationWithPrefs(notificationData, input.assigneeId ? [input.assigneeId] : undefined)
        .catch(error => console.error('Failed to send assignment notification:', error));
    }

    // Notify on status change
    if (input.status !== undefined && input.status !== currentTicket?.status) {
      const notificationData: TicketNotificationData = {
        ticketId: ticketId,
        ticketNumber: updatedTicket.ticketNumber,
        title: updatedTicket.title,
        description: updatedTicket.description,
        priority: updatedTicket.priority,
        status: updatedTicket.status,
        reporterName: updatedTicket.reporter?.name || 'Unknown',
        assigneeName: updatedTicket.assignee?.name,
        directedToName: updatedTicket.directedTo?.name,
        projectName: updatedTicket.project?.name,
        dueDate: updatedTicket.dueDate,
        action: 'status_changed',
        actorName: actor?.name || 'Unknown',
        oldValue: currentTicket?.status,
        newValue: input.status,
      };

      createNotificationWithPrefs(notificationData)
        .catch(error => console.error('Failed to send status change notification:', error));
    }

    return { success: true, data: updatedTicket };
  } catch (err) {
    console.error('Error updating ticket:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function addTicketComment(
  ticketId: string,
  content: string,
  authorId: string,
  commentType: TicketComment['commentType'] = 'comment'
): Promise<MutationResult<TicketComment>> {
  try {
    const { data, error } = await supabase
      .from('ticket_comments')
      .insert({
        ticket_id: ticketId,
        author_id: authorId,
        content,
        comment_type: commentType,
      })
      .select(`
        *,
        author:user_profiles!ticket_comments_author_id_fkey(id, name, email, role)
      `)
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('ticket_activity').insert({
      ticket_id: ticketId,
      actor_id: authorId,
      action: 'commented',
    });

    return { success: true, data: transformCommentFromDb(data) };
  } catch (err) {
    console.error('Error adding comment:', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function updateDelegationSetting(
  taskType: string,
  updates: Partial<DelegationSetting>
): Promise<MutationResult<DelegationSetting>> {
  try {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.canCreateRoles) dbUpdates.can_create_roles = updates.canCreateRoles;
    if (updates.canAssignRoles) dbUpdates.can_assign_roles = updates.canAssignRoles;
    if (updates.assignableToRoles) dbUpdates.assignable_to_roles = updates.assignableToRoles;
    if (updates.restrictedToDepartments !== undefined) dbUpdates.restricted_to_departments = updates.restrictedToDepartments;
    if (updates.requiresApproval !== undefined) dbUpdates.requires_approval = updates.requiresApproval;
    if (updates.approvalChain !== undefined) dbUpdates.approval_chain = updates.approvalChain;
    if (updates.autoEscalateHours !== undefined) dbUpdates.auto_escalate_hours = updates.autoEscalateHours;
    if (updates.escalationTargetRole !== undefined) dbUpdates.escalation_target_role = updates.escalationTargetRole;
    if (updates.notifyOnCreate !== undefined) dbUpdates.notify_on_create = updates.notifyOnCreate;
    if (updates.notifyOnAssign !== undefined) dbUpdates.notify_on_assign = updates.notifyOnAssign;
    if (updates.notifyOnComplete !== undefined) dbUpdates.notify_on_complete = updates.notifyOnComplete;

    const { data, error } = await supabase
      .from('delegation_settings')
      .update(dbUpdates)
      .eq('task_type', taskType)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: transformDelegationSettingFromDb(data) };
  } catch (err) {
    console.error('Error updating delegation setting:', err);
    return { success: false, error: (err as Error).message };
  }
}

// ============================================================================
// TRANSFORMERS (snake_case → camelCase)
// ============================================================================

function transformProjectFromDb(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    code: row.code,
    status: row.status,
    projectType: row.project_type,
    ownerId: row.owner_id,
    delegateId: row.delegate_id ?? row.owner_id,
    department: row.department,
    defaultAssigneeId: row.default_assignee_id,
    boardColumns: row.board_columns || ['open', 'in_progress', 'review', 'done'],
    startDate: row.start_date,
    targetEndDate: row.target_end_date,
    actualEndDate: row.actual_end_date,
    tags: row.tags,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformTicketFromDb(row: any): Ticket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    ticketType: row.ticket_type,
    priority: row.priority,
    reporterId: row.reporter_id,
    assigneeId: row.assignee_id,
    directedToId: row.directed_to_id,
    directedToRole: row.directed_to_role,
    department: row.department,
    dueDate: row.due_date,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    estimatedHours: row.estimated_hours,
    actualHours: row.actual_hours,
    parentTicketId: row.parent_ticket_id,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    tags: row.tags,
    boardColumn: row.board_column || 'open',
    boardPosition: row.board_position || 0,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reporter: row.reporter,
    assignee: row.assignee,
    directedTo: row.directed_to,
    project: row.project,
  };
}

function transformCommentFromDb(row: any): TicketComment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    content: row.content,
    commentType: row.comment_type,
    parentCommentId: row.parent_comment_id,
    mentionedUserIds: row.mentioned_user_ids,
    attachments: row.attachments,
    editedAt: row.edited_at,
    createdAt: row.created_at,
    author: row.author,
  };
}

function transformActivityFromDb(row: any): TicketActivity {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    actorId: row.actor_id,
    action: row.action,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    comment: row.comment,
    createdAt: row.created_at,
    actor: row.actor,
  };
}

function transformDelegationSettingFromDb(row: any): DelegationSetting {
  return {
    id: row.id,
    taskType: row.task_type,
    canCreateRoles: row.can_create_roles,
    canAssignRoles: row.can_assign_roles,
    assignableToRoles: row.assignable_to_roles,
    restrictedToDepartments: row.restricted_to_departments,
    requiresApproval: row.requires_approval,
    approvalChain: row.approval_chain,
    autoEscalateHours: row.auto_escalate_hours,
    escalationTargetRole: row.escalation_target_role,
    notifyOnCreate: row.notify_on_create,
    notifyOnAssign: row.notify_on_assign,
    notifyOnComplete: row.notify_on_complete,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}
