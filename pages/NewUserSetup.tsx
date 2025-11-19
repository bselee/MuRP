import React, { useState, useEffect } from 'react';
import type { User } from '../types';
import { BoxIcon, KeyIcon, MailIcon, GmailIcon } from '../components/icons';
import { supabase } from '../lib/supabase/client';

interface NewUserSetupProps {
    user: User;
    onSetupComplete: () => void;
}

const NewUserSetup: React.FC<NewUserSetupProps> = ({ user, onSetupComplete }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Auto-complete onboarding if user has already confirmed their email
    // (meaning they set a password during signup)
    useEffect(() => {
        const checkAndAutoComplete = async () => {
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                
                // If user's email is confirmed, they already set their password during signup
                // Just mark them as onboarded and skip this screen
                if (authUser?.email_confirmed_at) {
                    console.log('[NewUserSetup] Email already confirmed, auto-completing onboarding...');
                    await supabase
                        .from('user_profiles')
                        .update({ onboarding_complete: true })
                        .eq('id', user.id);
                    onSetupComplete();
                }
            } catch (err) {
                console.error('[NewUserSetup] Error checking email confirmation:', err);
            }
        };

        checkAndAutoComplete();
    }, [user.id, onSetupComplete]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!password || !confirmPassword) {
            setError('Please fill out both password fields.');
            return;
        }
        if (password.length < 12) {
            setError('Password must be at least 12 characters long for compliance.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        try {
            setLoading(true);
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            onSetupComplete();
        } catch (err: any) {
            setError(err.message ?? 'Failed to set password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
            <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white">Welcome to MuRP</h1>
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
