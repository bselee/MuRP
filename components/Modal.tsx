import React, { useEffect, useRef, useId } from 'react';
import { CloseIcon } from './icons';

import Button from '@/components/ui/Button';
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'default' | 'large';
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'default'
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  // Focus trap: keep focus within modal when open
  useEffect(() => {
    if (!isOpen) return;

    const modalElement = modalRef.current;
    if (!modalElement) return;

    // Store previously focused element to restore later
    const previouslyFocused = document.activeElement as HTMLElement;

    // Focus the modal container
    modalElement.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableElements = modalElement.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = size === 'large' ? 'max-w-7xl' : 'max-w-4xl';

  return (
    <div
        ref={modalRef}
        tabIndex={-1}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-[6px] z-50 flex items-center justify-center p-4"
        onClick={onClose}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        role="dialog"
    >
      <div
        className={`glass-panel w-full ${sizeClasses} max-h-[90vh] flex flex-col border border-white/10`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0 bg-white/5/10">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-xl font-semibold text-white">{title}</h2>
            {subtitle && (
              <p id={subtitleId} className="text-sm text-gray-400 mt-1">{subtitle}</p>
            )}
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            aria-label="Close modal"
            className="p-2 rounded-full text-gray-400 hover:text-white transition-colors ml-4 flex-shrink-0"
          >
            <CloseIcon className="w-6 h-6" />
          </Button>
        </header>
        <main className="p-6 overflow-y-auto flex-grow">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Modal;
