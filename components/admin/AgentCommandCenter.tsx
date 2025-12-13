import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { AgentDetailDrawer } from './AgentDetailDrawer';
import { CpuChipIcon, ShieldCheckIcon, TruckIcon } from '../icons';

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

// Fallback mock data for when agent_configs table doesn't exist yet
const MOCK_AGENTS: AgentConfig[] = [
    {
        id: '1',
        agent_identifier: 'vendor_watchdog',
        display_name: 'Vendor Watchdog',
        description: 'Learns from vendor behavior, tracks lead times, and silently adjusts planning to prevent stockouts.',
        autonomy_level: 'assist',
        is_active: true,
        trust_score: 0.85,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '2',
        agent_identifier: 'traffic_controller',
        display_name: 'Air Traffic Controller',
        description: 'Intelligently prioritizes alerts based on actual impact. Reduces alert fatigue by surfacing only critical delays.',
        autonomy_level: 'monitor',
        is_active: true,
        trust_score: 0.72,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '3',
        agent_identifier: 'trust_score',
        display_name: 'Trust Score Agent',
        description: 'Measures progress toward autonomous operations. Tracks stockout prevention, touchless POs, and ETA accuracy.',
        autonomy_level: 'autonomous',
        is_active: true,
        trust_score: 0.94,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '4',
        agent_identifier: 'inventory_guardian',
        display_name: 'Inventory Guardian',
        description: 'Monitors stock levels, predicts shortages, and triggers reorder alerts before stockouts occur.',
        autonomy_level: 'assist',
        is_active: true,
        trust_score: 0.88,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '5',
        agent_identifier: 'price_hunter',
        display_name: 'Price Hunter',
        description: 'Tracks vendor pricing trends, identifies cost anomalies, and flags favorable buying opportunities.',
        autonomy_level: 'monitor',
        is_active: true,
        trust_score: 0.78,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '6',
        agent_identifier: 'po_intelligence',
        display_name: 'PO Intelligence',
        description: 'Analyzes purchase order patterns, predicts arrival times, and optimizes ordering schedules.',
        autonomy_level: 'assist',
        is_active: true,
        trust_score: 0.82,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '7',
        agent_identifier: 'stockout_prevention',
        display_name: 'Stockout Prevention',
        description: 'Proactively identifies at-risk SKUs and recommends emergency orders before stock runs out.',
        autonomy_level: 'autonomous',
        is_active: true,
        trust_score: 0.91,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '8',
        agent_identifier: 'artwork_approval',
        display_name: 'Artwork Approval Agent',
        description: 'Manages artwork approval workflow, tracks SLA compliance, and escalates overdue approvals.',
        autonomy_level: 'assist',
        is_active: true,
        trust_score: 0.76,
        parameters: {},
        system_prompt: '',
    },
    {
        id: '9',
        agent_identifier: 'compliance_validator',
        display_name: 'Compliance Validator',
        description: 'Validates product labels against state regulations, flags missing warnings, and ensures compliance.',
        autonomy_level: 'monitor',
        is_active: true,
        trust_score: 0.89,
        parameters: {},
        system_prompt: '',
    },
];

