/**
 * ProjectsPage - Main page for project management and ticketing
 * 
 * Features:
 * - Project list with quick stats
 * - Kanban board view per project
 * - My Tickets view for current user
 * - Create project/ticket functionality
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { 
  Project, 
  Ticket, 
  User, 
  CreateTicketInput, 
  UpdateTicketInput, 
  CreateProjectInput,
  TicketStatus,
  TicketComment,
  TicketActivity,
} from '../types';
import { 
  useProjects, 
  useTickets, 
  useMyTickets,
  useTicketComments,
  useTicketActivity,
  createProject,
  createTicket,
  updateTicket,
  addTicketComment,
} from '../hooks/useProjectManagement';
import TicketBoard from '../components/TicketBoard';
import QuickTicketFab from '../components/QuickTicketFab';
import TicketDetailDrawer from '../components/TicketDetailDrawer';
import { 
  PlusIcon, 
  FolderIcon,
  ViewColumnsIcon,
  ListBulletIcon,
  UserIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  FunnelIcon,
  CalendarDaysIcon,
  Bars3BottomLeftIcon,
  ChevronRightIcon,
} from '../components/icons';

const formatDateInput = (date: Date) => date.toISOString().split('T')[0];
const formatDateDisplay = (iso?: string) => {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

interface ProjectsPageProps {
  currentUser?: User;
  users: User[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type ViewMode = 'projects' | 'board' | 'my-tickets' | 'list' | 'timeline';

const ProjectsPage: React.FC<ProjectsPageProps> = ({
  currentUser,
  users,
  addToast,
}) => {
  // Data hooks
  const { data: projects, loading: loadingProjects, refetch: refetchProjects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { data: tickets, loading: loadingTickets, refetch: refetchTickets } = useTickets(selectedProjectId || undefined);
  const { data: myTickets, loading: loadingMyTickets } = useMyTickets(currentUser?.id);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('projects');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectStartDate, setNewProjectStartDate] = useState(() => formatDateInput(new Date()));
  const [newProjectEndDate, setNewProjectEndDate] = useState(() => {
    const future = new Date();
    future.setDate(future.getDate() + 14);
    return formatDateInput(future);
  });
  const [newProjectOwnerId, setNewProjectOwnerId] = useState(currentUser?.id ?? '');
  const [newProjectDelegateId, setNewProjectDelegateId] = useState(currentUser?.id ?? '');
  const projectFormIds = useMemo(
    () => ({
      name: 'project-name-input',
      description: 'project-description-input',
      start: 'project-start-date',
      target: 'project-target-date',
      owner: 'project-owner-select',
      delegate: 'project-delegate-select',
    }),
    [],
  );
  useEffect(() => {
    if (isCreateProjectOpen) {
      const today = new Date();
      setNewProjectStartDate(formatDateInput(today));
      const defaultEnd = new Date(today);
      defaultEnd.setDate(defaultEnd.getDate() + 14);
      setNewProjectEndDate(formatDateInput(defaultEnd));
      const ownerDefault = currentUser?.id ?? '';
      setNewProjectOwnerId(ownerDefault);
      setNewProjectDelegateId(ownerDefault);
    }
  }, [isCreateProjectOpen, currentUser?.id]);

  // Ticket detail data
  const { data: ticketComments, loading: loadingComments } = useTicketComments(selectedTicket?.id || '');
  const { data: ticketActivity } = useTicketActivity(selectedTicket?.id || '');

  const selectedProject = useMemo(() => 
    projects.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  // Handlers
  const handleSelectProject = useCallback((project: Project) => {
    setSelectedProjectId(project.id);
    setViewMode('board');
  }, []);

  const handleTicketClick = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsDrawerOpen(true);
  }, []);

  const handleStatusChange = useCallback(async (ticketId: string, newStatus: TicketStatus, newPosition: number) => {
    if (!currentUser) return;
    const result = await updateTicket(ticketId, { status: newStatus, boardPosition: newPosition }, currentUser.id);
    if (result.success) {
      refetchTickets();
    } else {
      addToast('Failed to update ticket status', 'error');
    }
  }, [currentUser, refetchTickets, addToast]);

  const handleCreateTicket = useCallback(async (input: CreateTicketInput) => {
    if (!currentUser) return false;
    const result = await createTicket(input, currentUser.id);
    if (result.success) {
      addToast('Ticket created successfully', 'success');
      refetchTickets();
      return true;
    } else {
      addToast(result.error || 'Failed to create ticket', 'error');
      return false;
    }
  }, [currentUser, refetchTickets, addToast]);

  const handleUpdateTicket = useCallback(async (ticketId: string, updates: UpdateTicketInput) => {
    if (!currentUser) return false;
    const result = await updateTicket(ticketId, updates, currentUser.id);
    if (result.success) {
      refetchTickets();
      return true;
    } else {
      addToast(result.error || 'Failed to update ticket', 'error');
      return false;
    }
  }, [currentUser, refetchTickets, addToast]);

  const handleAddComment = useCallback(async (ticketId: string, content: string) => {
    if (!currentUser) return false;
    const result = await addTicketComment(ticketId, content, currentUser.id);
    if (result.success) {
      return true;
    } else {
      addToast(result.error || 'Failed to add comment', 'error');
      return false;
    }
  }, [currentUser, addToast]);

  const handleCreateProject = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    if (!newProjectOwnerId) {
      addToast('Select a project owner', 'error');
      return;
    }
    if (!newProjectStartDate || !newProjectEndDate) {
      addToast('Provide both start and target dates', 'error');
      return;
    }
    if (!newProjectDelegateId) {
      addToast('Select a delegate to own day-to-day execution', 'error');
      return;
    }
    if (new Date(newProjectEndDate) < new Date(newProjectStartDate)) {
      addToast('Target date must be after the start date', 'error');
      return;
    }

    const input: CreateProjectInput = {
      name: newProjectName.trim(),
      description: newProjectDescription.trim() || undefined,
      department: currentUser?.department,
      ownerId: newProjectOwnerId,
      delegateId: newProjectDelegateId,
      startDate: newProjectStartDate,
      targetEndDate: newProjectEndDate,
      defaultAssigneeId: newProjectDelegateId,
    };

    const result = await createProject(input);
    if (result.success) {
      addToast('Project created successfully', 'success');
      setNewProjectName('');
      setNewProjectDescription('');
      const today = new Date();
      setNewProjectStartDate(formatDateInput(today));
      const defaultEnd = new Date(today);
      defaultEnd.setDate(defaultEnd.getDate() + 14);
      setNewProjectEndDate(formatDateInput(defaultEnd));
      setNewProjectOwnerId(currentUser?.id ?? '');
      setNewProjectDelegateId('');
      setIsCreateProjectOpen(false);
      refetchProjects();
    } else {
      addToast(result.error || 'Failed to create project', 'error');
    }
  }, [
    newProjectName,
    newProjectDescription,
    newProjectOwnerId,
    newProjectDelegateId,
    newProjectStartDate,
    newProjectEndDate,
    currentUser?.department,
    currentUser?.id,
    refetchProjects,
    addToast,
  ]);

  const handleCreateTicketInColumn = useCallback((column: string) => {
    // This will be handled by the QuickTicketFab with the column pre-selected
    // For now, just show a toast
    addToast(`Click the + button to create a ticket in "${column}"`, 'info');
  }, [addToast]);

  // Stats for projects view
  const projectStats = useMemo(() => {
    const stats: Record<string, { total: number; open: number; done: number }> = {};
    // In a real implementation, we'd fetch ticket counts per project
    // For now, use mock data
    projects.forEach(p => {
      stats[p.id] = { total: 5, open: 3, done: 2 };
    });
    return stats;
  }, [projects]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects & Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">
            {viewMode === 'my-tickets' 
              ? 'Your assigned tickets and questions'
              : viewMode === 'board' && selectedProject
                ? selectedProject.name
                : viewMode === 'list'
                  ? 'Owner → Delegate task assignments'
                  : viewMode === 'timeline' && selectedProject
                    ? `${selectedProject.name} - Timeline`
                    : 'Manage projects and track work'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-1 flex-wrap gap-1">
            <button
              onClick={() => { setViewMode('projects'); setSelectedProjectId(null); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'projects' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Projects"
            >
              <FolderIcon className="w-4 h-4 inline mr-1" />
              Projects
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Owner → Delegate View"
            >
              <Bars3BottomLeftIcon className="w-4 h-4 inline mr-1" />
              List
            </button>
            <button
              onClick={() => setViewMode('my-tickets')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'my-tickets' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="My Tickets"
            >
              <UserIcon className="w-4 h-4 inline mr-1" />
              My Tickets
            </button>
          </div>

          {viewMode === 'projects' && (
            <Button
              onClick={() => setIsCreateProjectOpen(true)}
              className="bg-accent-500 hover:bg-accent-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              New Project
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingProjects ? (
            <div className="col-span-full flex justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-accent-400 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <FolderIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Projects Yet</h3>
              <p className="text-gray-400 mb-4">Create your first project to start organizing work.</p>
              <Button
                onClick={() => setIsCreateProjectOpen(true)}
                className="bg-accent-500 hover:bg-accent-500 text-white px-4 py-2 rounded-lg"
              >
                Create Project
              </Button>
            </div>
          ) : (
            projects.map(project => {
              const stats = projectStats[project.id] || { total: 0, open: 0, done: 0 };
              const owner = users.find(u => u.id === project.ownerId);
              const delegate = project.delegateId ? users.find(u => u.id === project.delegateId) : undefined;
              return (
                <div
                  key={project.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:border-accent-500/50 hover:bg-gray-800/70 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-accent-300 transition-colors">
                        {project.name}
                      </h3>
                      {project.code && (
                        <span className="text-xs text-gray-500 font-mono">{project.code}</span>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      project.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' :
                      project.status === 'on_hold' ? 'bg-amber-500/20 text-amber-300' :
                      project.status === 'completed' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-gray-500/20 text-gray-300'
                    }`}>
                      {project.status}
                    </span>
                  </div>

                  {project.description && (
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">{project.description}</p>
                  )}

                  {/* Owner info */}
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <UserIcon className="w-4 h-4" />
                      <span>{owner?.name || 'Owner unknown'}</span>
                    </div>
                    {delegate && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <ChevronRightIcon className="w-3 h-3" />
                        <span>Delegate: {delegate.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <CalendarDaysIcon className="w-3 h-3" />
                      <span>{formatDateDisplay(project.startDate)} → {formatDateDisplay(project.targetEndDate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm mb-4">
                    <span className="text-gray-500">
                      <span className="text-white font-medium">{stats.total}</span> tickets
                    </span>
                    <span className="text-emerald-400">
                      <CheckCircleIcon className="w-4 h-4 inline mr-1" />
                      {stats.done} done
                    </span>
                    <span className="text-blue-400">
                      <ClockIcon className="w-4 h-4 inline mr-1" />
                      {stats.open} open
                    </span>
                  </div>

                  {/* View options */}
                  <div className="flex gap-2 border-t border-gray-700 pt-3">
                    <button
                      onClick={() => handleSelectProject(project)}
                      className="flex-1 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-1"
                    >
                      <ViewColumnsIcon className="w-4 h-4" />
                      Kanban
                    </button>
                    <button
                      onClick={() => { setSelectedProjectId(project.id); setViewMode('timeline'); }}
                      className="flex-1 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-1"
                    >
                      <CalendarDaysIcon className="w-4 h-4" />
                      Timeline
                    </button>
                  </div>

                  {project.tags && project.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {project.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {viewMode === 'board' && selectedProject && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => { setViewMode('projects'); setSelectedProjectId(null); }}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              ← Back to Projects
            </button>
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('board')}
                className="px-3 py-1 rounded-md text-sm font-medium bg-gray-700 text-white"
              >
                <ViewColumnsIcon className="w-4 h-4 inline mr-1" />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className="px-3 py-1 rounded-md text-sm font-medium text-gray-400 hover:text-white"
              >
                <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
                Timeline
              </button>
            </div>
          </div>
          <TicketBoard
            tickets={tickets}
            project={selectedProject}
            users={users}
            currentUser={currentUser}
            onTicketClick={handleTicketClick}
            onStatusChange={handleStatusChange}
            onCreateTicket={handleCreateTicketInColumn}
            loading={loadingTickets}
          />
        </div>
      )}

      {/* Timeline/Gantt View */}
      {viewMode === 'timeline' && selectedProject && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => { setViewMode('projects'); setSelectedProjectId(null); }}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              ← Back to Projects
            </button>
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('board')}
                className="px-3 py-1 rounded-md text-sm font-medium text-gray-400 hover:text-white"
              >
                <ViewColumnsIcon className="w-4 h-4 inline mr-1" />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className="px-3 py-1 rounded-md text-sm font-medium bg-gray-700 text-white"
              >
                <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
                Timeline
              </button>
            </div>
          </div>
          <div className="mb-4 text-sm text-gray-400 space-x-4">
            <span>
              Owner:{' '}
              <span className="text-white">
                {users.find(u => u.id === selectedProject.ownerId)?.name ?? 'Unknown'}
              </span>
            </span>
            {selectedProject.delegateId && (
              <span>
                Delegate:{' '}
                <span className="text-white">
                  {users.find(u => u.id === selectedProject.delegateId)?.name ?? '—'}
                </span>
              </span>
            )}
            <span>
              Window:{' '}
              <span className="text-white">
                {formatDateDisplay(selectedProject.startDate)} → {formatDateDisplay(selectedProject.targetEndDate)}
              </span>
            </span>
          </div>
          
          {/* Timeline Header with date scale */}
          <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
            {loadingTickets ? (
              <div className="flex justify-center py-12">
                <ArrowPathIcon className="w-8 h-8 text-accent-400 animate-spin" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-12">
                <CalendarDaysIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Tasks Yet</h3>
                <p className="text-gray-400">Create tickets with due dates to see them on the timeline.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Timeline scale header */}
                <div className="flex border-b border-gray-700 bg-gray-800/50 sticky top-0">
                  <div className="w-64 flex-shrink-0 px-4 py-3 text-xs font-semibold text-gray-400 uppercase border-r border-gray-700">
                    Task
                  </div>
                  <div className="flex-1 flex">
                    {(() => {
                      // Generate date columns for next 30 days
                      const today = new Date();
                      const days = [];
                      for (let i = 0; i < 30; i++) {
                        const date = new Date(today);
                        date.setDate(date.getDate() + i);
                        days.push(date);
                      }
                      return days.map((date, idx) => (
                        <div
                          key={idx}
                          className={`w-10 flex-shrink-0 px-1 py-3 text-xs text-center border-r border-gray-700 ${
                            date.getDay() === 0 || date.getDay() === 6 ? 'bg-gray-800/30' : ''
                          } ${idx === 0 ? 'bg-accent-500/10' : ''}`}
                        >
                          <div className="text-gray-500">{date.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
                          <div className={`font-medium ${idx === 0 ? 'text-accent-400' : 'text-gray-400'}`}>
                            {date.getDate()}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                
                {/* Timeline rows */}
                <div className="divide-y divide-gray-800">
                  {tickets
                    .filter(t => t.status !== 'cancelled' && t.status !== 'closed')
                    .sort((a, b) => {
                      // Sort by due date, then by priority
                      if (a.dueDate && b.dueDate) {
                        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                      }
                      if (a.dueDate) return -1;
                      if (b.dueDate) return 1;
                      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
                      return priorityOrder[a.priority] - priorityOrder[b.priority];
                    })
                    .map(ticket => {
                      const assignee = users.find(u => u.id === ticket.assigneeId);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      
                      // Calculate bar position
                      let barStart = 0;
                      let barWidth = 1;
                      
                      if (ticket.dueDate) {
                        const dueDate = new Date(ticket.dueDate);
                        dueDate.setHours(0, 0, 0, 0);
                        const startDate = ticket.startedAt ? new Date(ticket.startedAt) : new Date(ticket.createdAt);
                        startDate.setHours(0, 0, 0, 0);
                        
                        const diffFromToday = Math.floor((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        barStart = Math.max(0, diffFromToday);
                        
                        const duration = Math.max(1, Math.floor((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                        barWidth = Math.min(duration, 30 - barStart);
                      }
                      
                      const isOverdue = ticket.dueDate && new Date(ticket.dueDate) < today && ticket.status !== 'done';
                      
                      return (
                        <div
                          key={ticket.id}
                          className="flex hover:bg-gray-800/30 cursor-pointer transition-colors"
                          onClick={() => handleTicketClick(ticket)}
                        >
                          <div className="w-64 flex-shrink-0 px-4 py-3 border-r border-gray-700">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                ticket.priority === 'urgent' ? 'bg-red-500' :
                                ticket.priority === 'high' ? 'bg-orange-500' :
                                ticket.priority === 'medium' ? 'bg-yellow-500' :
                                'bg-gray-500'
                              }`} />
                              <span className="text-sm text-white truncate">{ticket.title}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">#{ticket.ticketNumber}</span>
                              {assignee && (
                                <span className="text-xs text-gray-500 truncate">{assignee.name}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 flex items-center relative">
                            {/* Timeline bar */}
                            {ticket.dueDate && (
                              <div
                                className={`absolute h-6 rounded ${
                                  ticket.status === 'done' ? 'bg-emerald-500/40 border border-emerald-500/60' :
                                  isOverdue ? 'bg-red-500/40 border border-red-500/60' :
                                  ticket.status === 'in_progress' ? 'bg-amber-500/40 border border-amber-500/60' :
                                  'bg-accent-500/40 border border-accent-500/60'
                                }`}
                                style={{
                                  left: `${barStart * 40}px`,
                                  width: `${Math.max(barWidth * 40 - 4, 36)}px`,
                                }}
                              >
                                <span className="text-xs text-white px-2 truncate block leading-6">
                                  {ticket.title}
                                </span>
                              </div>
                            )}
                            {!ticket.dueDate && (
                              <span className="text-xs text-gray-500 px-4">No due date</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* List View - Owner → Delegate */}
      {viewMode === 'list' && (
        <div className="space-y-6">
          {loadingProjects ? (
            <div className="flex justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-accent-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Group by project owner or assignee */}
              {(() => {
                // Get all tickets across projects
                const allTickets = tickets.length > 0 ? tickets : myTickets;
                
                // Group tickets by reporter (delegator) → assignee
                const delegationMap = new Map<string, Map<string, Ticket[]>>();
                
                allTickets.forEach(ticket => {
                  const reporterId = ticket.reporterId || 'unassigned';
                  const assigneeId = ticket.assigneeId || 'unassigned';
                  
                  if (!delegationMap.has(reporterId)) {
                    delegationMap.set(reporterId, new Map());
                  }
                  const assigneeMap = delegationMap.get(reporterId)!;
                  if (!assigneeMap.has(assigneeId)) {
                    assigneeMap.set(assigneeId, []);
                  }
                  assigneeMap.get(assigneeId)!.push(ticket);
                });

                // Also show project owners with their delegated work
                const projectOwners = new Map<string, Project[]>();
                projects.forEach(project => {
                  const ownerId = project.ownerId;
                  if (!ownerId) return;
                  if (!projectOwners.has(ownerId)) {
                    projectOwners.set(ownerId, []);
                  }
                  projectOwners.get(ownerId)!.push(project);
                });

                return (
                  <div className="space-y-6">
                    {/* Project Owners Section */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                      <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
                        <h3 className="text-sm font-semibold text-white">Project Ownership</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Who owns which projects</p>
                      </div>
                      <div className="divide-y divide-gray-800">
                        {Array.from(projectOwners.entries()).map(([ownerId, ownerProjects]) => {
                          const owner = users.find(u => u.id === ownerId);
                          return (
                            <div key={ownerId} className="p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-full bg-accent-500/20 flex items-center justify-center">
                                  <UserIcon className="w-4 h-4 text-accent-400" />
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-white">
                                    {owner?.name || 'Unassigned'}
                                  </span>
                                  <span className="text-xs text-gray-500 ml-2">
                                    {ownerProjects.length} project{ownerProjects.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                              <div className="ml-11 space-y-2">
                                {ownerProjects.map(project => (
                                  <button
                                    key={project.id}
                                    onClick={() => handleSelectProject(project)}
                                    className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
                                  >
                                    <FolderIcon className="w-4 h-4 text-gray-500" />
                                    {project.name}
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                                      project.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' :
                                      'bg-gray-500/20 text-gray-300'
                                    }`}>
                                      {project.status}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {projectOwners.size === 0 && (
                          <div className="p-8 text-center text-gray-500">
                            No projects yet
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Task Delegation Section */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                      <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
                        <h3 className="text-sm font-semibold text-white">Task Delegation</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Owner → Delegate assignments</p>
                      </div>
                      <div className="divide-y divide-gray-800">
                        {Array.from(delegationMap.entries()).map(([reporterId, assigneeMap]) => {
                          const reporter = users.find(u => u.id === reporterId);
                          return (
                            <div key={reporterId} className="p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                                  <UserIcon className="w-4 h-4 text-purple-400" />
                                </div>
                                <span className="text-sm font-medium text-white">
                                  {reporter?.name || 'System'}
                                </span>
                                <span className="text-xs text-gray-500">delegated to:</span>
                              </div>
                              
                              <div className="ml-6 space-y-3">
                                {Array.from(assigneeMap.entries()).map(([assigneeId, assignedTickets]) => {
                                  const assignee = users.find(u => u.id === assigneeId);
                                  const openCount = assignedTickets.filter(t => t.status !== 'done' && t.status !== 'closed').length;
                                  
                                  return (
                                    <div key={assigneeId} className="border-l-2 border-gray-700 pl-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                          <UserIcon className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <span className="text-sm text-gray-300">
                                          {assignee?.name || 'Unassigned'}
                                        </span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                          openCount > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400'
                                        }`}>
                                          {openCount} open
                                        </span>
                                      </div>
                                      <div className="ml-8 space-y-1">
                                        {assignedTickets.slice(0, 3).map(ticket => (
                                          <button
                                            key={ticket.id}
                                            onClick={() => handleTicketClick(ticket)}
                                            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors w-full text-left"
                                          >
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                              ticket.status === 'done' ? 'bg-emerald-500' :
                                              ticket.status === 'in_progress' ? 'bg-amber-500' :
                                              'bg-blue-500'
                                            }`} />
                                            <span className="truncate">{ticket.title}</span>
                                            {ticket.ticketType === 'question' && (
                                              <span className="text-purple-400">?</span>
                                            )}
                                          </button>
                                        ))}
                                        {assignedTickets.length > 3 && (
                                          <span className="text-xs text-gray-500 ml-3">
                                            +{assignedTickets.length - 3} more
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {delegationMap.size === 0 && (
                          <div className="p-8 text-center text-gray-500">
                            No delegated tasks yet
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {viewMode === 'my-tickets' && (
        <div className="space-y-4">
          {loadingMyTickets ? (
            <div className="flex justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-accent-400 animate-spin" />
            </div>
          ) : myTickets.length === 0 ? (
            <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-gray-800">
              <CheckCircleIcon className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">All Caught Up!</h3>
              <p className="text-gray-400">You have no open tickets assigned to you.</p>
            </div>
          ) : (
            <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {myTickets.map(ticket => (
                    <tr
                      key={ticket.id}
                      onClick={() => handleTicketClick(ticket)}
                      className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-gray-500">#{ticket.ticketNumber}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-white">{ticket.title}</span>
                        {ticket.ticketType === 'question' && (
                          <span className="ml-2 text-xs text-purple-400">Question</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ticket.status === 'open' ? 'bg-blue-500/20 text-blue-300' :
                          ticket.status === 'in_progress' ? 'bg-amber-500/20 text-amber-300' :
                          ticket.status === 'review' ? 'bg-purple-500/20 text-purple-300' :
                          ticket.status === 'blocked' ? 'bg-red-500/20 text-red-300' :
                          'bg-gray-500/20 text-gray-300'
                        }`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ticket.priority === 'urgent' ? 'bg-red-500/20 text-red-300' :
                          ticket.priority === 'high' ? 'bg-orange-500/20 text-orange-300' :
                          ticket.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-gray-500/20 text-gray-300'
                        }`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {ticket.dueDate 
                          ? new Date(ticket.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateProjectOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white mb-4">Create Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label htmlFor={projectFormIds.name} className="text-sm text-gray-400 block mb-1">
                  Project Name
                </label>
                <input
                  id={projectFormIds.name}
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., Q4 Production Ramp"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-accent-500"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor={projectFormIds.description} className="text-sm text-gray-400 block mb-1">
                  Description (optional)
                </label>
                <textarea
                  id={projectFormIds.description}
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="What is this project about?"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-accent-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={projectFormIds.start} className="text-sm text-gray-400 block mb-1">
                    Start Date
                  </label>
                  <input
                    id={projectFormIds.start}
                    type="date"
                    value={newProjectStartDate}
                    onChange={(e) => setNewProjectStartDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-accent-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor={projectFormIds.target} className="text-sm text-gray-400 block mb-1">
                    Target Date
                  </label>
                  <input
                    id={projectFormIds.target}
                    type="date"
                    value={newProjectEndDate}
                    onChange={(e) => setNewProjectEndDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-accent-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor={projectFormIds.owner} className="text-sm text-gray-400 block mb-1">
                  Project Owner
                </label>
                <select
                  id={projectFormIds.owner}
                  value={newProjectOwnerId}
                  onChange={(e) => setNewProjectOwnerId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-accent-500"
                  required
                >
                  <option value="">Select owner</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={projectFormIds.delegate} className="text-sm text-gray-400 block mb-1">
                  Delegate / Delivery Lead
                </label>
                <select
                  id={projectFormIds.delegate}
                  value={newProjectDelegateId}
                  onChange={(e) => setNewProjectDelegateId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-accent-500"
                  required
                >
                  <option value="">Select delegate</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Delegates receive daily nudges and default assignments for this project.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !newProjectName.trim() ||
                    !newProjectOwnerId ||
                    !newProjectDelegateId ||
                    !newProjectStartDate ||
                    !newProjectEndDate
                  }
                  className="bg-accent-500 hover:bg-accent-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  Create Project
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Ticket FAB */}
      <QuickTicketFab
        currentUser={currentUser}
        users={users}
        projects={projects}
        onCreateTicket={handleCreateTicket}
        defaultProjectId={selectedProjectId || undefined}
      />

      {/* Ticket Detail Drawer */}
      <TicketDetailDrawer
        ticket={selectedTicket}
        isOpen={isDrawerOpen}
        onClose={() => { setIsDrawerOpen(false); setSelectedTicket(null); }}
        comments={ticketComments}
        activity={ticketActivity}
        users={users}
        projects={projects}
        currentUser={currentUser}
        onUpdate={handleUpdateTicket}
        onAddComment={handleAddComment}
        loadingComments={loadingComments}
      />
    </div>
  );
};

export default ProjectsPage;
