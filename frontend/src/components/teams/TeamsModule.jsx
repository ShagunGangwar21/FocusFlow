import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchTeams,
  createTeam,
  fetchTeamById,
  deleteTeam,
  inviteMember,
  revokeInvitation,
  updateMemberRole,
  removeMember,
  createProject,
  deleteProject,
} from '../../api/teams';
import { fetchTasks, createTask, completeTask } from '../../api/tasks';
import CreateTeamModal from './CreateTeamModal';
import InviteMemberModal from './InviteMemberModal';
import CreateProjectModal from './CreateProjectModal';
import CreateTeamTaskModal from './CreateTeamTaskModal';
import {
  IconUsers,
  IconPlus,
  IconFolder,
  IconCheckSquare,
  IconMail,
  IconShield,
  IconCrown,
  IconTrash,
  IconLogOut,
  IconPlay,
  IconLock,
  IconUnlock,
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconRefreshCw,
  IconEdit,
} from '../common/Icons';

export default function TeamsModule({ onStartFocus, onEditTask, activeSession }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [teamTasks, setTeamTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [activeTab, setActiveTab] = useState('overview');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Modals
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isDeleteTeamOpen, setIsDeleteTeamOpen] = useState(false);

  // Load user's teams
  const loadTeams = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTeams();
      setTeams(data || []);
      if (data && data.length > 0 && !selectedTeamId) {
        setSelectedTeamId(data[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTeamId]);

  // Load specific team details & tasks
  const loadTeamDetails = useCallback(async (teamId) => {
    if (!teamId) return;
    try {
      setIsRefreshing(true);
      setError(null);
      const [teamData, tasksRes] = await Promise.all([
        fetchTeamById(teamId),
        fetchTasks({ scope: 'TEAM', teamId, limit: 100 }),
      ]);
      setCurrentTeam(teamData);
      setTeamTasks(tasksRes?.tasks || []);
    } catch (err) {
      setError(err.message || 'Failed to load team details');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamDetails(selectedTeamId);
    } else {
      setCurrentTeam(null);
      setTeamTasks([]);
    }
  }, [selectedTeamId, loadTeamDetails]);

  const showNotification = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  // Handlers
  const handleCreateTeam = async (data) => {
    const newTeam = await createTeam(data);
    showNotification(`Team "${newTeam.name}" created successfully`);
    await loadTeams();
    setSelectedTeamId(newTeam.id);
  };

  const handleInviteMember = async (inviteData) => {
    if (!selectedTeamId) return;
    const res = await inviteMember(selectedTeamId, inviteData);
    showNotification(`Invitation generated for ${inviteData.email}`);
    await loadTeamDetails(selectedTeamId);
    return res;
  };

  const handleRevokeInvitation = async (invitationId) => {
    if (!selectedTeamId) return;
    try {
      await revokeInvitation(selectedTeamId, invitationId);
      showNotification('Invitation revoked');
      await loadTeamDetails(selectedTeamId);
    } catch (err) {
      setError(err.message || 'Failed to revoke invitation');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!selectedTeamId) return;
    try {
      await updateMemberRole(selectedTeamId, userId, newRole);
      showNotification(`Member role updated to ${newRole}`);
      await loadTeamDetails(selectedTeamId);
    } catch (err) {
      setError(err.message || 'Failed to update member role');
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedTeamId || !memberToRemove) return;
    try {
      await removeMember(selectedTeamId, memberToRemove.userId);
      showNotification(`Member ${memberToRemove.user?.name || ''} removed from team`);
      setMemberToRemove(null);
      await loadTeamDetails(selectedTeamId);
    } catch (err) {
      setError(err.message || 'Failed to remove member');
    }
  };

  const handleLeaveTeam = async () => {
    if (!selectedTeamId || !currentTeam) return;
    try {
      // Find caller's own member record
      const myMembership = currentTeam.members.find((m) => m.role === currentTeam.myRole);
      if (!myMembership) return;
      await removeMember(selectedTeamId, myMembership.userId);
      showNotification(`You have left ${currentTeam.name}`);
      setIsLeaveModalOpen(false);
      setSelectedTeamId(null);
      await loadTeams();
    } catch (err) {
      setError(err.message || 'Failed to leave team');
      setIsLeaveModalOpen(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeamId || !currentTeam) return;
    try {
      await deleteTeam(selectedTeamId);
      showNotification(`Team "${currentTeam.name}" deleted`);
      setIsDeleteTeamOpen(false);
      setSelectedTeamId(null);
      await loadTeams();
    } catch (err) {
      setError(err.message || 'Failed to delete team');
      setIsDeleteTeamOpen(false);
    }
  };

  const handleCreateProject = async (projectData) => {
    if (!selectedTeamId) return;
    await createProject(selectedTeamId, projectData);
    showNotification('Project created successfully');
    await loadTeamDetails(selectedTeamId);
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm('Are you sure you want to delete this project? Tasks will remain unlinked.')) return;
    try {
      await deleteProject(projectId);
      showNotification('Project deleted');
      await loadTeamDetails(selectedTeamId);
    } catch (err) {
      setError(err.message || 'Failed to delete project');
    }
  };

  const handleCreateTeamTask = async (taskData) => {
    await createTask(taskData);
    showNotification('Team task created successfully');
    await loadTeamDetails(selectedTeamId);
  };

  const handleCompleteTask = async (taskId) => {
    try {
      await completeTask(taskId, {});
      showNotification('Task marked as completed');
      await loadTeamDetails(selectedTeamId);
    } catch (err) {
      setError(err.message || 'Failed to complete task');
    }
  };

  // Filter tasks by selected project
  const filteredTasks = selectedProjectId === 'ALL'
    ? teamTasks
    : teamTasks.filter((t) => t.projectId === selectedProjectId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)] animate-fadeIn">
        <span className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-medium">Loading Teams & Collaboration Hub...</span>
      </div>
    );
  }

  // Zero teams state
  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] animate-fadeIn">
        <div className="p-4 rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)] mb-4">
          <IconUsers className="w-10 h-10" />
        </div>
        <h2 className="text-lg font-bold text-[var(--text-main)]">No Teams Found</h2>
        <p className="max-w-md text-xs sm:text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed">
          Create a team to collaborate on projects, assign deliverables, and coordinate schedules with colleagues while keeping your personal schedule strictly private.
        </p>
        <button
          type="button"
          onClick={() => setIsCreateTeamOpen(true)}
          className="mt-6 px-5 py-2.5 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all cursor-pointer flex items-center gap-2 shadow-sm"
        >
          <IconPlus className="w-4 h-4" />
          Create Your First Team
        </button>

        <CreateTeamModal
          isOpen={isCreateTeamOpen}
          onClose={() => setIsCreateTeamOpen(false)}
          onCreateTeam={handleCreateTeam}
        />
      </div>
    );
  }

  const isOwner = currentTeam?.myRole === 'OWNER';
  const isAdminOrOwner = currentTeam?.myRole === 'OWNER' || currentTeam?.myRole === 'ADMIN';

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Alert Notifications */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-400 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center gap-2">
          <IconCheck className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Top Header & Team Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <IconUsers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <select
                value={selectedTeamId || ''}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="text-base font-bold text-[var(--text-main)] bg-transparent border-none outline-none cursor-pointer focus:ring-0"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[var(--bg-card)] text-[var(--text-main)]">
                    {t.name}
                  </option>
                ))}
              </select>
              {currentTeam && (
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                    isOwner
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                      : currentTeam.myRole === 'ADMIN'
                      ? 'bg-blue-500/15 border-blue-500/30 text-blue-500'
                      : 'bg-zinc-500/15 border-zinc-500/30 text-[var(--text-muted)]'
                  }`}
                >
                  {isOwner && <IconCrown className="w-3 h-3" />}
                  {currentTeam.myRole === 'ADMIN' && <IconShield className="w-3 h-3" />}
                  {currentTeam.myRole}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {currentTeam?.members?.length || 0} members · {currentTeam?.projects?.length || 0} projects · {teamTasks.length} tasks
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadTeamDetails(selectedTeamId)}
            disabled={isRefreshing}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            title="Refresh team data"
          >
            <IconRefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsCreateTeamOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <IconPlus className="w-3.5 h-3.5" />
            New Team
          </button>

          {/* Leave or Delete Team */}
          {isOwner ? (
            <button
              type="button"
              onClick={() => setIsDeleteTeamOpen(true)}
              className="p-2 rounded-xl text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer"
              title="Delete team"
            >
              <IconTrash className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(true)}
              className="px-3 py-2 text-xs font-semibold rounded-xl text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer flex items-center gap-1"
              title="Leave team"
            >
              <IconLogOut className="w-3.5 h-3.5" />
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] overflow-x-auto pb-px">
        {[
          { id: 'overview', label: 'Overview', icon: IconUsers },
          { id: 'projects', label: 'Projects', icon: IconFolder, count: currentTeam?.projects?.length },
          { id: 'tasks', label: 'Shared Tasks', icon: IconCheckSquare, count: teamTasks.length },
          { id: 'members', label: 'Members', icon: IconUsers, count: currentTeam?.members?.length },
          ...(isAdminOrOwner
            ? [{ id: 'invitations', label: 'Invitations', icon: IconMail, count: currentTeam?.invitations?.length }]
            : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--border-subtle)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Total Members
              </span>
              <div className="text-2xl font-bold text-[var(--text-main)] mt-1">
                {currentTeam?.members?.length || 0}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Active Projects
              </span>
              <div className="text-2xl font-bold text-[var(--text-main)] mt-1">
                {currentTeam?.projects?.length || 0}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Team Tasks
              </span>
              <div className="text-2xl font-bold text-[var(--text-main)] mt-1">
                {teamTasks.length}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Pending Invites
              </span>
              <div className="text-2xl font-bold text-[var(--text-main)] mt-1">
                {currentTeam?.invitations?.length || 0}
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">Collaboration Shortcuts</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Quickly coordinate deliverables with your team</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdminOrOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <IconMail className="w-3.5 h-3.5" />
                    Invite Member
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreateProjectOpen(true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <IconFolder className="w-3.5 h-3.5" />
                    New Project
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setIsCreateTaskOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <IconCheckSquare className="w-3.5 h-3.5" />
                New Team Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. PROJECTS TAB */}
      {activeTab === 'projects' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">Team Projects</h3>
              <p className="text-xs text-[var(--text-muted)]">Track project deliverables and overall progress</p>
            </div>
            {isAdminOrOwner && (
              <button
                type="button"
                onClick={() => setIsCreateProjectOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <IconPlus className="w-3.5 h-3.5" />
                New Project
              </button>
            )}
          </div>

          {currentTeam?.projects?.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <IconFolder className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
              <p className="text-xs text-[var(--text-muted)]">No projects in this team yet.</p>
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="mt-3 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] text-[var(--accent-text)] cursor-pointer"
                >
                  Create Project
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {currentTeam?.projects?.map((proj) => (
                <div
                  key={proj.id}
                  className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-[var(--bg-subtle)] text-[var(--accent)]">
                          <IconFolder className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-[var(--text-main)]">{proj.name}</h4>
                      </div>
                      {isAdminOrOwner && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(proj.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Delete project"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {proj.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                        {proj.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">
                        Progress ({proj.completedTasks}/{proj.totalTasks} tasks)
                      </span>
                      <span className="font-bold text-[var(--text-main)]">{proj.progressPercentage}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] transition-all duration-300 rounded-full"
                        style={{ width: `${proj.progressPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. SHARED TASKS TAB */}
      {activeTab === 'tasks' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">Shared Team Tasks</h3>
              <p className="text-xs text-[var(--text-muted)]">Collaborative tasks assigned across the team</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="ALL">All Projects</option>
                {currentTeam?.projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsCreateTaskOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <IconPlus className="w-3.5 h-3.5" />
                New Task
              </button>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <IconCheckSquare className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
              <p className="text-xs text-[var(--text-muted)]">No tasks found for this project filter.</p>
              <button
                type="button"
                onClick={() => setIsCreateTaskOpen(true)}
                className="mt-3 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] text-[var(--accent-text)] cursor-pointer"
              >
                Create Team Task
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => {
                const isCompleted = task.status === 'COMPLETED';
                const isFixed = task.scheduleType === 'FIXED';
                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isCompleted
                        ? 'bg-[var(--bg-card)]/50 border-[var(--border-subtle)] opacity-70'
                        : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--accent)]/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => !isCompleted && handleCompleteTask(task.id)}
                        disabled={isCompleted}
                        className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                          isCompleted
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-[var(--border-subtle)] hover:border-[var(--accent)]'
                        }`}
                      >
                        {isCompleted && <IconCheck className="w-3.5 h-3.5" />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className={`text-sm font-semibold text-[var(--text-main)] ${
                              isCompleted ? 'line-through text-[var(--text-muted)]' : ''
                            }`}
                          >
                            {task.title}
                          </h4>

                          {/* Priority badge */}
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              task.priority === 'HIGH'
                                ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                                : task.priority === 'MEDIUM'
                                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                            }`}
                          >
                            {task.priority}
                          </span>

                          {/* Schedule Type */}
                          <span
                            className={`text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                              isFixed
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                                : 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                            }`}
                          >
                            {isFixed ? <IconLock className="w-3 h-3" /> : <IconUnlock className="w-3 h-3" />}
                            {task.scheduleType}
                          </span>

                          {/* Project Tag */}
                          {task.project && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)] flex items-center gap-1">
                              <IconFolder className="w-3 h-3" />
                              {task.project.name}
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1">
                            {task.description}
                          </p>
                        )}

                        {/* Assignees */}
                        {task.assignees && task.assignees.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="text-[11px] text-[var(--text-muted)]">Assigned:</span>
                            {task.assignees.map((a) => (
                              <span
                                key={a.id}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)]"
                              >
                                {a.user?.name || 'Member'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Task Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {!isCompleted && onStartFocus && (
                        <button
                          type="button"
                          onClick={() => onStartFocus(task)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <IconPlay className="w-3 h-3" />
                          Focus
                        </button>
                      )}

                      {onEditTask && (
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
                          title="Edit Task"
                        >
                          <IconEdit className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. MEMBERS TAB */}
      {activeTab === 'members' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">Team Roster</h3>
              <p className="text-xs text-[var(--text-muted)]">Manage team members, roles, and access</p>
            </div>
            {isAdminOrOwner && (
              <button
                type="button"
                onClick={() => setIsInviteOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <IconMail className="w-3.5 h-3.5" />
                Invite Member
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)]">
            {currentTeam?.members?.map((m) => {
              const isMe = m.role === currentTeam.myRole;
              const isTargetOwner = m.role === 'OWNER';
              return (
                <div key={m.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center font-bold text-sm">
                      {m.user?.name ? m.user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-main)]">{m.user?.name}</span>
                        {isTargetOwner && <IconCrown className="w-3.5 h-3.5 text-amber-500" />}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">{m.user?.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Role Selector (Owner only, cannot change self or owner) */}
                    {isOwner && !isTargetOwner ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    ) : (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          isTargetOwner
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                            : m.role === 'ADMIN'
                            ? 'bg-blue-500/15 border-blue-500/30 text-blue-500'
                            : 'bg-zinc-500/15 border-zinc-500/30 text-[var(--text-muted)]'
                        }`}
                      >
                        {m.role}
                      </span>
                    )}

                    {/* Remove Member Button */}
                    {isAdminOrOwner && !isTargetOwner && !isMe && (
                      <button
                        type="button"
                        onClick={() => setMemberToRemove(m)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Remove member"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. INVITATIONS TAB */}
      {activeTab === 'invitations' && isAdminOrOwner && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">Pending Invitations</h3>
              <p className="text-xs text-[var(--text-muted)]">Active invites awaiting acceptance</p>
            </div>
            <button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <IconMail className="w-3.5 h-3.5" />
              Invite Member
            </button>
          </div>

          {currentTeam?.invitations?.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <IconMail className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
              <p className="text-xs text-[var(--text-muted)]">No active invitations at this time.</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)]">
              {currentTeam?.invitations?.map((inv) => (
                <div key={inv.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-main)]">{inv.invitedEmail}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-500">
                        {inv.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Invited by {inv.createdBy?.name || 'Team Admin'} · Expires on {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRevokeInvitation(inv.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modals */}
      {/* 1. Remove Member Confirmation */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-500">
              <IconAlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold">Remove Member</h3>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-[var(--text-main)]">{memberToRemove.user?.name}</span> ({memberToRemove.user?.email}) from the team? They will immediately lose access and be unassigned from pending team tasks.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveMember}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white cursor-pointer"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Leave Team Confirmation */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-500">
              <IconLogOut className="w-5 h-5" />
              <h3 className="text-sm font-bold">Leave Team</h3>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Are you sure you want to leave <span className="font-semibold text-[var(--text-main)]">{currentTeam?.name}</span>? You will lose access to team projects and tasks.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeaveTeam}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white cursor-pointer"
              >
                Confirm Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Delete Team Confirmation */}
      {isDeleteTeamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-500">
              <IconTrash className="w-5 h-5" />
              <h3 className="text-sm font-bold">Delete Team</h3>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-[var(--text-main)]">{currentTeam?.name}</span>? All team projects, memberships, and team deliverables will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteTeamOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTeam}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white cursor-pointer"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateTeamModal
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
        onCreateTeam={handleCreateTeam}
      />

      <InviteMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        teamId={selectedTeamId}
        teamName={currentTeam?.name || ''}
        onInvite={handleInviteMember}
      />

      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        teamName={currentTeam?.name || ''}
        onCreateProject={handleCreateProject}
      />

      <CreateTeamTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        teamId={selectedTeamId}
        teamName={currentTeam?.name || ''}
        projects={currentTeam?.projects || []}
        members={currentTeam?.members || []}
        onCreateTask={handleCreateTeamTask}
      />
    </div>
  );
}
