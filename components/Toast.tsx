import React, { useEffect, useState } from 'react';
import type { ToastInfo } from '../App';
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon, CloseIcon } from './icons';

interface ToastProps extends ToastInfo {
  onClose: () => void;
}

const icons = {
  success: <CheckCircleIcon className="w-6 h-6 text-green-400" />,
  error: <XCircleIcon className="w-6 h-6 text-red-400" />,
  info: <InformationCircleIcon className="w-6 h-6 text-blue-400" />,
};

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, 4500); // Start fade-out before removal

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 500); // Wait for animation to finish
  };
  
  return (
    <div 
        className={`
            mb-4 flex items-start w-full max-w-sm p-4 rounded-lg shadow-lg 
            bg-gray-800/80 backdrop-blur-xl border border-gray-700
            transition-all duration-500 ease-in-out
            ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
        `}
        role="alert"
    >
      <div className="flex-shrink-0">{icons[type]}</div>
      <div className="ml-3 text-sm font-medium text-gray-200">
        {message}
      </div>
      <button 
        type="button" 
        className="ml-auto -mx-1.5 -my-1.5 p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg inline-flex h-8 w-8" 
        onClick={handleClose}
        aria-label="Close"
      >
        <span className="sr-only">Close</span>
        <CloseIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default Toast;