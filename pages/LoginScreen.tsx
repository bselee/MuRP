import React from 'react';
import type { User } from '../types';
import { MushroomLogo, UsersIcon } from '../components/icons';

interface LoginScreenProps {
  users: User[];
  onLogin: (user: User) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ users, onLogin }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <MushroomLogo className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white">MuRP</h1>
          <p className="text-gray-400 mt-2">Please select your user profile to continue.</p>
        </div>
        
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 p-8 space-y-4">
          <h2 className="text-xl font-semibold text-center text-white">Select User</h2>
          {users.map(user => (
            <button
              key={user.id}
              onClick={() => onLogin(user)}
              className="w-full flex items-center text-left p-4 bg-gray-700 rounded-lg hover:bg-indigo-600 transition-colors group"
            >
              <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-lg font-bold text-white mr-4 group-hover:bg-indigo-500">
                {user.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-white">{user.name}</p>
                <p className="text-sm text-gray-400">{user.role} - {user.department}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;