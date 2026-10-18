import React, { useState } from 'react';
import { IconX, IconUserPlus, IconCopy, IconCheck, IconShield, IconUsers } from '../common/Icons';

export default function InviteMemberModal({ isOpen, onClose, teamId, teamName, onInvite }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await onInvite({ email: email.trim(), role });
      setInviteResult(res);
      setEmail('');
    } catch (err) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyToken = () => {
    if (!inviteResult?.token) return;
    navigator.clipboard.writeText(inviteResult.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleClose = () => {
    setInviteResult(null);
    setError(null);
    setEmail('');
    setCopied(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconUserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)]">Invite Team Member</h2>
              <p className="text-xs text-[var(--text-muted)]">to {teamName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
            {error}
          </div>
        )}

        {/* Success / Token Display */}
        {inviteResult ? (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
                <IconCheck className="w-4 h-4" />
                Invitation Created Successfully!
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                An invitation was issued for <span className="font-medium text-[var(--text-main)]">{inviteResult.invitedEmail}</span> as <span className="font-semibold text-[var(--accent)]">{inviteResult.role}</span>.
              </p>
              <div className="mt-3">
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Invitation Token (Valid for 7 days)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteResult.token}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    {copied ? (
                      <>
                        <IconCheck className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <IconCopy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Invite Form */
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Member Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Role Permission
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('MEMBER')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                    role === 'MEMBER'
                      ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text-main)]'
                      : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <IconUsers className="w-4 h-4 text-[var(--accent)]" />
                    Member
                  </div>
                  <span className="text-[11px] leading-tight">View & work on assigned projects and tasks</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('ADMIN')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                    role === 'ADMIN'
                      ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text-main)]'
                      : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <IconShield className="w-4 h-4 text-[var(--accent)]" />
                    Admin
                  </div>
                  <span className="text-[11px] leading-tight">Invite members, manage projects, assign tasks</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[var(--accent-text)] border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Invitation'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
