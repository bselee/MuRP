/**
 * ProjectsPage - Main page for project management and ticketing
 * 
 * Features:
 * - Project list with quick stats
 * - Kanban board view per project
 * - My Tickets view for current user
 * - Create project/ticket functionality
 */

import React, { useState, useCallback, useMemo } from 'react';
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
} from '../components/icons';

interface ProjectsPageProps {
  currentUser?: User;
  users: User[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type ViewMode = 'projects' | 'board' | 'my-tickets';

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

    const input: CreateProjectInput = {
      name: newProjectName.trim(),
      description: newProjectDescription.trim() || undefined,
      department: currentUser?.department,
    };

    const result = await createProject(input);
    if (result.success) {
      addToast('Project created successfully', 'success');
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreateProjectOpen(false);
      refetchProjects();
    } else {
      addToast(result.error || 'Failed to create project', 'error');
    }
  }, [newProjectName, newProjectDescription, currentUser?.department, refetchProjects, addToast]);

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
                : 'Manage projects and track work'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => { setViewMode('projects'); setSelectedProjectId(null); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'projects' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <FolderIcon className="w-4 h-4 inline mr-1" />
              Projects
            </button>
            <button
              onClick={() => setViewMode('my-tickets')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'my-tickets' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <UserIcon className="w-4 h-4 inline mr-1" />
              My Tickets
            </button>
          </div>

          {viewMode === 'projects' && (
            <Button
              onClick={() => setIsCreateProjectOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
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
              <ArrowPathIcon className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <FolderIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Projects Yet</h3>
              <p className="text-gray-400 mb-4">Create your first project to start organizing work.</p>
              <Button
                onClick={() => setIsCreateProjectOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg"
              >
                Create Project
              </Button>
            </div>
          ) : (
            projects.map(project => {
              const stats = projectStats[project.id] || { total: 0, open: 0, done: 0 };
              return (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 text-left hover:border-indigo-500/50 hover:bg-gray-800/70 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">
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
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2">{project.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm">
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

                  {project.tags && project.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {project.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {viewMode === 'board' && selectedProject && (
        <div>
          <button
            onClick={() => { setViewMode('projects'); setSelectedProjectId(null); }}
            className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1"
          >
            ← Back to Projects
          </button>
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

      {viewMode === 'my-tickets' && (
        <div className="space-y-4">
          {loadingMyTickets ? (
            <div className="flex justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-indigo-400 animate-spin" />
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
                <label className="text-sm text-gray-400 block mb-1">Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., Q4 Production Ramp"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Description (optional)</label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="What is this project about?"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-indigo-500"
                />
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
                  disabled={!newProjectName.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg"
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
