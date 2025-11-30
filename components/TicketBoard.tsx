/**
 * TicketBoard - Kanban board component for project management
 * 
 * Features:
 * - Drag-and-drop between columns
 * - Priority indicators
 * - Quick status updates
 * - Assignee avatars
 * - Due date badges
 */

import React, { useState, useCallback, useMemo } from 'react';
import Button from '@/components/ui/Button';
import type { Ticket, TicketStatus, User, Project } from '../types';
import { 
  ClockIcon, 
  UserIcon, 
  FlagIcon, 
  ChatBubbleIcon,
  ChevronRightIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from './icons';

interface TicketBoardProps {
  tickets: Ticket[];
  project?: Project;
  users: User[];
  currentUser?: User;
  onTicketClick: (ticket: Ticket) => void;
  onStatusChange: (ticketId: string, newStatus: TicketStatus, newPosition: number) => void;
  onCreateTicket: (column: string) => void;
  loading?: boolean;
}

interface ColumnConfig {
  id: TicketStatus;
  title: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'open', title: 'Open', color: 'text-blue-400', bgColor: 'bg-blue-500/10', icon: <PlusIcon className="w-4 h-4" /> },
  { id: 'in_progress', title: 'In Progress', color: 'text-amber-400', bgColor: 'bg-amber-500/10', icon: <ArrowPathIcon className="w-4 h-4" /> },
  { id: 'review', title: 'Review', color: 'text-purple-400', bgColor: 'bg-purple-500/10', icon: <QuestionMarkCircleIcon className="w-4 h-4" /> },
  { id: 'done', title: 'Done', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', icon: <CheckCircleIcon className="w-4 h-4" /> },
];

const PRIORITY_CONFIG = {
  urgent: { color: 'bg-red-500', text: 'text-red-400', label: 'Urgent' },
  high: { color: 'bg-orange-500', text: 'text-orange-400', label: 'High' },
  medium: { color: 'bg-yellow-500', text: 'text-yellow-400', label: 'Medium' },
  low: { color: 'bg-gray-500', text: 'text-gray-400', label: 'Low' },
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  task: <CheckCircleIcon className="w-3.5 h-3.5 text-blue-400" />,
  question: <QuestionMarkCircleIcon className="w-3.5 h-3.5 text-purple-400" />,
  bug: <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-400" />,
  feature: <PlusIcon className="w-3.5 h-3.5 text-emerald-400" />,
  maintenance: <ArrowPathIcon className="w-3.5 h-3.5 text-amber-400" />,
  follow_up: <ClockIcon className="w-3.5 h-3.5 text-cyan-400" />,
  approval_request: <FlagIcon className="w-3.5 h-3.5 text-accent-400" />,
  escalation: <ExclamationTriangleIcon className="w-3.5 h-3.5 text-orange-400" />,
};

const TicketBoard: React.FC<TicketBoardProps> = ({
  tickets,
  project,
  users,
  currentUser,
  onTicketClick,
  onStatusChange,
  onCreateTicket,
  loading,
}) => {
  const [draggedTicket, setDraggedTicket] = useState<Ticket | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const columns = useMemo(() => {
    if (project?.boardColumns) {
      return project.boardColumns.map(col => 
        DEFAULT_COLUMNS.find(c => c.id === col) || DEFAULT_COLUMNS[0]
      );
    }
    return DEFAULT_COLUMNS;
  }, [project?.boardColumns]);

  const ticketsByColumn = useMemo(() => {
    const grouped: Record<string, Ticket[]> = {};
    columns.forEach(col => {
      grouped[col.id] = [];
    });
    
    tickets.forEach(ticket => {
      const column = ticket.boardColumn || 'open';
      if (grouped[column]) {
        grouped[column].push(ticket);
      } else {
        grouped['open']?.push(ticket);
      }
    });

    // Sort by position within each column
    Object.keys(grouped).forEach(col => {
      grouped[col].sort((a, b) => (a.boardPosition || 0) - (b.boardPosition || 0));
    });

    return grouped;
  }, [tickets, columns]);

  const handleDragStart = useCallback((e: React.DragEvent, ticket: Ticket) => {
    setDraggedTicket(ticket);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticket.id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    
    if (draggedTicket && draggedTicket.boardColumn !== columnId) {
      const newPosition = ticketsByColumn[columnId]?.length || 0;
      onStatusChange(draggedTicket.id, columnId as TicketStatus, newPosition);
    }
    
    setDraggedTicket(null);
  }, [draggedTicket, ticketsByColumn, onStatusChange]);

  const handleDragEnd = useCallback(() => {
    setDraggedTicket(null);
    setDragOverColumn(null);
  }, []);

  const formatDueDate = (date?: string) => {
    if (!date) return null;
    const due = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'Overdue', color: 'text-red-400 bg-red-500/20' };
    if (diffDays === 0) return { text: 'Today', color: 'text-amber-400 bg-amber-500/20' };
    if (diffDays === 1) return { text: 'Tomorrow', color: 'text-amber-400 bg-amber-500/20' };
    if (diffDays <= 7) return { text: `${diffDays}d`, color: 'text-blue-400 bg-blue-500/20' };
    return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'text-gray-400 bg-gray-500/20' };
  };

  const getUserInitials = (user?: User) => {
    if (!user?.name) return '?';
    return user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ArrowPathIcon className="w-8 h-8 text-accent-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '500px' }}>
      {columns.map(column => (
        <div
          key={column.id}
          className={`flex-shrink-0 w-80 rounded-xl border transition-all ${
            dragOverColumn === column.id
              ? 'border-accent-500 bg-accent-500/5'
              : 'border-gray-700 bg-gray-900/30'
          }`}
          onDragOver={(e) => handleDragOver(e, column.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          {/* Column Header */}
          <div className={`p-4 border-b border-gray-700 ${column.bgColor} rounded-t-xl`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={column.color}>{column.icon}</span>
                <h3 className={`font-semibold ${column.color}`}>{column.title}</h3>
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                  {ticketsByColumn[column.id]?.length || 0}
                </span>
              </div>
              <Button
                onClick={() => onCreateTicket(column.id)}
                className="p-1 hover:bg-gray-700 rounded-md transition-colors"
                title={`Add ticket to ${column.title}`}
              >
                <PlusIcon className="w-4 h-4 text-gray-400" />
              </Button>
            </div>
          </div>

          {/* Tickets */}
          <div className="p-2 space-y-2 min-h-[400px]">
            {ticketsByColumn[column.id]?.map(ticket => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                users={users}
                isDragging={draggedTicket?.id === ticket.id}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={() => onTicketClick(ticket)}
                formatDueDate={formatDueDate}
                getUserInitials={getUserInitials}
              />
            ))}
            
            {(!ticketsByColumn[column.id] || ticketsByColumn[column.id].length === 0) && (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p>No tickets</p>
                <button
                  onClick={() => onCreateTicket(column.id)}
                  className="mt-2 text-accent-400 hover:text-accent-300 text-xs"
                >
                  + Add a ticket
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// TICKET CARD COMPONENT
// ============================================================================

interface TicketCardProps {
  ticket: Ticket;
  users: User[];
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, ticket: Ticket) => void;
  onDragEnd: () => void;
  onClick: () => void;
  formatDueDate: (date?: string) => { text: string; color: string } | null;
  getUserInitials: (user?: User) => string;
}

const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  users,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
  formatDueDate,
  getUserInitials,
}) => {
  const priority = PRIORITY_CONFIG[ticket.priority];
  const dueInfo = formatDueDate(ticket.dueDate);
  const typeIcon = TYPE_ICONS[ticket.ticketType] || TYPE_ICONS.task;
  const assignee = ticket.assignee || users.find(u => u.id === ticket.assigneeId);
  const directedTo = ticket.directedTo || users.find(u => u.id === ticket.directedToId);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, ticket)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`
        bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 border border-gray-700
        cursor-pointer transition-all hover:border-gray-600 hover:shadow-lg
        ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
      `}
    >
      {/* Header: Type icon + Priority + Ticket number */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {typeIcon}
          <span className="text-xs text-gray-500">#{ticket.ticketNumber}</span>
        </div>
        <div className={`w-2 h-2 rounded-full ${priority.color}`} title={priority.label} />
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-white mb-2 line-clamp-2">
        {ticket.title}
      </h4>

      {/* Tags */}
      {ticket.tags && ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {ticket.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded"
            >
              {tag}
            </span>
          ))}
          {ticket.tags.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 text-gray-500">
              +{ticket.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: Due date, Assignee, Comments */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-700/50">
        <div className="flex items-center gap-2">
          {/* Due Date */}
          {dueInfo && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${dueInfo.color}`}>
              {dueInfo.text}
            </span>
          )}
          
          {/* Directed To (for questions) */}
          {ticket.ticketType === 'question' && ticket.directedToRole && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
              → {ticket.directedToRole}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Comment count placeholder */}
          {ticket.commentCount && ticket.commentCount > 0 && (
            <div className="flex items-center gap-1 text-gray-500">
              <ChatBubbleIcon className="w-3 h-3" />
              <span className="text-[10px]">{ticket.commentCount}</span>
            </div>
          )}

          {/* Assignee Avatar */}
          {(assignee || directedTo) && (
            <div
              className="w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center text-[10px] font-medium text-white"
              title={assignee?.name || directedTo?.name || 'Assigned'}
            >
              {getUserInitials(assignee || directedTo)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketBoard;
