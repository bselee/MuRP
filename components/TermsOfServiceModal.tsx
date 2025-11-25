import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { marked } from 'marked';
import Modal from './Modal';
import Button from '@/components/ui/Button';
import termsUrl from '../docs/TERMS_OF_SERVICE.md?url';
import { ArrowDownTrayIcon, DocumentTextIcon, RefreshCcwIcon } from './icons';
import { useTheme } from './ThemeProvider';

marked.setOptions({ mangle: false, headerIds: false });

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const markdownComponents = {
  h1: ({ children }: { children: React.ReactNode }) => (
    <h1 className="text-3xl font-bold tracking-tight text-current mt-2 mb-4">{children}</h1>
  ),
  h2: ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-2xl font-semibold text-current mt-8 mb-3">{children}</h2>
  ),
  h3: ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xl font-semibold text-current mt-6 mb-2">{children}</h3>
  ),
  p: ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm leading-relaxed text-current mb-4">{children}</p>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-current mb-4">{children}</ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-current mb-4">{children}</ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => (
    <li className="text-sm leading-relaxed text-current">{children}</li>
  ),
  strong: ({ children }: { children: React.ReactNode }) => (
    <strong className="font-semibold text-current">{children}</strong>
  ),
  hr: () => <hr className="my-6 border-gray-700/50" />,
};

const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({ isOpen, onClose }) => {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  useEffect(() => {
    if (!isOpen || markdown) return;
    let isCancelled = false;
    setLoading(true);
    setError(null);

    fetch(termsUrl)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Failed to load terms (${response.status})`);
        }
        return response.text();
      })
      .then(content => {
        if (!isCancelled) {
          setMarkdown(content);
        }
      })
      .catch(err => {
        if (!isCancelled) {
          setError(err.message || 'Unable to load the Terms of Service right now.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, markdown]);

  const htmlVersion = useMemo(() => {
    if (!markdown) return '';
    return marked.parse(markdown);
  }, [markdown]);

  const effectiveDate = useMemo(() => {
    const match = markdown.match(/\*\*Effective Date:\*\*\s*(.+)/);
    return match ? match[1].trim() : 'November 20, 2025';
  }, [markdown]);

  const lastUpdated = useMemo(() => {
    const match = markdown.match(/\*\*Last Updated:\*\*\s*(.+)/);
    return match ? match[1].trim() : 'November 20, 2025';
  }, [markdown]);

  const openLegalWindow = (autoPrint = false) => {
    if (!htmlVersion) return;
    setIsGeneratingPdf(true);
    const legalWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
    if (!legalWindow) {
      setIsGeneratingPdf(false);
      return;
    }
    legalWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>MuRP Terms of Service</title>
          <style>
            :root {
              color-scheme: light;
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            body {
              margin: 0;
              padding: 48px;
              color: #0f172a;
              background: #fff;
              line-height: 1.65;
              font-size: 14px;
            }
            h1, h2, h3 {
              color: #0f172a;
              margin-top: 32px;
              margin-bottom: 12px;
            }
            h1 { font-size: 32px; }
            h2 { font-size: 24px; }
            h3 { font-size: 20px; }
            p {
              margin-bottom: 16px;
            }
            ul, ol {
              padding-left: 20px;
              margin-bottom: 16px;
            }
            li {
              margin-bottom: 8px;
            }
            strong {
              font-weight: 600;
            }
            hr {
              margin: 32px 0;
              border: none;
              border-top: 1px solid #e2e8f0;
            }
            .meta {
              font-size: 13px;
              color: #475569;
              margin-bottom: 24px;
            }
          </style>
        </head>
        <body>
          <div class="meta">
            <div><strong>Effective Date:</strong> ${effectiveDate}</div>
            <div><strong>Last Updated:</strong> ${lastUpdated}</div>
          </div>
          ${htmlVersion}
        </body>
      </html>
    `);
    legalWindow.document.close();
    legalWindow.focus();
    if (autoPrint) {
      legalWindow.print();
    }
    setTimeout(() => setIsGeneratingPdf(false), 600);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="MuRP Terms of Service"
      subtitle="Review the full legal terms without leaving the app"
      size="large"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs sm:text-sm text-gray-400 space-y-1">
            <div>
              <span className="text-gray-300 font-semibold">Effective Date:</span>{' '}
              <span className="text-gray-200">{effectiveDate}</span>
            </div>
            <div>
              <span className="text-gray-300 font-semibold">Last Updated:</span>{' '}
              <span className="text-gray-200">{lastUpdated}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMarkdown('')}
              leftIcon={<RefreshCcwIcon className="w-4 h-4" />}
            >
              Refresh Copy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openLegalWindow(false)}
              leftIcon={<DocumentTextIcon className="w-4 h-4" />}
              disabled={!htmlVersion || isGeneratingPdf}
            >
              Open Standalone View
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openLegalWindow(true)}
              leftIcon={<ArrowDownTrayIcon className="w-4 h-4" />}
              loading={isGeneratingPdf}
              disabled={!htmlVersion}
            >
              Download PDF
            </Button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400 text-sm">Loading the latest terms…</div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && markdown && (
          <div
            className={`terms-markdown ${
              isLight ? 'terms-markdown--light' : 'terms-markdown--dark'
            }`}
          >
            <ReactMarkdown components={markdownComponents as any}>{markdown}</ReactMarkdown>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TermsOfServiceModal;
