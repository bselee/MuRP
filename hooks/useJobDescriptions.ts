import { useCallback } from 'react';
import type { JobDescription, User } from '../types';
import usePersistentState from './usePersistentState';

const DEFAULT_JOB_DESCRIPTIONS: JobDescription[] = [
  {
    id: 'admin-purchasing',
    role: 'Admin',
    department: 'Purchasing',
    overview: 'Own vendor relationships, approvals, and automations for Purchasing.',
    mission: 'Keep purchasing signals flowing so production stays unblocked.',
    successMetrics: ['PO cycle time', 'Vendor response SLA', 'Tracking completeness'],
    keyTools: ['PO Tracking', 'Requisition Review', 'Vendor CRM'],
    sopSections: [
      {
        title: 'Requisition Review',
        trigger: 'New requisition enters Ops queue',
        owner: 'Purchasing Admin',
        steps: [
          'Validate request details and attachments',
          'Route to manager or auto-approve as defined',
          'Log decision + notify requester',
        ],
      },
    ],
    automationIdeas: ['Auto-remind vendors when tracking is missing', 'Draft escalations via AI templates'],
    status: 'approved',
    lastUpdatedBy: 'System',
    updatedAt: new Date().toISOString(),
    googleDocUrl: null,
  },
  {
    id: 'manager-operations',
    role: 'Manager',
    department: 'Operations',
    overview: 'Coordinate cross-team handoffs and keep the plant unblocked.',
    mission: 'Translate strategic goals into daily execution for Ops.',
    successMetrics: ['Unblocked build hours', 'Resolved alerts', 'Team check-ins'],
    keyTools: ['Dashboard', 'Alert Center', 'Build Planner'],
    sopSections: [
      {
        title: 'Daily Ops Huddle',
        trigger: 'Every morning at 9am',
        owner: 'Operations Manager',
        steps: [
          'Review alert center + priority list',
          'Call out blockers and assign owners',
          'Share quick wins + escalations in #ops-daily',
        ],
      },
    ],
    automationIdeas: ['Auto-summarize build status each afternoon'],
    status: 'approved',
    lastUpdatedBy: 'System',
    updatedAt: new Date().toISOString(),
    googleDocUrl: null,
  },
];

export const useJobDescriptions = () => {
  const [jobDescriptions, setJobDescriptions] = usePersistentState<JobDescription[]>(
    'jobDescriptions',
    DEFAULT_JOB_DESCRIPTIONS,
  );

  const upsertJobDescription = useCallback((entry: JobDescription) => {
    setJobDescriptions((prev) => {
      const idx = prev.findIndex((item) => item.id === entry.id);
      if (idx === -1) {
        return [...prev, entry];
      }
      const next = [...prev];
      next[idx] = entry;
      return next;
    });
  }, [setJobDescriptions]);

  const submitDraftUpdate = useCallback(
    (draft: JobDescription, actor: User, status: JobDescription['status'] = 'pending_review') => {
      const payload: JobDescription = {
        ...draft,
        status,
        lastUpdatedBy: actor.name,
        updatedAt: new Date().toISOString(),
      };
      upsertJobDescription(payload);
    },
    [upsertJobDescription],
  );

  const formatUpdatedAt = (job: JobDescription) =>
    job.updatedAt ? new Date(job.updatedAt).toLocaleString() : '—';

  return {
    jobDescriptions,
    upsertJobDescription,
    submitDraftUpdate,
    formatUpdatedAt,
  };
};
