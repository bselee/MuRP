import React from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import { LogoutIcon, MushroomLogo } from './icons';
import AlertBell from './AlertBell';
import type { SystemAlert } from '../lib/systemAlerts/SystemAlertContext';

interface HeaderProps {
    currentUser: User;
    onLogout: () => void;
    isGlobalLoading: boolean;
    showLogo: boolean;
    devModeActive?: boolean;
    systemAlerts: SystemAlert[];
    onDismissAlert: (idOrSource: string) => void;
    onQuickRequest: () => void;
}

const Header: React.FC<HeaderProps> = ({
    currentUser,
    onLogout,
    isGlobalLoading,
    showLogo,
    devModeActive,
    systemAlerts,
    onDismissAlert,
    onQuickRequest,
}) => {
    return (
        <header className="h-16 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 flex items-center justify-between px-4 sm:px-6 lg:px-8 flex-shrink-0">
            <div className="flex items-center min-w-[120px]">
                {showLogo && (
                    <h1 className="text-4xl font-extrabold tracking-wide text-indigo-200">MuRP</h1>
                )}
            </div>
                <div className="flex items-center space-x-4">
                    <span className="text-xs text-gray-500 hidden sm:block">
                        {isGlobalLoading ? 'Loading data…' : 'Live data syncing quietly'}
                    </span>
                    {devModeActive && (
                        <span className="hidden sm:inline-flex items-center rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-yellow-200">
                            Dev Mode
                        </span>
                    )}
                    <Button
                        onClick={onQuickRequest}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                    >
                        Ask About Product
                    </Button>
                    <AlertBell alerts={systemAlerts} onDismiss={onDismissAlert} />
                <div className="flex items-center space-x-3">
                    <div className="text-right">
                        <div className="text-sm font-semibold text-white">{currentUser.name}</div>
                        <div className="text-xs text-gray-400">{currentUser.department}</div>
                    </div>
                    <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-lg font-bold text-white">
                        {currentUser.name.charAt(0)}
                    </div>
                    <Button onClick={onLogout} title="Logout" className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
                        <LogoutIcon className="h-6 w-6" />
                    </Button>
                </div>
            </div>
        </header>
    );
};

export default Header;
