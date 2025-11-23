import React from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import { LogoutIcon, MushroomLogo, ChevronDownIcon } from './icons';
import AlertBell from './AlertBell';
import type { SystemAlert } from '../lib/systemAlerts/SystemAlertContext';
import { useTheme } from './ThemeProvider';

interface HeaderProps {
    currentUser: User;
    onLogout: () => void;
    isGlobalLoading: boolean;
    showLogo: boolean;
    devModeActive?: boolean;
    systemAlerts: SystemAlert[];
    onDismissAlert: (idOrSource: string) => void;
    onQuickRequest: () => void;
    canGoBack?: boolean;
    onGoBack?: () => void;
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
    canGoBack = false,
    onGoBack,
}) => {
    const { resolvedTheme } = useTheme();
    const isLight = resolvedTheme === 'light';
    const headerClasses = isLight
        ? 'bg-white/85 text-amber-900 border-amber-900/10 shadow-[0_12px_35px_rgba(15,23,42,0.08)]'
        : 'bg-gray-800/50 text-white border-gray-700';
    const statusTextClass = isLight ? 'text-amber-900/70' : 'text-gray-500';
    const devBadgeClass = isLight
        ? 'border-yellow-600/30 bg-yellow-200/40 text-yellow-900'
        : 'border-yellow-400/40 bg-yellow-400/10 text-yellow-200';
    const userNameClass = isLight ? 'text-amber-900' : 'text-white';
    const userDeptClass = isLight ? 'text-amber-900/70' : 'text-gray-400';
    const avatarClass = isLight
        ? 'bg-amber-200 text-amber-900'
        : 'bg-gray-600 text-white';
    const logoutButtonClass = isLight
        ? 'text-amber-800 hover:bg-amber-100'
        : 'text-gray-400 hover:bg-gray-700 hover:text-white';
    const backButtonClass = isLight
        ? 'text-amber-900 border border-amber-300 hover:bg-amber-100'
        : 'text-gray-100 border border-gray-600 hover:bg-gray-700';

    return (
        <header className={`h-16 backdrop-blur-sm border-b flex items-center justify-between px-4 sm:px-6 lg:px-8 flex-shrink-0 transition-colors duration-300 ${headerClasses}`}>
            <div className="flex items-center gap-3 min-w-[120px]">
                {canGoBack && onGoBack && (
                    <Button
                        onClick={onGoBack}
                        className={`text-xs sm:text-sm px-3 py-1.5 rounded-md inline-flex items-center gap-1 transition-colors ${backButtonClass}`}
                        title="Go back to previous screen"
                    >
                        <ChevronDownIcon className="w-4 h-4 -rotate-90" />
                        Back
                    </Button>
                )}
                {showLogo && (
                    <h1 className={`text-4xl font-extrabold tracking-wide ${isLight ? 'text-amber-900' : 'text-indigo-200'}`}>MuRP</h1>
                )}
            </div>
                <div className="flex items-center space-x-4">
                    <span className={`text-xs hidden sm:block ${statusTextClass}`}>
                        {isGlobalLoading ? 'Loading data…' : 'Live data syncing quietly'}
                    </span>
                    {devModeActive && (
                        <span className={`hidden sm:inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${devBadgeClass}`}>
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
                        <div className={`text-sm font-semibold ${userNameClass}`}>{currentUser.name}</div>
                        <div className={`text-xs ${userDeptClass}`}>{currentUser.department}</div>
                    </div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${avatarClass}`}>
                        {currentUser.name.charAt(0)}
                    </div>
                    <Button onClick={onLogout} title="Logout" className={`p-2 rounded-full transition-colors ${logoutButtonClass}`}>
                        <LogoutIcon className="h-6 w-6" />
                    </Button>
                </div>
            </div>
        </header>
    );
};

export default Header;
