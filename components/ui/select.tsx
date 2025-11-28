import React, { useState } from 'react';

interface SelectProps {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}

export const Select: React.FC<SelectProps> = ({ children, value, onValueChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {React.Children.map(children, (child) =>
        React.isValidElement(child) && child.type === SelectTrigger
          ? React.cloneElement(child, {
              onClick: () => setIsOpen(!isOpen),
              children: React.Children.map(child.props.children, (triggerChild) =>
                React.isValidElement(triggerChild) && triggerChild.type === SelectValue
                  ? React.cloneElement(triggerChild, { value })
                  : triggerChild
              )
            })
          : child.type === SelectContent
          ? React.cloneElement(child, { isOpen })
          : child
      )}
    </div>
  );
};

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const SelectTrigger: React.FC<SelectTriggerProps> = ({ children, className = '', onClick }) => {
  return (
    <button
      type="button"
      className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

interface SelectValueProps {
  placeholder?: string;
  value?: string;
}

export const SelectValue: React.FC<SelectValueProps> = ({ placeholder, value }) => {
  return <span>{value || placeholder}</span>;
};

interface SelectContentProps {
  children: React.ReactNode;
  isOpen?: boolean;
}

export const SelectContent: React.FC<SelectContentProps> = ({ children, isOpen }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
      {children}
    </div>
  );
};

interface SelectItemProps {
  children: React.ReactNode;
  value: string;
  onClick?: () => void;
}

export const SelectItem: React.FC<SelectItemProps> = ({ children, value, onClick }) => {
  return (
    <div
      className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
      onClick={onClick}
    >
      {children}
    </div>
  );
};