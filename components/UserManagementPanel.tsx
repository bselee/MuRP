import React, { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import { UserPlusIcon, PencilSquareIcon, TrashIcon } from '../components/icons';
interface UserManagementPanelProps {
    currentUser: User;
    users: User[];
    onInviteUser: (email: string, role: User['role'], department: User['department']) => void;
    onUpdateUser: (updatedUser: User) => void;
    onDeleteUser: (userId: string) => void;
}

const UserManagementPanel: React.FC<UserManagementPanelProps> = ({ currentUser, users, onInviteUser, onUpdateUser, onDeleteUser }) => {
    const isOpsAdmin = currentUser.role === 'Admin' || currentUser.department === 'Operations';
    const [newUser, setNewUser] = useState({
        email: '',
        role: 'Staff' as User['role'],
        department: currentUser.department,
    });

    const handleInvite = () => {
        if (newUser.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email)) {
            onInviteUser(newUser.email, newUser.role, newUser.department);
            setNewUser({ email: '', role: 'Staff', department: currentUser.department });
        } else {
            alert('Please enter a valid email address.');
        }
    };

    const visibleUsers = useMemo(() => {
        if (isOpsAdmin) return users;
        return users.filter(u => u.department === currentUser.department);
    }, [users, currentUser, isOpsAdmin]);

    return (
        <div className="space-y-6">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">Invite New User</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-400">Email Address</label>
                        <input
                            type="email"
                            placeholder="new.user@goodestfungus.com"
                            value={newUser.email}
                            onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full bg-gray-700 p-2 rounded-md mt-1"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-400">Role</label>
                        <select
                            value={newUser.role}
                            onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value as User['role'] }))}
                            className="w-full bg-gray-700 p-2 rounded-md mt-1"
                        >
                            <option>Staff</option>
                            <option>Manager</option>
                            {isOpsAdmin && <option>Admin</option>}
                        </select>
                    </div>
                     <div>
                        <label className="text-sm font-medium text-gray-400">Department</label>
                        <select
                            value={newUser.department}
                            onChange={e => setNewUser(prev => ({ ...prev, department: e.target.value as User['department'] }))}
                            disabled={currentUser.role === 'Manager'}
                            className="w-full bg-gray-700 p-2 rounded-md mt-1 disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                            <option>Purchasing</option>
                            <option>Operations</option>
                            <option>MFG 1</option>
                            <option>MFG 2</option>
                            <option>Fulfillment</option>
                            <option>SHP/RCV</option>
                        </select>
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <Button onClick={handleInvite} leftIcon={<UserPlusIcon className="w-5 h-5" aria-hidden="true" />}>
                        Send Invite
                    </Button>
                </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg overflow-hidden border border-gray-700">
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Department</th>
                                <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                {isOpsAdmin && <th className="px-6 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {visibleUsers.map(user => (
                                <tr key={user.id}>
                                    <td className="px-6 py-1 whitespace-nowrap">
                                        <div className="text-sm font-medium text-white">{user.name}</div>
                                        <div className="text-xs text-gray-400">{user.email}</div>
                                    </td>
                                    <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">{user.role}</td>
                                    <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">{user.department}</td>
                                    <td className="px-6 py-1 whitespace-nowrap text-sm text-gray-300">
                                        {user.onboardingComplete === false ? (
                                            <span className="text-yellow-400 font-semibold">Pending Setup</span>
                                        ) : (
                                            <span className="text-green-400">Active</span>
                                        )}
                                    </td>
                                    {isOpsAdmin && (
                                        <td className="px-6 py-1 whitespace-nowrap text-sm space-x-2">
                                            <Button className="p-2 text-gray-400 hover:text-indigo-400 transition-colors" title="Edit User">
                                                <PencilSquareIcon className="w-5 h-5"/>
                                            </Button>
                                            <Button onClick={() => onDeleteUser(user.id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors" title="Remove User" disabled={user.id === currentUser.id}>
                                                <TrashIcon className="w-5 h-5"/>
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>
    );
};

export default UserManagementPanel;
