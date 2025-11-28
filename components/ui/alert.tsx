import React from 'react';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

export const Alert: React.FC<AlertProps> = ({
  className = '',
  variant = 'default',
  children,
  ...props
}) => {
  const variantClasses = {
    default: 'bg-blue-50 border-blue-200 text-blue-800',
    destructive: 'bg-red-50 border-red-200 text-red-800'
  };

  return (
    <div
      className={`p-4 border rounded-md ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const AlertDescription: React.FC<AlertDescriptionProps> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p
      className={`text-sm ${className}`}
      {...props}
    >
      {children}
    </p>
  );
};