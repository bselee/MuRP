import React from 'react';
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
  if (!isOpen) return null;

  const sizeClasses = size === 'large' ? 'max-w-7xl' : 'max-w-4xl';

  return (
    <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-[6px] z-50 flex items-center justify-center p-4"
        onClick={onClose}
        aria-modal="true"
        role="dialog"
    >
      <div
        className={`glass-panel w-full ${sizeClasses} max-h-[90vh] flex flex-col border border-white/10`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0 bg-white/5/10">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
            )}
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
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
