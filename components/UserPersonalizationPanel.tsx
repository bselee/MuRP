import React, { useState, useRef } from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import { UserIcon, PhotoIcon, GlobeIcon, BellIcon, CogIcon } from '../components/icons';

interface UserPersonalizationPanelProps {
    currentUser: User;
    onUpdateUser: (updatedUser: User) => void;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AVATAR_COLORS = [
    '#3B82F6', // Blue
    '#EF4444', // Red
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
];

const TIMEZONES = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'UTC', label: 'UTC' },
];

const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
];

const UserPersonalizationPanel: React.FC<UserPersonalizationPanelProps> = ({
    currentUser,
    onUpdateUser,
    addToast
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [displayName, setDisplayName] = useState(currentUser.preferences?.displayName || currentUser.name);
    const [bio, setBio] = useState(currentUser.preferences?.bio || '');
    const [timezone, setTimezone] = useState(currentUser.preferences?.timezone || 'America/New_York');
    const [language, setLanguage] = useState(currentUser.preferences?.language || 'en');
    const [emailNotifications, setEmailNotifications] = useState(currentUser.preferences?.notifications?.email ?? true);
    const [browserNotifications, setBrowserNotifications] = useState(currentUser.preferences?.notifications?.browser ?? true);
    const [mobileNotifications, setMobileNotifications] = useState(currentUser.preferences?.notifications?.mobile ?? false);
    const [selectedAvatarColor, setSelectedAvatarColor] = useState(currentUser.avatar?.color || AVATAR_COLORS[0]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            addToast('Please select a valid image file.', 'error');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            addToast('Image file size must be less than 5MB.', 'error');
            return;
        }

        setIsLoading(true);
        try {
            // In a real implementation, you'd upload to a storage service
            // For now, we'll create a data URL for demo purposes
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                const updatedUser = {
                    ...currentUser,
                    avatar: {
                        ...currentUser.avatar,
                        url: dataUrl,
                        color: selectedAvatarColor,
                    }
                };
                onUpdateUser(updatedUser);
                addToast('Avatar updated successfully!', 'success');
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Error uploading avatar:', error);
            addToast('Failed to upload avatar. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAvatarColorChange = (color: string) => {
        setSelectedAvatarColor(color);
        const updatedUser = {
            ...currentUser,
            avatar: {
                ...currentUser.avatar,
                color,
                initials: getInitials(displayName),
            }
        };
        onUpdateUser(updatedUser);
    };

    const handleSavePreferences = () => {
        setIsLoading(true);
        try {
            const updatedUser = {
                ...currentUser,
                preferences: {
                    ...currentUser.preferences,
                    displayName,
                    bio,
                    timezone,
                    language,
                    notifications: {
                        email: emailNotifications,
                        browser: browserNotifications,
                        mobile: mobileNotifications,
                    },
                },
                avatar: {
                    ...currentUser.avatar,
                    color: selectedAvatarColor,
                    initials: getInitials(displayName),
                }
            };
            onUpdateUser(updatedUser);
            addToast('Personalization settings saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving preferences:', error);
            addToast('Failed to save preferences. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const currentAvatar = currentUser.avatar?.url || null;
    const currentInitials = currentUser.avatar?.initials || getInitials(displayName);

    return (
        <div className="space-y-8">
            {/* Profile Header */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-blue-400" />
                    Profile & Avatar
                </h3>

                <div className="flex items-start gap-6">
                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            {currentAvatar ? (
                                <img
                                    src={currentAvatar}
                                    alt="Profile avatar"
                                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-600"
                                />
                            ) : (
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-xl border-2 border-gray-600"
                                    style={{ backgroundColor: selectedAvatarColor }}
                                >
                                    {currentInitials}
                                </div>
                            )}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute -bottom-1 -right-1 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors"
                                disabled={isLoading}
                            >
                                <PhotoIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                        />

                        {/* Color Picker */}
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-xs text-gray-400 uppercase font-semibold">Avatar Color</span>
                            <div className="flex gap-2">
                                {AVATAR_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => handleAvatarColorChange(color)}
                                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                                            selectedAvatarColor === color
                                                ? 'border-white scale-110'
                                                : 'border-gray-600 hover:border-gray-400'
                                        }`}
                                        style={{ backgroundColor: color }}
                                        disabled={isLoading}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Profile Info */}
                    <div className="flex-1 space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-400 uppercase">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-3 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                                placeholder="Your display name"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-gray-400 uppercase">Bio</label>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                rows={3}
                                className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-3 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
                                placeholder="Tell us a bit about yourself..."
                                maxLength={200}
                            />
                            <p className="text-xs text-gray-500 mt-1">{bio.length}/200 characters</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Preferences */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <CogIcon className="w-5 h-5 text-green-400" />
                    Preferences
                </h3>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Localization */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                            <GlobeIcon className="w-4 h-4" />
                            Localization
                        </h4>

                        <div>
                            <label className="text-xs font-semibold text-gray-400 uppercase">Timezone</label>
                            <select
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-3 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                            >
                                {TIMEZONES.map((tz) => (
                                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-gray-400 uppercase">Language</label>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full bg-gray-900/60 border border-gray-700 rounded-md p-3 text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                            >
                                {LANGUAGES.map((lang) => (
                                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Notifications */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                            <BellIcon className="w-4 h-4" />
                            Notifications
                        </h4>

                        <div className="space-y-3">
                            <label className="flex items-center justify-between">
                                <span className="text-sm text-gray-300">Email notifications</span>
                                <input
                                    type="checkbox"
                                    checked={emailNotifications}
                                    onChange={(e) => setEmailNotifications(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                />
                            </label>

                            <label className="flex items-center justify-between">
                                <span className="text-sm text-gray-300">Browser notifications</span>
                                <input
                                    type="checkbox"
                                    checked={browserNotifications}
                                    onChange={(e) => setBrowserNotifications(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                />
                            </label>

                            <label className="flex items-center justify-between">
                                <span className="text-sm text-gray-300">Mobile notifications</span>
                                <input
                                    type="checkbox"
                                    checked={mobileNotifications}
                                    onChange={(e) => setMobileNotifications(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button
                    onClick={handleSavePreferences}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold"
                    loading={isLoading}
                >
                    {isLoading ? 'Saving...' : 'Save Personalization'}
                </Button>
            </div>
        </div>
    );
};

export default UserPersonalizationPanel;