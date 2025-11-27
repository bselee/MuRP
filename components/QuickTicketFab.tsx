/**
 * QuickTicketFab - Floating action button for rapid ticket creation
 * 
 * Features:
 * - Always visible in bottom-right corner
 * - Expands to compact form
 * - Quick assignment to roles (for questions)
 * - Priority selection
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { User, TicketType, TicketPriority, CreateTicketInput, Project } from '../types';
import { 
  PlusIcon, 
  XMarkIcon,
  QuestionMarkCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ChevronDownIcon,
} from './icons';

interface QuickTicketFabProps {
  currentUser?: User;
  users: User[];
  projects: Project[];
  onCreateTicket: (input: CreateTicketInput) => Promise<boolean>;
  defaultProjectId?: string;
}

const QUICK_TYPES: Array<{ value: TicketType; label: string; icon: React.ReactNode; color: string }> = [
  { value: 'question', label: 'Ask a Question', icon: <QuestionMarkCircleIcon className="w-4 h-4" />, color: 'text-purple-400' },
  { value: 'task', label: 'Create Task', icon: <CheckCircleIcon className="w-4 h-4" />, color: 'text-blue-400' },
  { value: 'follow_up', label: 'Follow Up', icon: <ClockIcon className="w-4 h-4" />, color: 'text-cyan-400' },
  { value: 'bug', label: 'Report Issue', icon: <ExclamationTriangleIcon className="w-4 h-4" />, color: 'text-red-400' },
];

const PRIORITY_OPTIONS: Array<{ value: TicketPriority; label: string; color: string }> = [
  { value: 'low', label: 'Low', color: 'bg-gray-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
];

const QuickTicketFab: React.FC<QuickTicketFabProps> = ({
  currentUser,
  users,
  projects,
  onCreateTicket,
  defaultProjectId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('task');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [directedToRole, setDirectedToRole] = useState<User['role']>('Manager');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>(defaultProjectId || '');

  // Filter users who can be assigned (managers/admins for questions, anyone for tasks)
  const assignableUsers = ticketType === 'question'
    ? users.filter(u => u.role === 'Admin' || u.role === 'Manager' || u.department === 'Operations')
    : users;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const input: CreateTicketInput = {
        title: title.trim(),
        ticketType,
        priority,
        projectId: projectId || undefined,
        department: currentUser?.department,
      };

      if (ticketType === 'question') {
        input.directedToRole = directedToRole;
      } else if (assigneeId) {
        input.assigneeId = assigneeId;
      }

      const success = await onCreateTicket(input);
      if (success) {
        setTitle('');
        setTicketType('task');
        setPriority('medium');
        setAssigneeId('');
        setIsOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [title, ticketType, priority, projectId, directedToRole, assigneeId, currentUser?.department, onCreateTicket]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return (
    <div ref={panelRef} className="fixed bottom-6 right-6 z-50">
      {/* Expanded Panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Quick Ticket</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-white/70 text-xs mt-1">
              {ticketType === 'question' ? 'Ask managers or admins' : 'Create a new task'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Type Selection */}
            <div className="flex gap-2">
              {QUICK_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setTicketType(type.value)}
                  className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                    ticketType === type.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  title={type.label}
                >
                  <span className={type.color}>{type.icon}</span>
                  <span className="text-[10px] text-gray-400">{type.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            {/* Title Input */}
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={ticketType === 'question' ? "What's your question?" : "What needs to be done?"}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            {/* Project Selection */}
            {projects.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 uppercase mb-1 block">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500"
                >
                  <option value="">No Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Conditional: Question → Role, Task → Assignee */}
            {ticketType === 'question' ? (
              <div>
                <label className="text-xs text-gray-500 uppercase mb-1 block">Direct to</label>
                <div className="flex gap-2">
                  {(['Manager', 'Admin', 'Operations'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setDirectedToRole(role as User['role'])}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        directedToRole === role
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-500 uppercase mb-1 block">Assign to (optional)</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {assignableUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Priority */}
            <div>
              <label className="text-xs text-gray-500 uppercase mb-1 block">Priority</label>
              <div className="flex gap-1">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all ${
                      priority === opt.value
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              {isSubmitting ? 'Creating...' : ticketType === 'question' ? 'Ask Question' : 'Create Ticket'}
            </Button>
          </form>
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={handleToggle}
        className={`
          w-14 h-14 rounded-full shadow-lg shadow-indigo-500/30 flex items-center justify-center
          transition-all duration-200 hover:scale-105
          ${isOpen 
            ? 'bg-gray-700 rotate-45' 
            : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500'
          }
        `}
        aria-label={isOpen ? 'Close quick ticket' : 'Create ticket'}
      >
        <PlusIcon className="w-6 h-6 text-white" />
      </button>
    </div>
  );
};

export default QuickTicketFab;
