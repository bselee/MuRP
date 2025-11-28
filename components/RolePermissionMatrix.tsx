import React, { useEffect, useState } from 'react';
import { ShieldCheckIcon, UsersIcon, ClipboardDocumentListIcon, CogIcon, CheckCircleIcon, ExclamationTriangleIcon } from './icons';
import type { User } from '../types';

type RoleKey = User['role'];

type Capability = {
  key: string;
  label: string;
  description: string;
  roles: RoleKey[];
};

const CAPABILITIES: Capability[] = [
  {
    key: 'settings',
    label: 'Settings & Integrations',
    description: 'Billing, AI providers, email policy, security toggles',
    roles: ['Admin', 'Manager'],
  },
  {
    key: 'purchase-orders',
    label: 'Purchase Orders',
    description: 'Create, edit, and approve PO workflows',
    roles: ['Admin', 'Manager'],
  },
  {
    key: 'requisitions',
    label: 'Requisition Approvals',
    description: 'Approve internal requisitions and ops escalations',
    roles: ['Admin', 'Manager'],
  },
  {
    key: 'boms',
    label: 'BOM & Artwork Editing',
    description: 'Edit BOM details, approve artwork, push revisions',
    roles: ['Admin'],
  },
  {
    key: 'inventory',
    label: 'Inventory Visibility',
    description: 'View inventory, vendors, dashboards',
    roles: ['Admin', 'Manager', 'Staff'],
  },
  {
    key: 'ai-tools',
    label: 'AI & Automations',
    description: 'Trigger AI copilots, Quick Tickets, escalations',
    roles: ['Admin', 'Manager'],
  },
  {
    key: 'reporting',
    label: 'Compliance & Reporting',
    description: 'Access regulatory panel, job descriptions, audit exports',
    roles: ['Admin'],
  },
];

const ROLE_SUMMARY: Record<RoleKey, { tagline: string; description: string; focus: string[] }> = {
  Admin: {
    tagline: 'Full workspace control',
    description: 'Complete access to every module, approval chain, and automation. Best for plant owners or system administrators.',
    focus: ['Global approvals', 'Security + billing', 'Workflow design'],
  },
  Manager: {
    tagline: 'Department leadership',
    description: 'Can manage purchasing + operations within their area, approve requisitions, and tune integrations without touching billing.',
    focus: ['Department approvals', 'Task routing', 'Vendor collaboration'],
  },
  Staff: {
    tagline: 'Execution + visibility',
    description: 'Submit requisitions, view inventory/BOMs, and collaborate via tasks without affecting controls.',
    focus: ['Request intake', 'Status tracking', 'Collaboration'],
  },
};

const REVIEW_KEY = 'murp::roleMatrixAcknowledged';

const RolePermissionMatrix: React.FC = () => {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(REVIEW_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (acknowledged) {
      window.localStorage.setItem(REVIEW_KEY, '1');
    } else {
      window.localStorage.removeItem(REVIEW_KEY);
    }
  }, [acknowledged]);

  const toggleAcknowledged = () => setAcknowledged(prev => !prev);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="h-5 w-5 text-indigo-400" />
          <div>
            <p className="text-sm text-gray-300">
              Every workspace starts with Admin, Manager, and Staff roles. Use this grid to confirm what each role can currently
              do before inviting new teammates or changing delegation rules.
            </p>
            <label className="mt-3 inline-flex cursor-pointer select-none items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-400"
                checked={acknowledged}
                onChange={toggleAcknowledged}
              />
              I reviewed the role matrix before making changes.
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(['Admin', 'Manager', 'Staff'] as RoleKey[]).map(role => (
          <div key={role} className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
            <div className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-indigo-400" />
              <p className="text-xs uppercase text-indigo-300">{role}</p>
            </div>
            <p className="mt-2 text-base font-semibold text-white">{ROLE_SUMMARY[role].tagline}</p>
            <p className="mt-1 text-sm text-gray-400">{ROLE_SUMMARY[role].description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ROLE_SUMMARY[role].focus.map(item => (
                <span key={item} className="rounded-full border border-indigo-500/30 px-3 py-0.5 text-xs text-indigo-200">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/70">
        <table className="min-w-full divide-y divide-gray-800">
          <thead>
            <tr className="bg-gray-900/40 text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3 text-left">Capability</th>
              {(['Admin', 'Manager', 'Staff'] as RoleKey[]).map(role => (
                <th key={role} className="px-4 py-3 text-center">{role}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-sm">
            {CAPABILITIES.map(cap => (
              <tr key={cap.key} className="hover:bg-gray-800/40">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{cap.label}</p>
                  <p className="text-xs text-gray-500">{cap.description}</p>
                </td>
                {(['Admin', 'Manager', 'Staff'] as RoleKey[]).map(role => {
                  const enabled = cap.roles.includes(role);
                  return (
                    <td key={role} className="px-4 py-3 text-center">
                      {enabled ? (
                        <CheckCircleIcon className="mx-auto h-5 w-5 text-emerald-400" />
                      ) : (
                        <ExclamationTriangleIcon className="mx-auto h-5 w-5 text-gray-600" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 text-sm text-gray-400">
        <div className="flex items-start gap-3">
          <ClipboardDocumentListIcon className="h-5 w-5 text-indigo-400" />
          <div>
            <p className="font-medium text-white">Change Control Reminder</p>
            <p className="mt-1">
              Before modifying delegation rules or inviting a new user, capture a quick confirmation in your change log (who reviewed,
              which role adjustments were approved, and when they take effect). This keeps audits clean and prevents accidental privilege drift.
            </p>
            <p className="mt-2 flex items-center gap-2 text-xs">
              <CogIcon className="h-4 w-4 text-indigo-300" />
              Need custom roles? Contact support to enable advanced role templating.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RolePermissionMatrix;
