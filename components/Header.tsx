import React from 'react';
import type { User } from '../types';
import { BellIcon, LogoutIcon, MushroomLogo } from './icons';
import DataSyncIndicator from './DataSyncIndicator';

interface HeaderProps {
    currentUser: User;
    onLogout: () => void;
    isGlobalLoading: boolean;
    showLogo: boolean;
    devModeActive?: boolean;
}

const Header: React.FC<HeaderProps> = ({ currentUser, onLogout, isGlobalLoading, showLogo, devModeActive }) => {
    return (
        <header className="h-16 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 flex items-center justify-between px-4 sm:px-6 lg:px-8 flex-shrink-0">
            <div className="flex items-center min-w-[120px]">
                {showLogo && (
                    <div className="flex items-center gap-3">
                        <MushroomLogo className="w-9 h-9 text-indigo-300" />
                        <h1 className="text-3xl font-bold tracking-wide text-indigo-200">MuRP</h1>
                    </div>
                )}
            </div>
                <div className="flex items-center space-x-4">
                    <div className="hidden sm:block">
                        <DataSyncIndicator isGlobalLoading={isGlobalLoading} />
                    </div>
                    {devModeActive && (
                        <span className="hidden sm:inline-flex items-center rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-yellow-200">
                            Dev Mode
                        </span>
                    )}
                    <button className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
                        <BellIcon className="h-6 w-6" />
                </button>
                <div className="flex items-center space-x-3">
                    <div className="text-right">
                        <div className="text-sm font-semibold text-white">{currentUser.name}</div>
                        <div className="text-xs text-gray-400">{currentUser.department}</div>
                    </div>
                    <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-lg font-bold text-white">
                        {currentUser.name.charAt(0)}
                    </div>
                    <button onClick={onLogout} title="Logout" className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
                        <LogoutIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;
