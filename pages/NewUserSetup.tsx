import React, { useState } from 'react';
import type { User } from '../types';
import { BoxIcon, KeyIcon, MailIcon, GmailIcon } from '../components/icons';

interface NewUserSetupProps {
    user: User;
    onSetupComplete: () => void;
}

const NewUserSetup: React.FC<NewUserSetupProps> = ({ user, onSetupComplete }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!password || !confirmPassword) {
            setError('Please fill out both password fields.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        // In a real app, this would be an API call to set the password
        onSetupComplete();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
            <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                    <BoxIcon className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                    <h1 className="text-4xl font-bold text-white">Welcome to TGF MRP</h1>
                    <p className="text-gray-400 mt-2">Let's get your account set up, {user.name.split(' ')[0]}.</p>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 p-8 space-y-6">
                    <h2 className="text-xl font-semibold text-center text-white">Finalize Your Account</h2>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <MailIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="email"
                            value={user.email}
                            readOnly
                            className="w-full bg-gray-700/50 text-gray-300 rounded-md p-3 pl-10 cursor-not-allowed"
                        />
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                         <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <KeyIcon className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="password"
                                placeholder="Create Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-gray-700 text-white rounded-md p-3 pl-10"
                                required
                            />
                        </div>
                         <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <KeyIcon className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="password"
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="w-full bg-gray-700 text-white rounded-md p-3 pl-10"
                                required
                            />
                        </div>
                        {error && <p className="text-sm text-red-400">{error}</p>}
                        <button type="submit" className="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                            Complete Setup
                        </button>
                    </form>
                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-gray-600" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-gray-800 px-2 text-sm text-gray-400">Or sign up with</span>
                        </div>
                    </div>
                    <div>
                        <button onClick={onSetupComplete} className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3 px-4 rounded-md hover:bg-gray-200 transition-colors">
                            <GmailIcon className="w-5 h-5 text-[#DB4437]" />
                            Sign up with Google (Mock)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewUserSetup;
