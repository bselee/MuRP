import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import Button from './ui/Button';
import { UserIcon, ShieldCheckIcon } from './icons';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'Staff' | 'Manager' | 'Admin' | 'SuperAdmin';
  department: string;
  onboarding_complete: boolean;
  created_at: string;
}

const AdminUsersPanel: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setUsers(data || []);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      setUpdating(userId);
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) throw updateError;

      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
    } catch (err: any) {
      setError(`Failed to update role: ${err.message}`);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return <div className="text-center text-gray-400">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ShieldCheckIcon className="w-5 h-5 text-amber-400" />
          User Management
        </h3>

        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 bg-gray-700/50 border border-gray-600 rounded-lg hover:border-gray-500 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <UserIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <p className="font-semibold text-white truncate">{user.full_name}</p>
                  {user.id === currentUserId && (
                    <span className="px-2 py-1 text-xs bg-amber-600/80 text-amber-100 rounded-full">
                      You
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 truncate">{user.email}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {user.department} • Joined {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <select
                  value={user.role}
                  onChange={(e) => updateRole(user.id, e.target.value)}
                  disabled={updating === user.id}
                  className="px-3 py-2 bg-gray-600 text-white border border-gray-500 rounded text-sm hover:border-gray-400 disabled:opacity-50"
                >
                  <option value="Staff">Staff</option>
                  <option value="Manager">Manager</option>
                  <option value="Admin">Admin</option>
                  <option value="SuperAdmin">SuperAdmin</option>
                </select>
                <span className="text-xs text-gray-400 min-w-fit px-2">
                  {user.role === 'Admin' || user.role === 'SuperAdmin' ? '👤 Admin' : '👤 User'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg text-blue-200 text-sm">
          <p className="font-semibold mb-2">💡 Role Guide</p>
          <ul className="space-y-1 text-xs">
            <li><strong>Admin:</strong> Full access to all features and settings</li>
            <li><strong>Manager:</strong> Can view and manage orders, inventory, BOMs</li>
            <li><strong>Staff:</strong> Limited access based on department</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminUsersPanel;
