import React from 'react';
import { ChevronDownIcon } from './icons';

import Button from '@/components/ui/Button';
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
  id?: string; // Optional ID for scroll-to functionality
  variant?: 'default' | 'card'; // Style variant
}

/**
 * Reusable collapsible section component
 * Provides consistent styling and animation for expandable sections
 * 
 * Variants:
 * - 'default': Simple border-bottom style (Settings page)
 * - 'card': Full card with background (Dashboard page)
 */
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  iconColor = 'text-indigo-400',
  isOpen,
  onToggle,
  children,
  id,
  variant = 'default',
}) => {
  if (variant === 'card') {
    return (
      <section
        id={id}
        className="glass-panel overflow-hidden scroll-mt-20"
      >
        <Button
          variant="ghost"
          onClick={onToggle}
          className="w-full flex justify-between items-center px-5 py-4 rounded-none bg-transparent hover:bg-white/5 border-b border-white/5"
        >
          <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-3">
            {icon}
            {title}
          </h2>
          <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
        {isOpen && (
          <div className="p-5 md:p-6">
            {children}
          </div>
        )}
      </section>
    );
  }

  return (
    <section id={id}>
      <Button
        onClick={onToggle}
        variant="ghost"
        className="w-full flex justify-between items-center text-left border-b border-white/10 pb-3 hover:border-white/20"
      >
        <div className="flex items-center gap-3">
          <div className={`w-6 h-6 ${iconColor}`}>
            {icon}
          </div>
          <h2 className="text-xl font-semibold text-gray-300">{title}</h2>
        </div>
        <ChevronDownIcon 
          className={`w-6 h-6 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </Button>
      {isOpen && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </section>
  );
};

export default CollapsibleSection;
