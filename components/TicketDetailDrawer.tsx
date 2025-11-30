/**
 * TicketDetailDrawer - Slide-in panel for viewing/editing ticket details
 * 
 * Features:
 * - Full ticket details with edit capability
 * - Comment thread with real-time updates
 * - Activity timeline
 * - Status/priority quick updates
 */

import React, { useState, useCallback, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { 
  Ticket, 
  TicketComment, 
  TicketActivity, 
  User, 
  Project, 
  TicketStatus, 
  TicketPriority,
  UpdateTicketInput 
} from '../types';
import { 
  XMarkIcon,
  ClockIcon,
  UserIcon,
  FlagIcon,
  ChatBubbleIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  PaperAirplaneIcon,
  ChevronDownIcon,
  LinkIcon,
  CalendarIcon,
} from './icons';

interface TicketDetailDrawerProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onClose: () => void;
  comments: TicketComment[];
  activity: TicketActivity[];
  users: User[];
  projects: Project[];
  currentUser?: User;
  onUpdate: (ticketId: string, updates: UpdateTicketInput) => Promise<boolean>;
  onAddComment: (ticketId: string, content: string) => Promise<boolean>;
  onDelete?: (ticketId: string) => Promise<boolean>;
  loadingComments?: boolean;
}

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string; color: string }> = [
  { value: 'open', label: 'Open', color: 'bg-blue-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-500' },
  { value: 'review', label: 'Review', color: 'bg-purple-500' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-500' },
  { value: 'done', label: 'Done', color: 'bg-emerald-500' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-500' },
];

const PRIORITY_OPTIONS: Array<{ value: TicketPriority; label: string; color: string }> = [
  { value: 'low', label: 'Low', color: 'bg-gray-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
];

const TicketDetailDrawer: React.FC<TicketDetailDrawerProps> = ({
  ticket,
  isOpen,
  onClose,
  comments,
  activity,
  users,
  projects,
  currentUser,
  onUpdate,
  onAddComment,
  onDelete,
  loadingComments,
}) => {
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Reset state when ticket changes
  useEffect(() => {
    if (ticket) {
      setEditTitle(ticket.title);
      setEditDescription(ticket.description || '');
      setIsEditing(false);
      setNewComment('');
    }
  }, [ticket?.id]);

  const handleStatusChange = useCallback(async (newStatus: TicketStatus) => {
    if (!ticket) return;
    await onUpdate(ticket.id, { status: newStatus });
  }, [ticket, onUpdate]);

  const handlePriorityChange = useCallback(async (newPriority: TicketPriority) => {
    if (!ticket) return;
    await onUpdate(ticket.id, { priority: newPriority });
  }, [ticket, onUpdate]);

  const handleAssigneeChange = useCallback(async (assigneeId: string) => {
    if (!ticket) return;
    await onUpdate(ticket.id, { assigneeId: assigneeId || null });
  }, [ticket, onUpdate]);

  const handleSaveEdit = useCallback(async () => {
    if (!ticket) return;
    const success = await onUpdate(ticket.id, { 
      title: editTitle, 
      description: editDescription 
    });
    if (success) {
      setIsEditing(false);
    }
  }, [ticket, editTitle, editDescription, onUpdate]);

  const handleSubmitComment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !newComment.trim()) return;
    
    setIsSubmittingComment(true);
    try {
      const success = await onAddComment(ticket.id, newComment.trim());
      if (success) {
        setNewComment('');
      }
    } finally {
      setIsSubmittingComment(false);
    }
  }, [ticket, newComment, onAddComment]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(date);
  };

  const getUserById = (id?: string) => users.find(u => u.id === id);

  if (!isOpen || !ticket) return null;

  const assignee = ticket.assignee || getUserById(ticket.assigneeId);
  const reporter = ticket.reporter || getUserById(ticket.reporterId);
  const project = ticket.project || projects.find(p => p.id === ticket.projectId);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40" 
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-700 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:border-accent-500"
                />
              ) : (
                <h2 className="text-lg font-semibold text-white pr-4">
                  {ticket.title}
                </h2>
              )}
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
                <span>#{ticket.ticketNumber}</span>
                {project && (
                  <>
                    <span>•</span>
                    <span>{project.name}</span>
                  </>
                )}
                <span>•</span>
                <span className="capitalize">{ticket.ticketType.replace('_', ' ')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    onClick={() => setIsEditing(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    className="bg-accent-500 hover:bg-accent-500 text-white px-3 py-1 rounded-md"
                  >
                    Save
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setIsEditing(true)}
                  className="p-2 hover:bg-gray-800 rounded-md text-gray-400 hover:text-white"
                >
                  <PencilIcon className="w-4 h-4" />
                </Button>
              )}
              <Button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-md text-gray-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div className="flex flex-wrap gap-3 mt-4">
            {/* Status Dropdown */}
            <div className="relative">
              <select
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                className="appearance-none bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-8 py-1.5 text-sm text-white cursor-pointer hover:border-gray-600"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDownIcon className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            {/* Priority Dropdown */}
            <div className="relative">
              <select
                value={ticket.priority}
                onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                className="appearance-none bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-8 py-1.5 text-sm text-white cursor-pointer hover:border-gray-600"
              >
                {PRIORITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDownIcon className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            {/* Assignee Dropdown */}
            <div className="relative">
              <select
                value={ticket.assigneeId || ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className="appearance-none bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-8 py-1.5 text-sm text-white cursor-pointer hover:border-gray-600"
              >
                <option value="">Unassigned</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <ChevronDownIcon className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Description */}
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Description</h3>
            {isEditing ? (
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-accent-500"
                placeholder="Add a description..."
              />
            ) : (
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {ticket.description || <span className="text-gray-500 italic">No description</span>}
              </p>
            )}
          </div>

          {/* Metadata Grid */}
          <div className="p-4 border-b border-gray-800 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block text-xs">Reporter</span>
              <span className="text-white">{reporter?.name || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Assignee</span>
              <span className="text-white">{assignee?.name || 'Unassigned'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Created</span>
              <span className="text-white">{formatDate(ticket.createdAt)}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Due Date</span>
              <span className="text-white">
                {ticket.dueDate ? formatDate(ticket.dueDate) : 'Not set'}
              </span>
            </div>
            {ticket.tags && ticket.tags.length > 0 && (
              <div className="col-span-2">
                <span className="text-gray-500 block text-xs mb-1">Tags</span>
                <div className="flex flex-wrap gap-1">
                  {ticket.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-300 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-800">
            <div className="flex">
              <button
                onClick={() => setActiveTab('comments')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'comments'
                    ? 'text-accent-400 border-b-2 border-accent-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Comments ({comments.length})
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'activity'
                    ? 'text-accent-400 border-b-2 border-accent-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Activity ({activity.length})
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {activeTab === 'comments' ? (
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No comments yet</p>
                ) : (
                  comments.map(comment => {
                    const author = comment.author || getUserById(comment.authorId);
                    return (
                      <div key={comment.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                          {author?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{author?.name || 'Unknown'}</span>
                            <span className="text-xs text-gray-500">{formatRelativeTime(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {activity.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No activity yet</p>
                ) : (
                  activity.map(item => {
                    const actor = item.actor || getUserById(item.actorId);
                    return (
                      <div key={item.id} className="flex items-start gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-300 flex-shrink-0">
                          {actor?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                        </div>
                        <div className="flex-1">
                          <span className="text-gray-300">{actor?.name || 'Someone'}</span>
                          {' '}
                          <span className="text-gray-500">{item.action.replace('_', ' ')}</span>
                          {item.newValue && typeof item.newValue === 'string' && (
                            <span className="text-gray-400"> → {item.newValue}</span>
                          )}
                          <span className="text-gray-600 text-xs ml-2">{formatRelativeTime(item.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Comment Input */}
        <div className="flex-shrink-0 border-t border-gray-700 p-4">
          <form onSubmit={handleSubmitComment} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
            <Button
              type="submit"
              disabled={!newComment.trim() || isSubmittingComment}
              className="bg-accent-500 hover:bg-accent-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
};

export default TicketDetailDrawer;
