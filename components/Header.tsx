import React from 'react';
import { SearchIcon, BellIcon } from './icons';

const Header: React.FC = () => {
    return (
        <header className="h-16 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 flex items-center justify-between px-4 sm:px-6 lg:px-8 flex-shrink-0">
            <div className="flex items-center">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <SearchIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search..."
                        className="bg-gray-700 text-white placeholder-gray-400 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
                    />
                </div>
            </div>
            <div className="flex items-center space-x-4">
                <button className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
                    <BellIcon className="h-6 w-6" />
                </button>
                <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
                    A
                </div>
            </div>
        </header>
    );
};

export default Header;
