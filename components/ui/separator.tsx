import React from 'react';

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Separator: React.FC<SeparatorProps> = ({
  className = '',
  ...props
}) => {
  return (
    <div
      className={`h-px bg-gray-200 ${className}`}
      {...props}
    />
  );
};