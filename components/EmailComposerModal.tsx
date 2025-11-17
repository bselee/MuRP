
import React, { useState, useEffect } from 'react';
// FIX: Import GmailConnection from types.ts.
import type { PurchaseOrder, Vendor, GmailConnection } from '../types';
import Modal from './Modal';
import { generatePoPdf } from '../services/pdfService';
import { FileTextIcon, GmailIcon } from './icons';

interface EmailComposerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: () => void;
    purchaseOrder: PurchaseOrder;
    vendor: Vendor;
    gmailConnection: GmailConnection;
}

const EmailComposerModal: React.FC<EmailComposerModalProps> = ({ isOpen, onClose, onSend, purchaseOrder, vendor, gmailConnection }) => {
    const [to, setTo] = useState('');
    const [from, setFrom] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    
    useEffect(() => {
        if (isOpen) {
            setTo(vendor.contactEmails[0] || '');
            setFrom(gmailConnection.isConnected ? gmailConnection.email! : 'procurement@murp.app (simulation)');
            const poNumber = purchaseOrder.orderId || purchaseOrder.id;
            setSubject(`Purchase Order #${poNumber} from MuRP`);
            setBody(
`Hello ${vendor.name} Team,

Please find attached our Purchase Order #${poNumber}.

Kindly confirm receipt and provide an estimated shipping date at your earliest convenience.

Thank you,

MuRP
Procurement Team`
            );
        }
    }, [isOpen, purchaseOrder, vendor, gmailConnection]);

    const handleSendClick = () => {
        setIsSending(true);
        // Simulate network delay
        setTimeout(() => {
            setIsSending(false);
            onSend();
        }, 1500);
    };
    
    const handleDownloadAttachment = () => {
        generatePoPdf(purchaseOrder, vendor);
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Send Purchase Order">
            <div className="flex flex-col h-full">
                <div className="space-y-4 flex-grow">
                    <div className="flex items-center">
                        <label htmlFor="from-email" className="w-16 text-sm text-gray-400">From:</label>
                        <input id="from-email" type="email" value={from} readOnly className="flex-1 bg-gray-900/50 text-gray-300 rounded-md p-2 text-sm cursor-not-allowed" />
                    </div>
                    <div className="flex items-center">
                        <label htmlFor="to-email" className="w-16 text-sm text-gray-400">To:</label>
                        <input id="to-email" type="email" value={to} onChange={e => setTo(e.target.value)} className="flex-1 bg-gray-700 text-white rounded-md p-2 text-sm" />
                    </div>
                    <div className="flex items-center">
                        <label htmlFor="subject-email" className="w-16 text-sm text-gray-400">Subject:</label>
                        <input id="subject-email" type="text" value={subject} onChange={e => setSubject(e.target.value)} className="flex-1 bg-gray-700 text-white rounded-md p-2 text-sm" />
                    </div>
                    <div>
                        <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} className="w-full bg-gray-900/50 text-white rounded-md p-3 text-sm font-mono"></textarea>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-300 mb-2">Attachments</h4>
                        <button onClick={handleDownloadAttachment} className="flex items-center gap-2 text-sm p-2 bg-gray-700 rounded-md text-indigo-300 hover:bg-gray-600">
                            <FileTextIcon className="w-5 h-5"/>
                            <span>{(purchaseOrder.orderId || purchaseOrder.id)}.pdf</span>
                        </button>
                    </div>
                </div>

                <footer className="mt-auto pt-4 border-t border-gray-700">
                     <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            {gmailConnection.isConnected ? (
                                <>
                                    <GmailIcon className="w-4 h-4 text-green-400" />
                                    <span>Email will be sent via your connected Gmail account.</span>
                                </>
                            ) : (
                                <>
                                    <GmailIcon className="w-4 h-4 text-yellow-400" />
                                    <span>This is a simulated email. Connect Gmail in Settings to send for real.</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center">
                             <button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</button>
                            <button onClick={handleSendClick} disabled={isSending} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500 disabled:cursor-wait">
                                {isSending ? 'Sending...' : 'Send Email'}
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
        </Modal>
    );
};

export default EmailComposerModal;
