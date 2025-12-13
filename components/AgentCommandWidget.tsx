import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import Button from '@/components/ui/Button';
import { BotIcon, RefreshIcon, PlayIcon, ExclamationCircleIcon, TruckIcon, DollarSignIcon } from '@/components/icons';
import { getFlaggedVendors } from '../services/vendorWatchdogAgent';
import { getPesterAlerts, getInvoiceVariances } from '../services/poIntelligenceAgent';

interface AgentStatus {
    id: string;
    name: string;
    status: 'idle' | 'running' | 'alert';
    lastRun: Date;
    message: string;
}

const AgentCommonWidget: React.FC = () => {
    const [agents, setAgents] = useState<AgentStatus[]>([
        { id: 'vendor_watchdog', name: 'Vendor Watchdog', status: 'idle', lastRun: new Date(), message: 'Monitoring 12 active vendors' },
        { id: 'inventory_guardian', name: 'Inventory Guardian', status: 'idle', lastRun: new Date(), message: 'Stock levels analyzed' },
        { id: 'price_hunter', name: 'Price Hunter', status: 'idle', lastRun: new Date(), message: 'Waiting for triggers' },
        { id: 'po_intelligence', name: 'PO Intelligence', status: 'idle', lastRun: new Date(), message: 'Tracking arrivals & costs' }
    ]);
    const [alerts, setAlerts] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        // Load initial alerts from all agents
        const loadAlerts = async () => {
            const newAlerts: string[] = [];

            // Vendor watchdog alerts
            const flagged = await getFlaggedVendors();
            if (flagged.length > 0) {
                newAlerts.push(...flagged.map(f => `${f.vendor_name}: ${f.issue}`));
                setAgents(prev => prev.map(a =>
                    a.id === 'vendor_watchdog'
                        ? { ...a, status: 'alert', message: `${flagged.length} vendors flagged` }
                        : a
                ));
            }

            // PO intelligence: pester alerts
            const pesterAlerts = await getPesterAlerts();
            if (pesterAlerts.length > 0) {
                const urgent = pesterAlerts.filter(p => p.priority === 'urgent');
                newAlerts.push(...urgent.map(p => `PO #${p.po_number}: ${p.reason} (${p.vendor_name})`));
                setAgents(prev => prev.map(a =>
                    a.id === 'po_intelligence'
                        ? { ...a, status: urgent.length > 0 ? 'alert' : 'idle', message: `${pesterAlerts.length} POs need attention` }
                        : a
                ));
            }

            // PO intelligence: invoice variances
            const variances = await getInvoiceVariances();
            if (variances.length > 0) {
                const critical = variances.filter(v => v.severity === 'critical');
                newAlerts.push(...critical.map(v => `${v.vendor_name}: ${v.variance_type} ($${v.variance_amount.toFixed(2)})`));
            }

            setAlerts(newAlerts);
        };

        loadAlerts();
        // Refresh every 5 minutes
        const interval = setInterval(loadAlerts, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const handleInvokeAgents = async () => {
        setIsRunning(true);
        // Simulate agent run
        setAgents(prev => prev.map(a => ({ ...a, status: 'running', message: 'Analyzing...' })));

        // Mock delay for effect
        setTimeout(async () => {
            const newAlerts: string[] = [];

            // Vendor watchdog
            const flagged = await getFlaggedVendors();
            if (flagged.length > 0) {
                newAlerts.push(...flagged.map(f => `${f.vendor_name}: ${f.issue}`));
            }

            // PO intelligence: pester alerts
            const pesterAlerts = await getPesterAlerts();
            if (pesterAlerts.length > 0) {
                const urgent = pesterAlerts.filter(p => p.priority === 'urgent');
                newAlerts.push(...urgent.slice(0, 3).map(p => `PO #${p.po_number}: ${p.reason} (${p.vendor_name})`));
            }

            // PO intelligence: invoice variances
            const variances = await getInvoiceVariances();
            if (variances.length > 0) {
                const critical = variances.filter(v => v.severity === 'critical');
                newAlerts.push(...critical.slice(0, 3).map(v => `${v.vendor_name}: ${v.variance_type} ($${v.variance_amount.toFixed(2)})`));
            }

            setAgents(prev => prev.map(a => {
                if (a.id === 'vendor_watchdog') {
                    return {
                        ...a,
                        status: flagged.length > 0 ? 'alert' : 'idle',
                        lastRun: new Date(),
                        message: flagged.length > 0 ? `${flagged.length} vendors flagged` : 'Systems nominal'
                    };
                }
                if (a.id === 'po_intelligence') {
                    const totalIssues = pesterAlerts.length + variances.length;
                    return {
                        ...a,
                        status: totalIssues > 0 ? 'alert' : 'idle',
                        lastRun: new Date(),
                        message: totalIssues > 0 
                            ? `${pesterAlerts.length} POs + ${variances.length} variances` 
                            : 'All arrivals on track'
                    };
                }
                return { ...a, lastRun: new Date(), status: 'idle', message: 'Analysis complete' };
            }));

            setAlerts(newAlerts);
            setIsRunning(false);
        }, 1500);
    };

    return (
        <Card className="border-accent-500/30 bg-gray-900/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <BotIcon className="w-5 h-5 text-accent-400" />
                    <h3 className="font-semibold text-white">Agent Command Center</h3>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleInvokeAgents}
                    disabled={isRunning}
                    className="h-8 text-xs border-accent-500/50 text-accent-400 hover:bg-accent-500/10"
                >
                    {isRunning ? (
                        <RefreshIcon className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                        <PlayIcon className="w-3 h-3 mr-1" />
                    )}
                    Run Analysis
                </Button>
            </CardHeader>
            <CardContent className="p-0">
                {/* Agent List */}
                <div className="divide-y divide-gray-800">
                    {agents.map(agent => (
                        <div key={agent.id} className="p-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${agent.status === 'running' ? 'bg-blue-400 animate-pulse' :
                                    agent.status === 'alert' ? 'bg-red-400 animate-ping' :
                                        'bg-green-400'
                                    }`} />
                                <div>
                                    <p className="text-sm font-medium text-gray-200">{agent.name}</p>
                                    <p className="text-xs text-gray-500">{agent.message}</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-600 font-mono">
                                {agent.lastRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Alerts Section */}
                {alerts.length > 0 && (
                    <div className="p-3 bg-red-500/10 border-t border-red-500/20">
                        <div className="flex items-start gap-2">
                            <ExclamationCircleIcon className="w-4 h-4 text-red-400 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-red-300">Attention Required</p>
                                {alerts.map((alert, i) => (
                                    <p key={i} className="text-xs text-red-200/80">• {alert}</p>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default AgentCommonWidget;
