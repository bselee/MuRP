/**
 * Terms of Service Page
 * Public-facing page for Google OAuth consent screen requirements
 */

import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../components/ThemeProvider';
import termsUrl from '../docs/TERMS_OF_SERVICE.md?url';

const TermsOfService: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerClass = isLight
    ? 'min-h-screen bg-gray-50'
    : 'min-h-screen bg-gray-900';

  const cardClass = isLight
    ? 'bg-white shadow-lg border border-gray-200'
    : 'bg-gray-800 border border-gray-700';

  const textClass = isLight
    ? 'text-gray-900'
    : 'text-gray-100';

  const mutedClass = isLight
    ? 'text-gray-600'
    : 'text-gray-400';

  const headingClass = isLight
    ? 'text-gray-900'
    : 'text-white';

  const linkClass = isLight
    ? 'text-blue-600 hover:text-blue-700'
    : 'text-blue-400 hover:text-blue-300';

  useEffect(() => {
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
  }, []);

  const markdownComponents = useMemo(() => ({
    h1: ({ children }: { children: React.ReactNode }) => (
      <h1 className={`text-3xl font-bold tracking-tight ${headingClass} mt-2 mb-4`}>{children}</h1>
    ),
    h2: ({ children }: { children: React.ReactNode }) => (
      <h2 className={`text-2xl font-semibold ${headingClass} mt-8 mb-3`}>{children}</h2>
    ),
    h3: ({ children }: { children: React.ReactNode }) => (
      <h3 className={`text-xl font-semibold ${headingClass} mt-6 mb-2`}>{children}</h3>
    ),
    p: ({ children }: { children: React.ReactNode }) => (
      <p className={`text-sm leading-relaxed ${textClass} mb-4`}>{children}</p>
    ),
    ul: ({ children }: { children: React.ReactNode }) => (
      <ul className={`list-disc space-y-1 pl-5 text-sm leading-relaxed ${textClass} mb-4`}>{children}</ul>
    ),
    ol: ({ children }: { children: React.ReactNode }) => (
      <ol className={`list-decimal space-y-1 pl-5 text-sm leading-relaxed ${textClass} mb-4`}>{children}</ol>
    ),
    li: ({ children }: { children: React.ReactNode }) => (
      <li className={`text-sm leading-relaxed ${textClass}`}>{children}</li>
    ),
    strong: ({ children }: { children: React.ReactNode }) => (
      <strong className={`font-semibold ${textClass}`}>{children}</strong>
    ),
    hr: () => <hr className={`my-6 ${isLight ? 'border-gray-200' : 'border-gray-700'}`} />,
    a: ({ href, children }: { href?: string; children: React.ReactNode }) => (
      <a href={href} className={linkClass} target="_blank" rel="noopener noreferrer">{children}</a>
    ),
  }), [headingClass, textClass, linkClass, isLight]);

  return (
    <div className={containerClass}>
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <a href="/" className={`inline-flex items-center gap-2 ${linkClass} mb-4`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to MuRP
          </a>
          <h1 className={`text-4xl font-bold ${headingClass} mb-2`}>Terms of Service</h1>
          <p className={mutedClass}>Effective Date: November 20, 2025</p>
        </div>

        {/* Content Card */}
        <div className={`${cardClass} rounded-2xl p-8 md:p-12`}>
          {loading && (
            <div className={`text-center py-12 ${mutedClass}`}>
              Loading terms of service...
            </div>
          )}

          {error && (
            <div className={`rounded-xl border ${isLight ? 'border-red-300 bg-red-50' : 'border-red-500/40 bg-red-500/10'} p-4 text-sm ${isLight ? 'text-red-700' : 'text-red-200'}`}>
              {error}
            </div>
          )}

          {!loading && !error && markdown && (
            <div className="terms-content">
              <ReactMarkdown components={markdownComponents as any}>{markdown}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className={mutedClass}>
            <a href="/privacy" className={linkClass}>Privacy Policy</a>
            {' | '}
            <a href="/" className={linkClass}>Back to MuRP</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
