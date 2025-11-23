import type { JobDescription } from '../types';

interface TemplateInput {
  role: JobDescription['role'];
  department: JobDescription['department'];
  focus?: string;
}

interface TemplateResult {
  overview: string;
  mission: string;
  successMetrics: string[];
  keyTools: string[];
  sopSections: JobDescription['sopSections'];
  automationIdeas: string[];
}

const ROLE_TONES: Record<JobDescription['role'], string> = {
  Admin: 'strategic and cross-functional',
  Manager: 'coaching and execution-focused',
  Staff: 'hands-on and operations-minded',
};

const DEPARTMENT_TOOLS: Record<JobDescription['department'], string[]> = {
  Purchasing: ['PO Tracking', 'Requisition Queue', 'Vendor CRM'],
  Operations: ['Dashboard', 'Build Planner', 'Alert Center'],
  'MFG 1': ['Production Schedule', 'Inventory by Component', 'Quality Logs'],
  'MFG 2': ['Production Schedule', 'Inventory by Component', 'Quality Logs'],
  Fulfillment: ['Inventory Browse', 'Pick/Pack Sheets', 'Shipping Integrations'],
  'SHP/RCV': ['Receiving Log', 'Label Scanner', 'Exception Tracker'],
};

const BASE_AUTOMATIONS = [
  'Auto-generate daily summary prompts for standups',
  'Trigger AI recaps when a SOP run completes',
  'Feed outcomes into quarterly department review decks',
];

export async function generateJobTemplate(input: TemplateInput): Promise<TemplateResult> {
  const tone = ROLE_TONES[input.role] || 'operations-focused';
  const tools = DEPARTMENT_TOOLS[input.department] || ['Dashboard', 'Inventory'];
  const focus = input.focus ? ` Special focus: ${input.focus}.` : '';

  return Promise.resolve({
    overview: `Own the ${input.department} workflow with a ${tone} lens.${focus}`,
    mission: `Ensure ${input.department} hits daily commitments while keeping signals flowing to adjacent teams.`,
    successMetrics: [
      'SLA adherence on critical requests',
      'Accuracy of logged data and SOP completion',
      'Proactive escalations before blockers occur',
    ],
    keyTools: tools,
    sopSections: [
      {
        title: 'Morning Systems Check',
        trigger: 'Start of shift or before handoff',
        owner: `${input.department} ${input.role}`,
        steps: [
          'Review dashboard widgets for blockers',
          'Clear or acknowledge overnight alerts',
          'Post quick update in #ops-daily thread',
        ],
      },
      {
        title: 'Exception Escalation',
        trigger: 'When SLA slips or material risk emerges',
        owner: `${input.department} ${input.role}`,
        steps: [
          'Capture details in Exception Tracker',
          'Loop in owner + Ops lead with context',
          'Update status until resolution is confirmed',
        ],
      },
    ],
    automationIdeas: BASE_AUTOMATIONS,
  });
}
