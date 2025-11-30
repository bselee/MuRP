
import React, { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import type { PurchaseOrder, Vendor, GmailConnection } from '../types';
import Modal from './Modal';
import { generatePoPdf, getPoPdfAttachment } from '../services/pdfService';
import { FileTextIcon, GmailIcon } from './icons';
import { getGoogleGmailService } from '../services/googleGmailService';
import { logPoEmailTracking } from '../hooks/useSupabaseMutations';
import { useGoogleAuthPrompt } from '../hooks/useGoogleAuthPrompt';

interface EmailComposerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (sentViaGmail: boolean) => void;
    purchaseOrder: PurchaseOrder;
    vendor: Vendor;
    gmailConnection: GmailConnection;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    onConnectGoogle?: () => Promise<boolean>;
}

const EmailComposerModal: React.FC<EmailComposerModalProps> = ({ isOpen, onClose, onSend, purchaseOrder, vendor, gmailConnection, addToast, onConnectGoogle }) => {
    const [to, setTo] = useState('');
    const [from, setFrom] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const promptGoogleAuth = useGoogleAuthPrompt(addToast);

    useEffect(() => {
        if (isOpen) {
            loadEmailTemplate();
        }
    }, [isOpen, purchaseOrder, vendor, gmailConnection]);

    const loadEmailTemplate = async () => {
        setTo(vendor.contactEmails[0] || '');
        setFrom(gmailConnection.isConnected ? (gmailConnection.email ?? '') : 'procurement@murp.app (simulation)');

        try {
            const templateService = await import('../services/templateService').then(m => m.templateService);
            const template = await templateService.getEmailTemplate(vendor.id);
            const variables = await templateService.getPOVariables(purchaseOrder, vendor);

            const resolvedSubject = templateService.substituteVariables(template.subject_line, variables);
            const resolvedBody = templateService.substituteVariables(template.body_template, variables);
            const resolvedSignature = templateService.substituteVariables(template.signature, variables);

            setSubject(resolvedSubject);
            setBody(resolvedBody + '\n\n' + resolvedSignature);
        } catch (error) {
            console.error('Error loading email template:', error);
            // Fallback to hardcoded template
            const poNumber = purchaseOrder.orderId || purchaseOrder.id;
            setSubject(`Purchase Order #${poNumber} from MuRP`);
            setBody(`Hello ${vendor.name} Team,

Please find attached our Purchase Order #${poNumber}.

Kindly confirm receipt and provide an estimated shipping date at your earliest convenience.

Thank you,

MuRP
Procurement Team`);
        }
    };

    const ensureGmailReady = useCallback(async () => {
        if (gmailConnection.isConnected) {
            return true;
        }
        const connected = await promptGoogleAuth({
            reason: 'send purchase order emails via Google Workspace Gmail',
            connect: onConnectGoogle,
            postConnectMessage: 'Google Workspace connected. Sending via Gmail...',
        });
        return connected;
    }, [gmailConnection.isConnected, onConnectGoogle, promptGoogleAuth]);

    const handleSendClick = async () => {
        if (isSending) return;
        setIsSending(true);

        try {
            let canSendViaGmail = gmailConnection.isConnected;
            if (!canSendViaGmail) {
                const connected = await ensureGmailReady();
                if (connected) {
                    canSendViaGmail = true;
                }
            }

            const attachment = await getPoPdfAttachment(purchaseOrder, vendor);
            if (canSendViaGmail) {
                const gmailService = getGoogleGmailService();
                const sendResult = await gmailService.sendEmail({
                    to,
                    subject,
                    body,
                    from: gmailConnection.email ?? from,
                    attachments: [attachment],
                });

                if (sendResult?.id) {
                    await logPoEmailTracking(purchaseOrder.id, {
                        gmailMessageId: sendResult.id,
                        gmailThreadId: sendResult.threadId,
                        vendorEmail: vendor.contactEmails?.[0] || to,
                        metadata: {
                            subject,
                            to,
                            labelIds: sendResult.labelIds ?? [],
                        },
                        subject,
                        bodyPreview: body.slice(0, 500),
                        direction: 'outbound',
                        communicationType: 'initial_send',
                        senderEmail: gmailConnection.email ?? from,
                        recipientEmail: vendor.contactEmails?.[0] || to,
                        sentAt: new Date().toISOString(),
                    });
                }

                addToast('Email sent via Google Workspace Gmail', 'success');
                onSend(true);
            } else {
                await logPoEmailTracking(purchaseOrder.id, {
                    vendorEmail: vendor.contactEmails?.[0] || to,
                    metadata: {
                        subject,
                        to,
                        simulated: true,
                    },
                    subject,
                    bodyPreview: body.slice(0, 500),
                    direction: 'outbound',
                    communicationType: 'initial_send',
                    senderEmail: from,
                    recipientEmail: vendor.contactEmails?.[0] || to,
                    sentAt: new Date().toISOString(),
                });
                addToast('Workspace Gmail not connected. Simulating email send.', 'info');
                onSend(false);
            }
            onClose();
        } catch (error) {
            console.error('Error sending Google Workspace Gmail:', error);
            addToast(`Failed to send email via Google Workspace Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleDownloadAttachment = async () => {
        await generatePoPdf(purchaseOrder, vendor);
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
                        <Button onClick={handleDownloadAttachment} className="flex items-center gap-2 text-sm p-2 bg-gray-700 rounded-md text-accent-300 hover:bg-gray-600">
                            <FileTextIcon className="w-5 h-5"/>
                            <span>{(purchaseOrder.orderId || purchaseOrder.id)}.pdf</span>
                        </Button>
                    </div>
                </div>

                <footer className="mt-auto pt-4 border-t border-gray-700">
                     <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            {gmailConnection.isConnected ? (
                                <>
                                    <GmailIcon className="w-4 h-4 text-green-400" />
                                    <span>Email will be sent via your connected Google Workspace Gmail account.</span>
                                </>
                            ) : (
                                <>
                                    <GmailIcon className="w-4 h-4 text-yellow-400" />
                                    <span>This is a simulated email. Connect Google Workspace Gmail in Settings to send for real.</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center">
                             <Button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</Button>
                            <Button onClick={handleSendClick} disabled={isSending} className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-500 disabled:cursor-wait">
                                {isSending ? 'Sending...' : 'Send Email'}
                            </Button>
                        </div>
                    </div>
                </footer>
            </div>
        </Modal>
    );
};

export default EmailComposerModal;
