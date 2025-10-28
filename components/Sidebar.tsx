import React from 'react';
import type { Page } from '../App';
import { HomeIcon, PackageIcon, DocumentTextIcon, UsersIcon, LightBulbIcon, CogIcon, BoxIcon, ChevronDoubleLeftIcon, WrenchScrewdriverIcon } from './icons';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    isCollapsed: boolean;
    onToggle: () => void;
}

const NavItem: React.FC<{
    page: Page;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    icon: React.ReactNode;
    isCollapsed: boolean;
}> = ({ page, currentPage, setCurrentPage, icon, isCollapsed }) => (
    <li>
        <a
            href="#"
            onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
            className={`flex items-center p-2 text-base font-normal rounded-lg transition-colors duration-150 group ${
                currentPage === page 
                ? 'bg-gray-700 text-white' 
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            } ${isCollapsed ? 'justify-center' : ''}`}
        >
            {icon}
            <span className={`ml-3 whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>{page}</span>
        </a>
    </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isCollapsed, onToggle }) => {
    const navItems: { page: Page; icon: React.ReactNode }[] = [
        { page: 'Dashboard', icon: <HomeIcon className="w-6 h-6" /> },
        { page: 'Planning & Forecast', icon: <LightBulbIcon className="w-6 h-6" /> },
        { page: 'Production', icon: <WrenchScrewdriverIcon className="w-6 h-6" /> },
        { page: 'Inventory', icon: <PackageIcon className="w-6 h-6" /> },
        { page: 'Purchase Orders', icon: <DocumentTextIcon className="w-6 h-6" /> },
        { page: 'Vendors', icon: <UsersIcon className="w-6 h-6" /> },
    ];

    return (
        <aside className={`bg-gray-800 border-r border-gray-700 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
            <div className={`h-16 flex items-center border-b border-gray-700 relative ${isCollapsed ? 'justify-center' : 'px-4'}`}>
                <BoxIcon className={`w-8 h-8 text-indigo-400 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-2'}`} />
                <h1 className={`text-xl font-bold text-white tracking-tight whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>TGF MRP</h1>
                <button 
                    onClick={onToggle} 
                    className="absolute -right-3 top-1/2 -translate-y-1/2 bg-gray-600 hover:bg-indigo-600 text-white rounded-full p-1 border-2 border-gray-800 transition-transform"
                >
                    <ChevronDoubleLeftIcon className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
                </button>
            </div>
            <nav className="flex-1 px-2 py-4 space-y-2">
                <ul>
                    {navItems.map(item => (
                        <NavItem
                            key={item.page}
                            page={item.page}
                            currentPage={currentPage}
                            setCurrentPage={setCurrentPage}
                            icon={item.icon}
                            isCollapsed={isCollapsed}
                        />
                    ))}
                </ul>
            </nav>
            <div className="px-2 py-4 mt-auto border-t border-gray-700">
                <ul>
                    <NavItem
                        page="Settings"
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                        icon={<CogIcon className="w-6 h-6" />}
                        isCollapsed={isCollapsed}
                    />
                </ul>
            </div>
        </aside>
    );
};

export default Sidebar;