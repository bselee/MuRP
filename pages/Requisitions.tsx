import React, { useMemo, useState } from 'react';
import type { User, InternalRequisition, InventoryItem, RequisitionItem } from '../types';
import CreateRequisitionModal from '../components/CreateRequisitionModal';
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '../components/icons';

interface RequisitionsProps {
    currentUser: User;
    requisitions: InternalRequisition[];
    users: User[];
    inventory: InventoryItem[];
    onApprove: (reqId: string) => void;
    onReject: (reqId: string) => void;
    onCreate: (items: RequisitionItem[]) => void;
}

const StatusBadge: React.FC<{ status: InternalRequisition['status'] }> = ({ status }) => {
    const statusConfig = {
      'Pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Approved': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Rejected': 'bg-red-500/20 text-red-400 border-red-500/30',
      'Ordered': 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${statusConfig[status]}`}>{status}</span>;
};

const Requisitions: React.FC<RequisitionsProps> = ({ currentUser, requisitions, users, inventory, onApprove, onReject, onCreate }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);

    const displayedRequisitions = useMemo(() => {
        const sorted = [...requisitions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (currentUser.role === 'Admin') {
            return sorted;
        }
        // Managers and Staff see their own department's requisitions
        return sorted.filter(r => r.department === currentUser.department);
    }, [requisitions, currentUser]);

    const canTakeAction = (req: InternalRequisition) => {
        if (req.status !== 'Pending') return false;
        if (currentUser.role === 'Admin') return true;
        if (currentUser.role === 'Manager' && currentUser.department === req.department) return true;
        return false;
    }

    return (
        <>
            <div className="space-y-6">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Purchase Requisitions</h1>
                        <p className="text-gray-400 mt-1">
                            {currentUser.role === 'Admin'
                                ? 'Review, approve, or reject internal requests for materials from all departments.'
                                : currentUser.role === 'Manager' 
                                ? 'Manage material requests for your department.'
                                : 'Create and track material requests for your department.'}
                        </p>
                    </div>
                    {currentUser.role !== 'Admin' && (
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="w-full sm:w-auto bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            Create New Requisition
                        </button>
                    )}
                </header>

                 <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-gray-700">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Req ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Department</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Requester</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Items</th>
                                    {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800 divide-y divide-gray-700">
                                {displayedRequisitions.map(req => (
                                    <tr key={req.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-400">{req.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{req.department}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{userMap.get(req.requesterId) || 'Unknown User'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={req.status} /></td>
                                        <td className="px-6 py-4 text-sm text-gray-300">
                                            <ul className="space-y-1">
                                                {req.items.map(item => (
                                                    <li key={item.sku}>{item.quantity}x {item.name}</li>
                                                ))}
                                            </ul>
                                        </td>
                                        {(currentUser.role === 'Admin' || currentUser.role === 'Manager') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                                                {canTakeAction(req) ? (
                                                    <>
                                                        <button onClick={() => onApprove(req.id)} className="p-2 text-green-400 hover:text-green-300" title="Approve"><CheckCircleIcon className="w-6 h-6" /></button>
                                                        <button onClick={() => onReject(req.id)} className="p-2 text-red-400 hover:text-red-300" title="Reject"><XCircleIcon className="w-6 h-6" /></button>
                                                    </>
                                                ) : <span className="text-xs text-gray-500">Processed</span>}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 </div>
            </div>
            
            <CreateRequisitionModal 
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                inventory={inventory}
                onCreate={onCreate}
            />
        </>
    );
};

export default Requisitions;