/**
 * DelegationSettingsPanel - Configure role-based task delegation permissions
 * 
 * Allows admins to configure:
 * - Who can create each type of task
 * - Who can assign tasks
 * - Who can be assigned tasks
 * - Approval chains
 * - Escalation rules
 */

import React, { useState, useCallback, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { DelegationSetting, User, DelegationTaskType } from '../types';
import { 
  ShieldCheckIcon, 
  UsersIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from './icons';

interface DelegationSettingsPanelProps {
  settings: DelegationSetting[];
  onUpdate: (taskType: string, updates: Partial<DelegationSetting>) => Promise<boolean>;
  loading?: boolean;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const TASK_TYPE_INFO: Record<DelegationTaskType, { label: string; description: string; icon: string }> = {
  question: {
    label: 'Questions',
    description: 'Staff asking questions to managers/admins',
    icon: '❓',
  },
  maintenance: {
    label: 'Maintenance Tasks',
    description: 'Equipment and facility maintenance work',
    icon: '🔧',
  },
  build_order: {
    label: 'Build Orders',
    description: 'Production build assignments',
    icon: '🏭',
  },
  bom_revision_approval: {
    label: 'BOM Revision Approvals',
    description: 'Bill of Materials change approvals',
    icon: '📋',
  },
  artwork_approval: {
    label: 'Artwork Approvals',
    description: 'Label and artwork approval workflow',
    icon: '🎨',
  },
  po_approval: {
    label: 'PO Approvals',
    description: 'Purchase Order approvals',
    icon: '📦',
  },
  requisition_approval: {
    label: 'Requisition Approvals',
    description: 'Internal requisition approvals',
    icon: '📝',
  },
  general_task: {
    label: 'General Tasks',
    description: 'Standard work items',
    icon: '✅',
  },
  follow_up: {
    label: 'Follow Ups',
    description: 'Reminder and follow-up tasks',
    icon: '🔔',
  },
};

const ALL_ROLES: User['role'][] = ['Admin', 'Manager', 'Staff'];
const ALL_DEPARTMENTS: User['department'][] = ['Purchasing', 'Operations', 'MFG 1', 'MFG 2', 'Fulfillment', 'SHP/RCV'];

const DelegationSettingsPanel: React.FC<DelegationSettingsPanelProps> = ({
  settings,
  onUpdate,
  loading,
  addToast,
}) => {
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<Record<string, Partial<DelegationSetting>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Initialize local settings from props
  useEffect(() => {
    const initial: Record<string, Partial<DelegationSetting>> = {};
    settings.forEach(s => {
      initial[s.taskType] = { ...s };
    });
    setLocalSettings(initial);
  }, [settings]);

  const handleRoleToggle = useCallback((taskType: string, field: 'canCreateRoles' | 'canAssignRoles' | 'assignableToRoles', role: User['role']) => {
    setLocalSettings(prev => {
      const current = prev[taskType] || {};
      const currentRoles = (current[field] as User['role'][]) || [];
      const newRoles = currentRoles.includes(role)
        ? currentRoles.filter(r => r !== role)
        : [...currentRoles, role];
      return {
        ...prev,
        [taskType]: { ...current, [field]: newRoles },
      };
    });
  }, []);

  const handleToggle = useCallback((taskType: string, field: 'requiresApproval' | 'notifyOnCreate' | 'notifyOnAssign' | 'notifyOnComplete') => {
    setLocalSettings(prev => {
      const current = prev[taskType] || {};
      return {
        ...prev,
        [taskType]: { ...current, [field]: !current[field] },
      };
    });
  }, []);

  const handleSave = useCallback(async (taskType: string) => {
    const updates = localSettings[taskType];
    if (!updates) return;

    setSaving(taskType);
    try {
      const success = await onUpdate(taskType, updates);
      if (success) {
        addToast(`${TASK_TYPE_INFO[taskType as DelegationTaskType]?.label || taskType} settings saved.`, 'success');
      } else {
        addToast('Failed to save settings.', 'error');
      }
    } catch (error) {
      addToast('Error saving settings.', 'error');
    } finally {
      setSaving(null);
    }
  }, [localSettings, onUpdate, addToast]);

  const toggleExpanded = useCallback((taskType: string) => {
    setExpandedType(prev => prev === taskType ? null : taskType);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <ShieldCheckIcon className="w-5 h-5 text-indigo-400" />
          Task Delegation Rules
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Configure who can create, assign, and be assigned different types of tasks. 
          These settings enable staff to ask questions upward while controlling delegation of specific responsibilities.
        </p>
      </div>

      {Object.entries(TASK_TYPE_INFO).map(([taskType, info]) => {
        const setting = localSettings[taskType] || settings.find(s => s.taskType === taskType) || {};
        const isExpanded = expandedType === taskType;
        const isSaving = saving === taskType;

        return (
          <div
            key={taskType}
            className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => toggleExpanded(taskType)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{info.icon}</span>
                <div className="text-left">
                  <h4 className="text-sm font-medium text-white">{info.label}</h4>
                  <p className="text-xs text-gray-500">{info.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {setting.requiresApproval && (
                  <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full">
                    Requires Approval
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                )}
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="p-4 pt-0 border-t border-gray-800 space-y-6">
                {/* Role Permissions Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Who Can Create */}
                  <div className="bg-gray-800/40 rounded-lg p-4">
                    <h5 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-1">
                      <UsersIcon className="w-3.5 h-3.5" />
                      Can Create
                    </h5>
                    <div className="space-y-2">
                      {ALL_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(setting.canCreateRoles as User['role'][])?.includes(role) || false}
                            onChange={() => handleRoleToggle(taskType, 'canCreateRoles', role)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-300">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Who Can Assign */}
                  <div className="bg-gray-800/40 rounded-lg p-4">
                    <h5 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-1">
                      <UsersIcon className="w-3.5 h-3.5" />
                      Can Assign
                    </h5>
                    <div className="space-y-2">
                      {ALL_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(setting.canAssignRoles as User['role'][])?.includes(role) || false}
                            onChange={() => handleRoleToggle(taskType, 'canAssignRoles', role)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-300">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Assignable To */}
                  <div className="bg-gray-800/40 rounded-lg p-4">
                    <h5 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-1">
                      <UsersIcon className="w-3.5 h-3.5" />
                      Assignable To
                    </h5>
                    <div className="space-y-2">
                      {ALL_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(setting.assignableToRoles as User['role'][])?.includes(role) || false}
                            onChange={() => handleRoleToggle(taskType, 'assignableToRoles', role)}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-300">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Workflow Options */}
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setting.requiresApproval || false}
                      onChange={() => handleToggle(taskType, 'requiresApproval')}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-sm text-gray-300">Requires Approval</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setting.notifyOnCreate || false}
                      onChange={() => handleToggle(taskType, 'notifyOnCreate')}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-300">Notify on Create</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setting.notifyOnAssign || false}
                      onChange={() => handleToggle(taskType, 'notifyOnAssign')}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-300">Notify on Assign</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setting.notifyOnComplete || false}
                      onChange={() => handleToggle(taskType, 'notifyOnComplete')}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-300">Notify on Complete</span>
                  </label>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => handleSave(taskType)}
                    disabled={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DelegationSettingsPanel;
