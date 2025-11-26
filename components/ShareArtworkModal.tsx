import React, { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from './Modal';
import type { Artwork, GmailConnection } from '../types';
import { GmailIcon, SendIcon, DocumentTextIcon } from './icons';
import { getGoogleGmailService, GmailAttachment } from '../services/googleGmailService';

interface ContactSuggestion {
  vendorId: string;
  vendorName: string;
  email: string;
}

interface ShareLogResult {
  to: string[];
  cc: string[];
  subject: string;
  includeCompliance: boolean;
  attachFile: boolean;
  attachmentHash?: string | null;
  sentViaGmail: boolean;
}

interface ShareArtworkModalProps {
  isOpen: boolean;
  artwork: (Artwork & { productName?: string; productSku?: string }) | null;
  onClose: () => void;
  gmailConnection: GmailConnection;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  currentUser?: { id: string; email: string };
  suggestedContacts?: ContactSuggestion[];
  onShareLogged?: (artwork: Artwork & { productName?: string; productSku?: string }, payload: ShareLogResult) => void;
}

type Nullable<T> = T | null;

const parseEmails = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map(entry => entry.trim())
    .filter(Boolean);

const addEmailToField = (current: string, email: string) => {
  const emails = parseEmails(current);
  if (emails.includes(email)) return current;
  return [...emails, email].join(', ');
};

const ShareArtworkModal: React.FC<ShareArtworkModalProps> = ({
  isOpen,
  artwork,
  onClose,
  gmailConnection,
  addToast,
  currentUser,
  suggestedContacts,
  onShareLogged,
}) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeCompliance, setIncludeCompliance] = useState(true);
  const [attachFile, setAttachFile] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (isOpen && artwork) {
      const defaultSubject = `Artwork Update: ${artwork.fileName || artwork.productName || 'Label'} (${artwork.productSku ?? 'no SKU'})`;
      const intro = `Hi Packaging Team,

Here is the latest approved artwork for ${artwork.productName ?? 'this product'}. Please confirm receipt and let us know once it has been queued for print.`;
      const closing = `
Thank you,
${currentUser?.email ?? 'RegVault Ops'}
`;
      setSubject(defaultSubject);
      setMessage([intro, closing].join('\n\n'));
      setTo(prev => prev || suggestedContacts?.[0]?.email || '');
      setCc('');
      setIncludeCompliance(true);
      setAttachFile(true);
    } else if (!isOpen) {
      setTo('');
      setCc('');
      setSubject('');
      setMessage('');
    }
  }, [isOpen, artwork, currentUser?.email, suggestedContacts]);

  const handleSuggestionClick = (email: string, target: 'to' | 'cc') => {
    if (target === 'to') {
      setTo(prev => addEmailToField(prev, email));
    } else {
      setCc(prev => addEmailToField(prev, email));
    }
  };

  const complianceSummary = useMemo(() => {
    if (!artwork) return 'No compliance metadata available.';

    const lines: string[] = [];
    if (artwork.scanStatus) {
      lines.push(`AI Scan: ${artwork.scanStatus === 'completed' ? 'Completed' : artwork.scanStatus}`);
    }
    if (artwork.scanCompletedAt) {
      lines.push(`Last Scan: ${new Date(artwork.scanCompletedAt).toLocaleString()}`);
    }
    if (artwork.verified) {
      lines.push(`Verified${artwork.verifiedBy ? ` by ${artwork.verifiedBy}` : ''}`);
    } else {
      lines.push('Verification: Pending');
    }
    if (artwork.regulatoryDocLink) {
      lines.push(`Regulatory Doc: ${artwork.regulatoryDocLink}`);
    }
    if (artwork.notes) {
      lines.push(`Notes: ${artwork.notes}`);
    }

    return lines.join('\n');
  }, [artwork]);

  const handleSend = async () => {
    if (!artwork) return;
    const toList = parseEmails(to);
    if (toList.length === 0) {
      addToast('Please enter at least one recipient email.', 'error');
      return;
    }
    const ccList = parseEmails(cc);
    setIsSending(true);
    try {
      let attachments: GmailAttachment[] | undefined;
      let attachmentHash: string | null = null;
      if (attachFile) {
        const result = await buildAttachmentFromArtwork(artwork);
        if (result) {
          attachments = [result.attachment];
          attachmentHash = result.hash ?? null;
        } else {
          addToast('Unable to attach artwork file. Sending link only.', 'info');
        }
      }

      const sections = [message.trim()];
      if (includeCompliance && complianceSummary.trim().length > 0) {
        sections.push(`---\nCompliance Snapshot:\n${complianceSummary}`);
      }
      if (artwork.url) {
        sections.push(`Preview/Download: ${artwork.url}`);
      }

      const finalBody = sections.filter(Boolean).join('\n\n');

      if (gmailConnection.isConnected) {
        const gmailService = getGoogleGmailService();
        await gmailService.sendEmail({
          to: to.trim(),
          cc: ccList.length ? ccList : undefined,
          subject,
          body: finalBody,
          from: gmailConnection.email ?? currentUser?.email,
          attachments: attachments && attachments.length ? attachments : undefined,
        });
        addToast('Artwork emailed via Google Workspace Gmail.', 'success');
      } else {
        addToast('Workspace Gmail not connected. Simulating email send.', 'info');
      }

      onShareLogged?.(artwork, {
        to: toList,
        cc: ccList,
        subject,
        includeCompliance,
        attachFile,
        attachmentHash,
        sentViaGmail: gmailConnection.isConnected,
      });

      onClose();
    } catch (error) {
      console.error('Share artwork email error:', error);
      addToast(
        `Failed to send artwork email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      setIsSending(false);
    }
  };

  const disableSend = !artwork || !to.trim() || !subject.trim() || !message.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Email Artwork Package">
      {artwork ? (
        <div className="space-y-5">
          <section className="bg-gray-900/40 rounded-lg border border-gray-800 p-4">
            <p className="text-sm font-semibold text-white">{artwork.fileName}</p>
            <p className="text-xs text-gray-400 mt-1">
              {artwork.productName} • Rev {artwork.revision}
            </p>
          </section>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 uppercase">To</label>
              <input
                type="text"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="w-full bg-gray-900/50 text-white rounded-md p-2 mt-1 text-sm border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="packaging@example.com"
              />
              {suggestedContacts && suggestedContacts.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] text-gray-500">Suggested packaging contacts</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedContacts.map(contact => (
                      <div key={`${contact.vendorId}-${contact.email}`} className="flex items-center gap-1 bg-gray-800/60 border border-gray-700 rounded-full pl-3 pr-1 py-1">
                        <span className="text-[11px] text-gray-200">{contact.vendorName}</span>
                        <button
                          type="button"
                          onClick={() => handleSuggestionClick(contact.email, 'to')}
                          className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded-full"
                        >
                          To
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSuggestionClick(contact.email, 'cc')}
                          className="text-[10px] bg-gray-600 hover:bg-gray-500 text-white px-2 py-0.5 rounded-full"
                        >
                          Cc
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Cc</label>
              <input
                type="text"
                value={cc}
                onChange={e => setCc(e.target.value)}
                className="w-full bg-gray-900/50 text-white rounded-md p-2 mt-1 text-sm border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="optional"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-gray-900/50 text-white rounded-md p-2 mt-1 text-sm border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                className="w-full bg-gray-900/50 text-white rounded-md p-3 mt-1 text-sm border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <input
                id="attach-file"
                type="checkbox"
                checked={attachFile}
                onChange={e => setAttachFile(e.target.checked)}
                className="h-4 w-4 text-indigo-500 bg-gray-800 border-gray-700 rounded"
              />
              <label htmlFor="attach-file" className="text-sm text-gray-300 flex items-center gap-2 cursor-pointer">
                <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                Attach artwork file
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="include-compliance"
                type="checkbox"
                checked={includeCompliance}
                onChange={e => setIncludeCompliance(e.target.checked)}
                className="h-4 w-4 text-indigo-500 bg-gray-800 border-gray-700 rounded"
              />
              <label htmlFor="include-compliance" className="text-sm text-gray-300 cursor-pointer">
                Include compliance snapshot
              </label>
            </div>
          </div>

          {includeCompliance && (
            <section className="bg-gray-900/30 border border-gray-800 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Compliance Snapshot</h4>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap">{complianceSummary}</pre>
            </section>
          )}

          <footer className="flex flex-col gap-3 pt-4 border-t border-gray-800">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <GmailIcon className={`w-4 h-4 ${gmailConnection.isConnected ? 'text-green-400' : 'text-yellow-400'}`} />
              {gmailConnection.isConnected
                ? `Sending as ${gmailConnection.email ?? 'connected account'}`
                : 'Workspace Gmail not connected — message will be simulated.'}
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md">
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={disableSend || isSending}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-md"
              >
                <SendIcon className="w-4 h-4" />
                {isSending ? 'Sending...' : 'Send Email'}
              </Button>
            </div>
          </footer>
        </div>
      ) : (
        <p className="text-sm text-gray-300">Select artwork to share.</p>
      )}
    </Modal>
  );
};

async function buildAttachmentFromArtwork(
  artwork: Artwork
): Promise<{ attachment: GmailAttachment; hash?: string | null } | null> {
  if (!artwork.url) {
    return null;
  }

  if (artwork.url.startsWith('data:')) {
    const [meta, data] = artwork.url.split(',');
    const mimeMatch = meta.match(/data:(.*);base64/);
    const mimeType = mimeMatch?.[1] ?? artwork.mimeType ?? 'application/octet-stream';
    return {
      attachment: {
        filename: artwork.fileName || 'artwork.pdf',
        mimeType,
        contentBase64: data,
      },
      hash: await hashBase64(data),
    };
  }

  const response = await fetch(artwork.url);
  if (!response.ok) {
    throw new Error('Unable to fetch artwork file for attachment.');
  }
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const base64Content = arrayBufferToBase64(arrayBuffer);

  return {
    attachment: {
      filename: artwork.fileName || 'artwork',
      mimeType: blob.type || artwork.mimeType || 'application/octet-stream',
      contentBase64: base64Content,
    },
    hash: await hashArrayBuffer(arrayBuffer),
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(binary);
  }

  const nodeBuffer = (globalThis as any)?.Buffer as
    | { from(input: string | Uint8Array, encoding?: string): { toString(encoding: string): string } }
    | undefined;
  if (nodeBuffer?.from) {
    return nodeBuffer.from(binary, 'binary').toString('base64');
  }

  throw new Error('Base64 encoding not supported in this environment.');
}

async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  return hashBytes(new Uint8Array(buffer));
}

async function hashBase64(base64: string): Promise<string> {
  return hashBytes(decodeBase64(base64));
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return bufferToHex(new Uint8Array(digest));
  }
  return bufferToHex(bytes.slice(0, 32));
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const nodeBuffer = (globalThis as any)?.Buffer as
    | { from(input: string, encoding: string): Uint8Array }
    | undefined;
  if (nodeBuffer?.from) {
    return nodeBuffer.from(base64, 'base64');
  }
  throw new Error('Base64 decoding not supported in this environment.');
}

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default ShareArtworkModal;
