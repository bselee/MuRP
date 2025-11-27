/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎫 TICKET ESCALATION CRON JOB
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Automatically escalates overdue tickets based on delegation settings
 * Runs every 15 minutes via cron trigger
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EscalationResult {
  ticketId: string;
  escalatedTo: string;
  escalationReason: string;
}

interface DelegationSetting {
  task_type: string;
  auto_escalate_hours: number;
  escalation_target_role: string;
  notify_on_create: boolean;
  notify_on_assign: boolean;
  notify_on_complete: boolean;
}

console.log('🎫 Ticket Escalation Function Started');

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 Checking for overdue tickets...');

    // Get delegation settings for tickets
    const { data: delegationSettings, error: delegationError } = await supabase
      .from('delegation_settings')
      .select('*')
      .eq('task_type', 'ticket')
      .single();

    if (delegationError || !delegationSettings) {
      console.log('⚠️ No delegation settings found for tickets');
      return new Response(JSON.stringify({ message: 'No delegation settings configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const settings: DelegationSetting = delegationSettings;
    const escalationHours = settings.auto_escalate_hours || 24; // Default 24 hours
    const escalationTargetRole = settings.escalation_target_role || 'manager';

    console.log(`⏰ Escalating tickets older than ${escalationHours} hours to ${escalationTargetRole}`);

    // Find overdue tickets that haven't been escalated yet
    const cutoffTime = new Date(Date.now() - escalationHours * 60 * 60 * 1000);

    const { data: overdueTickets, error: ticketsError } = await supabase
      .from('tickets')
      .select(`
        id,
        ticket_number,
        title,
        created_at,
        updated_at,
        status,
        priority,
        reporter_id,
        assignee_id,
        directed_to_id,
        directed_to_role,
        reporter:user_profiles!tickets_reporter_id_fkey(id, name, email, role),
        assignee:user_profiles!tickets_assignee_id_fkey(id, name, email, role),
        directed_to:user_profiles!tickets_directed_to_id_fkey(id, name, email, role)
      `)
      .in('status', ['open', 'in_progress', 'review'])
      .lt('created_at', cutoffTime.toISOString())
      .is('escalated_at', null); // Not already escalated

    if (ticketsError) {
      console.error('❌ Error fetching overdue tickets:', ticketsError);
      throw ticketsError;
    }

    if (!overdueTickets || overdueTickets.length === 0) {
      console.log('✅ No overdue tickets to escalate');
      return new Response(JSON.stringify({
        message: 'No overdue tickets found',
        checked: 0,
        escalated: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`📋 Found ${overdueTickets.length} overdue tickets to check`);

    const escalationResults: EscalationResult[] = [];

    // Process each overdue ticket
    for (const ticket of overdueTickets) {
      try {
        // Check if ticket should be escalated based on priority and current assignment
        const shouldEscalate = shouldEscalateTicket(ticket, escalationTargetRole);

        if (!shouldEscalate) {
          console.log(`⏭️ Skipping ticket ${ticket.ticket_number} - not eligible for escalation`);
          continue;
        }

        // Find escalation target user
        const escalationTarget = await findEscalationTarget(supabase, ticket, escalationTargetRole);

        if (!escalationTarget) {
          console.log(`⚠️ No escalation target found for ticket ${ticket.ticket_number}`);
          continue;
        }

        // Escalate the ticket
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            directed_to_id: escalationTarget.id,
            directed_to_role: escalationTargetRole,
            escalated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', ticket.id);

        if (updateError) {
          console.error(`❌ Error escalating ticket ${ticket.ticket_number}:`, updateError);
          continue;
        }

        // Log escalation activity
        await supabase.from('ticket_activity').insert({
          ticket_id: ticket.id,
          actor_id: escalationTarget.id, // System escalation
          action: 'escalated',
          comment: `Auto-escalated to ${escalationTargetRole} after ${escalationHours} hours`,
        });

        // Create escalation notification
        await supabase.from('notifications').insert({
          user_id: escalationTarget.id,
          type: 'ticket',
          severity: 'high',
          title: `Ticket Escalated: ${ticket.title}`,
          message: `Ticket ${ticket.ticket_number} has been auto-escalated due to overdue status (${escalationHours}h threshold)`,
          data: {
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            title: ticket.title,
            priority: ticket.priority,
            status: ticket.status,
            reporterName: ticket.reporter?.name || 'Unknown',
            action: 'escalated',
            actorName: 'System (Auto-escalation)',
          },
          channels: ['in_app', 'email'], // Always notify escalation targets
          read: false,
          created_at: new Date().toISOString()
        });

        escalationResults.push({
          ticketId: ticket.id,
          escalatedTo: escalationTarget.name,
          escalationReason: `Overdue after ${escalationHours} hours`
        });

        console.log(`✅ Escalated ticket ${ticket.ticket_number} to ${escalationTarget.name}`);

      } catch (error) {
        console.error(`❌ Error processing ticket ${ticket.ticket_number}:`, error);
      }
    }

    console.log(`🎯 Escalation complete: ${escalationResults.length} tickets escalated`);

    return new Response(JSON.stringify({
      message: `Escalated ${escalationResults.length} tickets`,
      checked: overdueTickets.length,
      escalated: escalationResults.length,
      results: escalationResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('💥 Ticket escalation function error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      message: 'Ticket escalation failed'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

/**
 * Determine if a ticket should be escalated
 */
function shouldEscalateTicket(ticket: any, escalationTargetRole: string): boolean {
  // Don't escalate if already directed to target role
  if (ticket.directed_to_role === escalationTargetRole) {
    return false;
  }

  // Always escalate critical/high priority tickets
  if (ticket.priority === 'urgent' || ticket.priority === 'high') {
    return true;
  }

  // Escalate medium priority if overdue by more than normal threshold
  if (ticket.priority === 'medium') {
    return true;
  }

  // Escalate low priority only if very overdue (this function handles the timing)
  return ticket.priority === 'low';
}

/**
 * Find the appropriate user to escalate to
 */
async function findEscalationTarget(
  supabase: any,
  ticket: any,
  targetRole: string
): Promise<{ id: string; name: string } | null> {
  // First, try to find users with the target role in the same department
  const ticketDepartment = ticket.reporter?.department || ticket.assignee?.department;

  let query = supabase
    .from('user_profiles')
    .select('id, name, email')
    .eq('role', targetRole)
    .neq('id', ticket.reporter_id); // Don't escalate back to reporter

  if (ticketDepartment) {
    query = query.eq('department', ticketDepartment);
  }

  const { data: departmentUsers, error: deptError } = await query.limit(5);

  if (!deptError && departmentUsers && departmentUsers.length > 0) {
    // Return the first available user (could implement round-robin later)
    return departmentUsers[0];
  }

  // Fallback: any user with the target role
  const { data: anyUsers, error: anyError } = await supabase
    .from('user_profiles')
    .select('id, name, email')
    .eq('role', targetRole)
    .neq('id', ticket.reporter_id)
    .limit(5);

  if (!anyError && anyUsers && anyUsers.length > 0) {
    return anyUsers[0];
  }

  return null;
}