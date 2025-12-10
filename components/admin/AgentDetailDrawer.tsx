import React, { useState } from 'react';

interface AgentConfig {
    id: string;
    agent_identifier: string;
    display_name: string;
    description: string;
    autonomy_level: 'monitor' | 'assist' | 'autonomous';
    is_active: boolean;
    trust_score: number;
    parameters: Record<string, any>;
    system_prompt: string;
}

interface AgentDetailDrawerProps {
    agent: AgentConfig;
    onClose: () => void;
    onSave: (id: string, updates: Partial<AgentConfig>) => void;
}

export const AgentDetailDrawer: React.FC<AgentDetailDrawerProps> = ({ agent, onClose, onSave }) => {
    const [editedPrompt, setEditedPrompt] = useState(agent.system_prompt || '');
    const [editedDescription, setEditedDescription] = useState(agent.description);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(agent.id, {
            system_prompt: editedPrompt,
            description: editedDescription,
        });
        setIsSaving(false);
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-gray-900 border-l border-gray-700 z-50 overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-700 p-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white">{agent.display_name}</h2>
                        <p className="text-sm text-gray-400 font-mono">{agent.agent_identifier}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-700"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Status Card */}
                    <div className="bg-gray-800 rounded-lg p-4 grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Status</p>
                            <p className={`font-bold ${agent.is_active ? 'text-green-400' : 'text-gray-400'}`}>
                                {agent.is_active ? 'Online' : 'Paused'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Autonomy</p>
                            <p className={`font-bold capitalize ${agent.autonomy_level === 'autonomous' ? 'text-purple-400' :
                                    agent.autonomy_level === 'assist' ? 'text-blue-400' :
                                        'text-gray-400'
                                }`}>
                                {agent.autonomy_level}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Trust Score</p>
                            <p className={`font-bold ${agent.trust_score >= 0.8 ? 'text-green-400' :
                                    agent.trust_score >= 0.6 ? 'text-amber-400' :
                                        'text-red-400'
                                }`}>
                                {Math.round(agent.trust_score * 100)}%
                            </p>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">Description</label>
                        <textarea
                            value={editedDescription}
                            onChange={(e) => setEditedDescription(e.target.value)}
                            rows={3}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                        />
                    </div>

                    {/* System Prompt */}
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">System Prompt</label>
                        <p className="text-xs text-gray-500 mb-2">
                            The base instructions that guide this agent's behavior. Changes here affect all interactions.
                        </p>
                        <textarea
                            value={editedPrompt}
                            onChange={(e) => setEditedPrompt(e.target.value)}
                            rows={8}
                            placeholder="Enter system prompt for this agent..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-500 focus:border-transparent font-mono text-sm"
                        />
                    </div>

                    {/* Parameters (Read-only for now) */}
                    {Object.keys(agent.parameters || {}).length > 0 && (
                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Parameters</label>
                            <pre className="bg-gray-800 p-4 rounded-lg text-sm text-gray-300 overflow-x-auto">
                                {JSON.stringify(agent.parameters, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 p-4 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </>
    );
};

export default AgentDetailDrawer;
