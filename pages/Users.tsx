
import React, { useState } from 'react';
import type { User } from '../types';
import { UserPlusIcon, PencilSquareIcon, TrashIcon } from '../components/icons';

interface UsersProps {
    users: User[];
    onInviteUser: (email: string, role: User['role'], department: User['department']) => void;
    onUpdateUser: (updatedUser: User) => void;
    onDeleteUser: (userId: string) => void;
}

const Users: React.FC<UsersProps> = ({ users, onInviteUser, onUpdateUser, onDeleteUser }) => {
    const [newUser, setNewUser] = useState({
        email: '',
        role: 'Staff' as User['role'],
        department: 'Fulfillment' as User['department'],
    });

    const handleInvite = () => {
        if (newUser.email) {
            onInviteUser(newUser.email, newUser.role, newUser.department);
            setNewUser({ email: '', role: 'Staff', department: 'Fulfillment' });
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-white tracking-tight">User Management</h1>
                <p className="text-gray-400 mt-1">Onboard new users and manage existing user permissions.</p>
            </header>

            <section className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-semibold text-gray-200 mb-4">Invite New User</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-400">Email Address</label>
                        <input
                            type="email"
                            placeholder="new.user@example.com"
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
                            <option>Admin</option>
                        </select>
                    </div>
                     <div>
                        <label className="text-sm font-medium text-gray-400">Department</label>
                        <select
                            value={newUser.department}
                            onChange={e => setNewUser(prev => ({ ...prev, department: e.target.value as User['department'] }))}
                            className="w-full bg-gray-700 p-2 rounded-md mt-1"
                        >
                            <option>Purchasing</option>
                            <option>MFG 1</option>
                            <option>MFG 2</option>
                            <option>Fulfillment</option>
                            <option>SHP/RCV</option>
                        </select>
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button onClick={handleInvite} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                        <UserPlusIcon className="w-5 h-5" />
                        Send Invite
                    </button>
                </div>
            </section>

            <section className="bg-gray-800/50 backdrop-blur-sm rounded-lg overflow-hidden border border-gray-700">
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Department</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-white">{user.name}</div>
                                        <div className="text-xs text-gray-400">{user.email}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.department}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                                        <button className="p-2 text-gray-400 hover:text-indigo-400 transition-colors" title="Edit User">
                                            <PencilSquareIcon className="w-5 h-5"/>
                                        </button>
                                        <button onClick={() => onDeleteUser(user.id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors" title="Remove User">
                                            <TrashIcon className="w-5 h-5"/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </section>
        </div>
    );
};

export default Users;
