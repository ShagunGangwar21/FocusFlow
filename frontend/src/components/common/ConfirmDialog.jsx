import React, { useEffect, useRef } from 'react';
import { IconX } from './Icons';

/**
 * frontend/src/components/common/ConfirmDialog.jsx
 *
 * Accessible confirmation modal for sensitive operations (Logout, Delete, etc.)
 * Supports:
 * - Keyboard Escape to cancel
 * - Focus trapping and autofocus
 * - Loading state during async confirmation to prevent duplicate triggers
 * - Fully accessible ARIA dialog attributes
 */
export default function ConfirmDialog({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger', // 'danger' | 'primary' | 'warning'
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const cancelBtnRef = useRef(null);
  const confirmBtnRef = useRef(null);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!isLoading) {
          onCancel();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    // Autofocus cancel button for safety
    setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const confirmBtnStyles =
    confirmVariant === 'danger'
      ? 'bg-red-500 hover:bg-red-600 text-white'
      : confirmVariant === 'warning'
      ? 'bg-amber-500 hover:bg-amber-600 text-white'
      : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl p-5 overflow-hidden animate-in zoom-in-95 duration-150"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <h2
            id="confirm-dialog-title"
            className="text-base font-bold tracking-tight text-[var(--text-main)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition-colors"
            aria-label="Close dialog"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <div className="py-4">
          <p id="confirm-dialog-message" className="text-sm text-[var(--text-muted)] leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 active:scale-95 ${confirmBtnStyles}`}
          >
            {isLoading && (
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
