import React from 'react';
import type { User } from '../types';
import { SearchIcon, BellIcon, LogoutIcon } from './icons';

interface HeaderProps {
    currentUser: User;
    onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentUser, onLogout }) => {
    return (
        <header className="h-16 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 flex items-center justify-between px-4 sm:px-6 lg:px-8 flex-shrink-0">
            <div className="flex items-center">
                {/* Search can be hidden on small screens if needed */}
            </div>
            <div className="flex items-center space-x-4">
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