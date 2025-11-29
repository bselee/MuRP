import React, { useState, useEffect } from 'react';
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
    canGoBack = false,
    onGoBack,
}) => {
    const { resolvedTheme } = useTheme();
    const isLight = resolvedTheme === 'light';

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const formattedTime = `${currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    const statusText = isGlobalLoading ? 'Loading data…' : `Syncing · ${formattedTime}`;
    const headerClasses = isLight
        ? 'bg-white/85 text-amber-900 border-amber-900/10 shadow-[0_12px_35px_rgba(15,23,42,0.08)]'
        : 'bg-gray-800/50 text-white border-gray-700';
    const statusTextClass = isLight ? 'text-amber-900/70' : 'text-gray-500';
    const devBadgeClass = isLight
        ? 'border-yellow-600/30 bg-yellow-200/40 text-yellow-900'
        : 'border-yellow-400/40 bg-yellow-400/10 text-yellow-200';
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
                        {statusText}
                    </span>
                    {devModeActive && (
                        <span className={`hidden sm:inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${devBadgeClass}`}>
                            Dev Mode
                        </span>
                    )}
                    <AlertBell alerts={systemAlerts} onDismiss={onDismissAlert} />
                </div>
        </header>
    );
};

export default Header;