export const AgentCommandCenter: React.FC = () => {
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [usingMockData, setUsingMockData] = useState(false);

    useEffect(() => {
        fetchAgents();
    }, []);

    const fetchAgents = async () => {
        try {
            const { data, error } = await supabase.from('agent_configs').select('*').order('display_name');
            if (error) {
                console.warn('agent_configs table not found, using mock data:', error.message);
                setAgents(MOCK_AGENTS);
                setUsingMockData(true);
            } else if (data && data.length > 0) {
                setAgents(data);
                setUsingMockData(false);
            } else {
                setAgents(MOCK_AGENTS);
                setUsingMockData(true);
            }
        } catch (err) {
            console.warn('Failed to fetch agents, using mock data:', err);
            setAgents(MOCK_AGENTS);
            setUsingMockData(true);
        }
        setLoading(false);
    };

    const updateAgent = async (id: string, updates: Partial<AgentConfig>) => {
        // Optimistic UI update
        setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));

        if (!usingMockData) {
            const { error } = await supabase.from('agent_configs').update(updates).eq('id', id);
            if (error) {
                console.error("Failed to update agent:", error);
                fetchAgents();
            }
        }
    };

    const systemTrustScore = agents.length > 0
        ? Math.round(agents.reduce((sum, a) => sum + a.trust_score, 0) / agents.length * 100)
        : 0;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-start flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <CpuChipIcon className="w-8 h-8 text-accent-400" />
                        Agent Command Center
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Manage your autonomous workforce. Configure behavior, set autonomy limits, and monitor performance.
                    </p>
                    {usingMockData && (
                        <p className="text-amber-400 text-sm mt-2 flex items-center gap-2">
                            <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                            Demo mode - agent_configs table not found. Create migration to persist settings.
                        </p>
                    )}
                </div>
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-4">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold">System Trust Score</p>
                        <p className={`text-2xl font-bold ${systemTrustScore >= 80 ? 'text-green-400' : systemTrustScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                            {systemTrustScore}%
                        </p>
                    </div>
                    <div className="h-10 w-[1px] bg-gray-700"></div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold">Active Agents</p>
                        <p className="text-2xl font-bold text-white">{agents.filter(a => a.is_active).length}</p>
                    </div>
                </div>
            </div>

            {/* Agents Grid */}
            {loading ? (
                <div className="text-gray-400 flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    Loading agents...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map(agent => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            onUpdate={updateAgent}
                            onEdit={() => setSelectedAgent(agent)}
                        />
                    ))}
                </div>
            )}

            {/* Detail/Edit Drawer */}
            {selectedAgent && (
                <AgentDetailDrawer
                    agent={selectedAgent}
                    onClose={() => setSelectedAgent(null)}
                    onSave={async (id, updates) => {
                        await updateAgent(id, updates);
                        setSelectedAgent(null);
                    }}
                />
            )}
        </div>
    );
};

// ------------------------------------------------------------------
// The Agent Card Component
// ------------------------------------------------------------------

const AgentCard: React.FC<{
    agent: AgentConfig;
    onUpdate: (id: string, updates: Partial<AgentConfig>) => void;
    onEdit: () => void;
}> = ({ agent, onUpdate, onEdit }) => {

    const getIcon = () => {
        switch (agent.agent_identifier) {
            case 'vendor_watchdog': return <ShieldCheckIcon className="w-6 h-6 text-orange-400" />;
            case 'traffic_controller': return <TruckIcon className="w-6 h-6 text-blue-400" />;
            case 'trust_score': return <CpuChipIcon className="w-6 h-6 text-green-400" />;
            default: return <CpuChipIcon className="w-6 h-6 text-gray-400" />;
        }
    };

    const trustScorePercent = Math.round(agent.trust_score * 100);

    return (
        <div className={`relative group bg-gray-800 rounded-xl border transition-all duration-300 ${agent.is_active ? 'border-gray-700 hover:border-accent-500/50' : 'border-gray-800 opacity-60'
            }`}>
            {/* Header */}
            <div className="p-6 pb-4 border-b border-gray-700/50">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-gray-900 rounded-lg shadow-inner">
                        {getIcon()}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500">TRUST</span>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded border ${trustScorePercent >= 80 ? 'bg-green-900/20 border-green-800' :
                                trustScorePercent >= 60 ? 'bg-amber-900/20 border-amber-800' :
                                    'bg-red-900/20 border-red-800'
                            }`}>
                            <span className={`text-xl font-bold ${trustScorePercent >= 80 ? 'text-green-400' :
                                    trustScorePercent >= 60 ? 'text-amber-400' :
                                        'text-red-400'
                                }`}>
                                {trustScorePercent}%
                            </span>
                        </div>
                    </div>
                </div>

                <h3 className="text-xl font-bold text-white mb-2">{agent.display_name}</h3>
                <p className="text-sm text-gray-400 h-12 line-clamp-2">{agent.description}</p>
            </div>

            {/* Controls Area */}
            <div className="p-6 pt-4 space-y-6">
                {/* The Autonomy Slider */}
                <div className="space-y-3">
                    <div className="flex justify-between text-xs text-gray-400 uppercase font-semibold">
                        <span>Mode</span>
                        <span className={`
                            ${agent.autonomy_level === 'autonomous' ? 'text-purple-400' : ''}
                            ${agent.autonomy_level === 'assist' ? 'text-blue-400' : ''}
                            ${agent.autonomy_level === 'monitor' ? 'text-gray-400' : ''}
                        `}>
                            {agent.autonomy_level}
                        </span>
                    </div>

                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="1"
                        value={
                            agent.autonomy_level === 'monitor' ? 0 :
                                agent.autonomy_level === 'assist' ? 1 : 2
                        }
                        disabled={!agent.is_active}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            const levels: ('monitor' | 'assist' | 'autonomous')[] = ['monitor', 'assist', 'autonomous'];
                            onUpdate(agent.id, { autonomy_level: levels[val] });
                        }}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-500"
                    />

                    <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                        <span>MONITOR</span>
                        <span>ASSIST</span>
                        <span>AUTO</span>
                    </div>
                </div>

                {/* Toggle Switch */}
                <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={agent.is_active}
                                onChange={(e) => onUpdate(agent.id, { is_active: e.target.checked })}
                            />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${agent.is_active ? 'bg-green-600' : 'bg-gray-700'
                                }`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${agent.is_active ? 'transform translate-x-4' : ''
                                }`}></div>
                        </div>
                        <div className="ml-3 text-sm font-medium text-gray-300">
                            {agent.is_active ? 'Online' : 'Paused'}
                        </div>
                    </label>

                    <button
                        onClick={onEdit}
                        className="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-700 transition-colors"
                        title="Configure Agent"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AgentCommandCenter;
