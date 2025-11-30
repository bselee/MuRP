import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from './Modal';
import type { Artwork, GmailConnection, CompanyEmailSettings } from '../types';
import { GmailIcon, SendIcon, DocumentTextIcon } from './icons';
import { getGoogleGmailService, GmailAttachment } from '../services/googleGmailService';
import { useGoogleAuthPrompt } from '../hooks/useGoogleAuthPrompt';
import { sendCompanyEmail } from '../services/companyEmailService';

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
  artworks: (Artwork & { productName?: string; productSku?: string })[];
  onClose: () => void;
  gmailConnection: GmailConnection;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  currentUser?: { id: string; email: string };
  suggestedContacts?: ContactSuggestion[];
  onShareLogged?: (artworks: (Artwork & { productName?: string; productSku?: string })[], payload: ShareLogResult) => void;
  defaultCc?: string;
  allowedDomains?: string[];
  onConnectGoogle?: () => Promise<boolean>;
  companyEmailSettings: CompanyEmailSettings;
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

const plaintextToHtml = (text: string): string => {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map(segment => segment.split('\n').join('<br/>'))
    .map(paragraph => `<p>${paragraph}</p>`)
    .join('');
};

const ShareArtworkModal: React.FC<ShareArtworkModalProps> = ({
  isOpen,
  artworks,
  onClose,
  gmailConnection,
  addToast,
  currentUser,
  suggestedContacts,
  onShareLogged,
  defaultCc,
  allowedDomains,
  onConnectGoogle,
  companyEmailSettings,
}) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeCompliance, setIncludeCompliance] = useState(true);
  const [attachFile, setAttachFile] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const promptGoogleAuth = useGoogleAuthPrompt(addToast);
  const enforcedDomains = useMemo(
    () => allowedDomains?.map(domain => domain.trim().replace(/^@/, '').toLowerCase()).filter(Boolean) ?? [],
    [allowedDomains],
  );
  const fallbackFrom = gmailConnection.email ?? currentUser?.email ?? 'packaging@regvault.app (simulation)';
  const companySenderActive =
    Boolean(companyEmailSettings.enforceCompanySender && companyEmailSettings.fromAddress);
  const companyProvider = companyEmailSettings.provider ?? 'resend';
  const workspaceMailboxEmail = companyEmailSettings.workspaceMailbox?.email ?? null;
  const displayFromAddress = companySenderActive
    ? companyEmailSettings.fromAddress || workspaceMailboxEmail || fallbackFrom
    : fallbackFrom;
  const useCompanyResend = companySenderActive && companyProvider === 'resend';
  const useCompanyWorkspaceMailbox =
    companySenderActive && companyProvider === 'gmail' && Boolean(workspaceMailboxEmail);
  const companySenderDescription = companySenderActive
    ? `Company sender enforced via ${companyProvider === 'resend' ? 'Resend' : 'Workspace Gmail'}`
    : null;
  const requestGmailConnection = useCallback(async () => {
    if (!onConnectGoogle) {
      return false;
    }
    return promptGoogleAuth({
      reason: 'send artwork packages via Google Workspace Gmail',
      connect: onConnectGoogle,
      postConnectMessage: 'Google Workspace connected. You can now email artwork directly.',
    });
  }, [onConnectGoogle, promptGoogleAuth]);

  const ensureGmailReady = useCallback(async () => {
    if (gmailConnection.isConnected) {
      return true;
    }
    return Boolean(await requestGmailConnection());
  }, [gmailConnection.isConnected, requestGmailConnection]);

  const handleConnectClick = useCallback(async () => {
    if (gmailConnection.isConnected) {
      return;
    }
    await requestGmailConnection();
  }, [gmailConnection.isConnected, requestGmailConnection]);

  useEffect(() => {
    if (isOpen && artworks.length > 0) {
      const isSingle = artworks.length === 1;
      const firstArt = artworks[0];
      
      const defaultSubject = isSingle
        ? `Artwork Update: ${firstArt.fileName || firstArt.productName || 'Label'} (${firstArt.productSku ?? 'no SKU'})`
        : `Artwork Update: ${artworks.length} Files Shared`;

      const fileList = artworks.map(a => `- ${a.fileName} (${a.productSku || 'No SKU'})`).join('\n');
      
      const intro = `Hi Packaging Team,

Here is the latest approved artwork. Please confirm receipt and let us know once it has been queued for print.

Files included:
${fileList}`;

      const closing = `
Thank you,
${currentUser?.email ?? 'RegVault Ops'}
`;
      setSubject(defaultSubject);
      setMessage([intro, closing].join('\n\n'));
      setTo(prev => prev || suggestedContacts?.[0]?.email || '');
      setCc(defaultCc ?? '');
      setIncludeCompliance(true);
      setAttachFile(true);
    } else if (!isOpen) {
      setTo('');
      setCc(defaultCc ?? '');
      setSubject('');
      setMessage('');
    }
  }, [isOpen, artworks, currentUser?.email, suggestedContacts, defaultCc]);

  const handleSuggestionClick = (email: string, target: 'to' | 'cc') => {
    if (target === 'to') {
      setTo(prev => addEmailToField(prev, email));
    } else {
      setCc(prev => addEmailToField(prev, email));
    }
  };

  const complianceSummary = useMemo(() => {
    if (artworks.length === 0) return 'No compliance metadata available.';

    return artworks.map(art => {
      const lines: string[] = [`File: ${art.fileName}`];
      if (art.scanStatus) {
        lines.push(`  AI Scan: ${art.scanStatus === 'completed' ? 'Completed' : art.scanStatus}`);
      }
      if (art.scanCompletedAt) {
        lines.push(`  Last Scan: ${new Date(art.scanCompletedAt).toLocaleString()}`);
      }
      if (art.verified) {
        lines.push(`  Verified${art.verifiedBy ? ` by ${art.verifiedBy}` : ''}`);
      } else {
        lines.push('  Verification: Pending');
      }
      if (art.regulatoryDocLink) {
        lines.push(`  Regulatory Doc: ${art.regulatoryDocLink}`);
      }
      if (art.notes) {
        lines.push(`  Notes: ${art.notes}`);
      }
      return lines.join('\n');
    }).join('\n\n');
  }, [artworks]);

  const handleSend = async () => {
    if (artworks.length === 0) return;
    const toList = parseEmails(to);
    if (toList.length === 0) {
      addToast('Please enter at least one recipient email.', 'error');
      return;
    }
    const ccList = parseEmails(cc);
    if (enforcedDomains.length) {
      const invalid = [...toList, ...ccList].filter(email => {
        const [, domain = ''] = email.toLowerCase().split('@');
        return domain ? !enforcedDomains.includes(domain) : true;
      });
      if (invalid.length) {
        addToast(
          `Blocked recipients. Allowed domains: ${enforcedDomains.join(', ')}. Invalid: ${invalid.join(', ')}`,
          'error',
        );
        return;
      }
    }
    setIsSending(true);
    try {
      let canSendViaGmail = gmailConnection.isConnected;
      if (!canSendViaGmail) {
        canSendViaGmail = await ensureGmailReady();
      }

      let attachments: GmailAttachment[] = [];
      let attachmentHash: string | null = null;

      if (attachFile) {
        for (const art of artworks) {
          try {
            const result = await buildAttachmentFromArtwork(art);
            if (result) {
              attachments.push(result.attachment);
              if (!attachmentHash) attachmentHash = result.hash ?? null;
            }
          } catch (err) {
            console.error(`Failed to attach ${art.fileName}`, err);
            addToast(`Skipped attachment ${art.fileName}: ${(err as Error).message}`, 'error');
          }
        }

        if (attachments.length === 0 && artworks.length > 0) {
          addToast('Unable to attach artwork files. Sending links only.', 'info');
        }
      }

      const sections = [message.trim()];
      if (includeCompliance && complianceSummary.trim().length > 0) {
        sections.push(`---\nCompliance Snapshot:\n${complianceSummary}`);
      }

      const links = artworks.map(a => (a.url ? `- ${a.fileName}: ${a.url}` : null)).filter(Boolean);
      if (links.length > 0) {
        sections.push(`Preview/Download Links:\n${links.join('\n')}`);
      }

      const finalBody = sections.filter(Boolean).join('\n\n');

      if (useCompanyResend) {
        await sendCompanyEmail({
          from: companyEmailSettings.fromAddress,
          to: toList,
          cc: ccList.length ? ccList : undefined,
          subject,
          bodyText: finalBody,
          bodyHtml: plaintextToHtml(finalBody),
          metadata: {
            source: 'artwork_share',
            artworkIds: artworks.map(art => art.id),
          },
        });
        addToast('Artwork emailed via company sender policy.', 'success');
        onShareLogged?.(artworks, {
          to: toList,
          cc: ccList,
          subject,
          includeCompliance,
          attachFile,
          attachmentHash,
          sentViaGmail: false,
          channel: 'resend',
          senderEmail: companyEmailSettings.fromAddress,
        });
        onClose();
        return;
      }

      if (canSendViaGmail) {
        const fromAddress = workspaceMailboxEmail ?? gmailConnection.email ?? currentUser?.email ?? undefined;
        const gmailService = getGoogleGmailService();
        await gmailService.sendEmail({
          to: toList.join(', '),
          cc: ccList.length ? ccList : undefined,
          subject,
          body: finalBody,
          from: fromAddress,
          attachments: attachments.length ? attachments : undefined,
        });
        addToast('Artwork emailed via Google Workspace Gmail.', 'success');
        onShareLogged?.(artworks, {
          to: toList,
          cc: ccList,
          subject,
          includeCompliance,
          attachFile,
          attachmentHash,
          sentViaGmail: true,
          channel: 'gmail',
          senderEmail: fromAddress ?? null,
        });
      } else {
        addToast('Workspace Gmail not connected. Simulating email send.', 'info');
        onShareLogged?.(artworks, {
          to: toList,
          cc: ccList,
          subject,
          includeCompliance,
          attachFile,
          attachmentHash,
          sentViaGmail: false,
          channel: 'simulation',
          senderEmail: gmailConnection.email ?? currentUser?.email ?? null,
        });
      }
      onClose();
    } catch (error) {
      console.error('Share artwork email error:', error);
      addToast(
        `Failed to send artwork email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsSending(false);
    }
  };

  const disableSend = artworks.length === 0 || !to.trim() || !subject.trim() || !message.trim() || isSending;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Email Artwork Package">
      {artworks.length > 0 ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-gray-900/80 via-gray-900/60 to-slate-900/80 p-5 shadow-xl shadow-accent-800/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-accent-300">Artwork Delivery</p>
                <h3 className="text-xl font-semibold text-white mt-1">Share {artworks.length} asset{artworks.length > 1 ? 's' : ''}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {companySenderActive
                    ? `Company mailbox ${displayFromAddress} will handle this send.`
                    : 'Use your connected Gmail account or simulate for testing.'}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className={`px-3 py-1 rounded-full border ${companySenderActive ? 'border-emerald-400 text-emerald-300' : 'border-gray-600 text-gray-300'}`}>
                  {companySenderActive ? 'Managed Mailbox' : 'Personal Sender'}
                </span>
                <span className="px-3 py-1 rounded-full border border-accent-400 text-accent-200">
                  {includeCompliance ? 'Compliance Attached' : 'Metadata Only'}
                </span>
              </div>
            </div>
          </section>

          <section className="bg-gray-900/40 rounded-lg border border-gray-800 p-4 max-h-32 overflow-y-auto">
            {artworks.map(art => (
              <div key={art.id} className="mb-2 last:mb-0 border-b border-gray-700 last:border-0 pb-2 last:pb-0">
                <p className="text-sm font-semibold text-white">{art.fileName}</p>
                <p className="text-xs text-gray-400">
                  {art.productName} • Rev {art.revision}
                </p>
              </div>
            ))}
          </section>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 uppercase">From</label>
              <input
                type="text"
                value={displayFromAddress}
                readOnly
                className="w-full bg-gray-900/50 text-gray-300 rounded-md p-2 mt-1 text-sm border border-gray-700 cursor-not-allowed"
              />
            </div>
            {companySenderActive && (
              <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
                {companySenderDescription}. Replies will go to {companyEmailSettings.fromAddress}.
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 uppercase">To</label>
              <input
                type="text"
                value={to}
                onChange={e => setTo(e.target.value)}
                aria-label="Artwork recipient emails"
                className="w-full bg-gray-900/50 text-white rounded-md p-2 mt-1 text-sm border border-gray-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                placeholder="packaging@example.com"
              />
              {suggestedContacts && suggestedContacts.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] text-gray-500">Suggested packaging contacts</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedContacts.map(contact => (
                      <div
                        key={`${contact.vendorId}-${contact.email}`}
                        className="group flex items-center gap-2 rounded-full bg-gray-900/50 border border-gray-700 px-3 py-1.5 text-xs text-gray-200 shadow-inner shadow-black/40"
                      >
                        <span className="font-medium">{contact.vendorName}</span>
                        <span className="text-[11px] text-gray-400">{contact.email}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleSuggestionClick(contact.email, 'to')}
                            className="rounded-full bg-accent-500/80 px-2 py-0.5 text-[10px] text-white hover:bg-accent-500"
                          >
                            To
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSuggestionClick(contact.email, 'cc')}
                            className="rounded-full bg-gray-600/80 px-2 py-0.5 text-[10px] text-white hover:bg-gray-500"
                          >
                            Cc
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {enforcedDomains.length > 0 && (
                <p className="text-[11px] text-amber-300 mt-2">
                  Allowed domains: {enforcedDomains.join(', ')}.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Cc</label>
              <input
                type="text"
                value={cc}
                onChange={e => setCc(e.target.value)}
                aria-label="Artwork cc emails"
                className="w-full bg-gray-900/50 text-white rounded-md p-2 mt-1 text-sm border border-gray-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                placeholder="optional"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                aria-label="Artwork email subject"
                className="w-full bg-gray-900/50 text-white rounded-md p-2 mt-1 text-sm border border-gray-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                aria-label="Artwork email body"
                className="w-full bg-gray-900/50 text-white rounded-md p-3 mt-1 text-sm border border-gray-700 focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-gray-900/40 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <input
                id="attach-file"
                type="checkbox"
                checked={attachFile}
                onChange={e => setAttachFile(e.target.checked)}
                className="h-4 w-4 text-accent-500 bg-gray-800 border-gray-700 rounded"
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
                className="h-4 w-4 text-accent-500 bg-gray-800 border-gray-700 rounded"
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

          <footer className="flex flex-col gap-4 pt-4 border-t border-gray-800">
            <div className="flex flex-col gap-2 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <GmailIcon
                  className={`w-4 h-4 ${
                    useCompanyResend ? 'text-emerald-300' : gmailConnection.isConnected ? 'text-green-400' : 'text-yellow-400'
                  }`}
                />
                {useCompanyResend
                  ? `Sending as ${companyEmailSettings.fromAddress} via company Resend channel`
                  : useCompanyWorkspaceMailbox
                      ? `Workspace mailbox ${workspaceMailboxEmail} authorized by ${companyEmailSettings.workspaceMailbox?.connectedBy ?? 'admin'}`
                      : gmailConnection.isConnected
                          ? `Sending as ${gmailConnection.email ?? fallbackFrom}`
                          : 'Workspace Gmail not connected — message will be simulated.'}
              </div>
              {!useCompanyResend && !gmailConnection.isConnected && onConnectGoogle && (
                <Button
                  onClick={handleConnectClick}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-md"
                  disabled={isSending}
                >
                  Connect Google Workspace
                </Button>
              )}
            </div>
            {companySenderDescription && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                {companySenderDescription}. Message metadata will be logged automatically for audit and agent hand-off.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md">
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={disableSend || isSending}
                className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 disabled:bg-gray-600 text-white px-4 py-2 rounded-md"
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
