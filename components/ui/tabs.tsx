import React, { useState, createContext, useContext } from 'react';
import { useTheme } from '@/components/ThemeProvider';

interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

interface TabsProps {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  defaultValue,
  children,
  className = ''
}) => {
  const [value, setValue] = useState(defaultValue);

  return (
    <TabsContext.Provider value={{ value, onValueChange: setValue }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> { }

export const TabsList: React.FC<TabsListProps> = ({
  className = '',
  children,
  ...props
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div
      className={`flex space-x-1 p-1 rounded-lg ${isDark ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-100'
        } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({
  className = '',
  value,
  children,
  ...props
}) => {
  const context = useContext(TabsContext);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const isActive = context.value === value;

  return (
    <button
      className={`px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${isActive
          ? (isDark
            ? 'bg-accent-500 text-white shadow-sm'
            : 'bg-white text-gray-900 shadow-sm')
          : (isDark
            ? 'text-gray-400 hover:text-white hover:bg-white/5'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50')
        } ${className}`}
      onClick={() => context.onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  );
};

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent: React.FC<TabsContentProps> = ({
  className = '',
  value,
  children,
  ...props
}) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  if (context.value !== value) return null;

  return (
    <div className={`mt-2 ${className}`} {...props}>
      {children}
    </div>
  );
};