import React from 'react';
import { ChevronDownIcon } from './icons';

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
        className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden scroll-mt-20"
      >
        <button 
          onClick={onToggle} 
          className="w-full flex justify-between items-center p-4 bg-gray-800 hover:bg-gray-700/50 transition-colors"
        >
          <h2 className="text-xl font-semibold text-gray-300 flex items-center gap-3">
            {icon}
            {title}
          </h2>
          <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="p-4 md:p-6 border-t border-gray-700">
            {children}
          </div>
        )}
      </section>
    );
  }

  return (
    <section id={id}>
      <button 
        onClick={onToggle}
        className="w-full flex justify-between items-center text-left border-b border-gray-700 pb-3 hover:border-gray-600 transition-colors"
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
      </button>
      {isOpen && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </section>
  );
};

export default CollapsibleSection;
