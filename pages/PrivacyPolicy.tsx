/**
 * Privacy Policy Page
 * Public-facing page for Google OAuth consent screen requirements
 */

import React from 'react';
import { useTheme } from '../components/ThemeProvider';

const PrivacyPolicy: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

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

  const dividerClass = isLight
    ? 'border-gray-200'
    : 'border-gray-700';

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
          <h1 className={`text-4xl font-bold ${headingClass} mb-2`}>Privacy Policy</h1>
          <p className={mutedClass}>Last Updated: December 29, 2025</p>
        </div>

        {/* Content Card */}
        <div className={`${cardClass} rounded-2xl p-8 md:p-12`}>
          <div className={`prose prose-lg max-w-none ${textClass}`}>

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>1. Introduction</h2>
              <p className={textClass}>
                MuRP ("Ultra Material Resource Planner") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our manufacturing resource planning application.
              </p>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>2. Information We Collect</h2>

              <h3 className={`text-xl font-medium ${headingClass} mt-6 mb-3`}>2.1 Account Information</h3>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li>Name and email address</li>
                <li>Company/organization details</li>
                <li>Role and department information</li>
                <li>Authentication credentials (securely hashed)</li>
              </ul>

              <h3 className={`text-xl font-medium ${headingClass} mt-6 mb-3`}>2.2 Business Data</h3>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li>Inventory records (SKUs, stock levels, pricing)</li>
                <li>Purchase orders and vendor information</li>
                <li>Bills of Materials and production data</li>
                <li>Sales velocity and forecasting data</li>
              </ul>

              <h3 className={`text-xl font-medium ${headingClass} mt-6 mb-3`}>2.3 Google API Data</h3>
              <p className={textClass}>
                When you connect Google services, we access:
              </p>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li><strong>Gmail:</strong> Read and send emails for PO tracking and vendor communication</li>
                <li><strong>Google Sheets:</strong> Import/export inventory and BOM data</li>
                <li><strong>Google Calendar:</strong> Production scheduling integration</li>
                <li><strong>Google Drive:</strong> Artwork and document storage</li>
              </ul>
              <p className={`mt-4 p-4 rounded-lg ${isLight ? 'bg-blue-50 border border-blue-200' : 'bg-blue-900/20 border border-blue-700'}`}>
                <strong>Important:</strong> We only access Google data that you explicitly authorize. OAuth tokens are stored securely server-side and are never exposed to the browser.
              </p>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>3. How We Use Your Information</h2>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li>Provide and maintain the MuRP service</li>
                <li>Process inventory transactions and purchase orders</li>
                <li>Generate AI-powered recommendations (using tier-appropriate AI providers)</li>
                <li>Send PO emails and track vendor communications</li>
                <li>Sync data with integrated services (Finale Inventory, Google Workspace)</li>
                <li>Improve service functionality and user experience</li>
                <li>Communicate service updates and support</li>
              </ul>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>4. Data Storage & Security</h2>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li>All data stored in encrypted PostgreSQL databases (Supabase)</li>
                <li>Row Level Security (RLS) ensures data isolation between users</li>
                <li>HTTPS encryption for all data transmission</li>
                <li>OAuth 2.0 with PKCE for third-party integrations</li>
                <li>No sensitive tokens stored in browser localStorage</li>
                <li>Regular security audits and updates</li>
              </ul>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>5. Third-Party Services</h2>
              <p className={textClass}>
                We integrate with the following third-party services:
              </p>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li><strong>Google APIs:</strong> Gmail, Sheets, Calendar, Drive (OAuth 2.0)</li>
                <li><strong>AI Providers:</strong> OpenAI, Anthropic, Google Gemini (for AI features)</li>
                <li><strong>Supabase:</strong> Database and authentication infrastructure</li>
                <li><strong>Vercel:</strong> Application hosting and AI Gateway</li>
                <li><strong>AfterShip:</strong> Shipment tracking integration</li>
              </ul>
              <p className={`mt-4 ${textClass}`}>
                Each third-party service has its own privacy policy. We encourage you to review their policies.
              </p>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>6. Data Sharing</h2>
              <p className={textClass}>
                We do <strong>not</strong> sell your personal data. We share data only:
              </p>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li>With integrated services you explicitly connect (Google, Finale)</li>
                <li>With AI providers for processing your queries (data is not used for training)</li>
                <li>When required by law or legal process</li>
                <li>To protect our rights or prevent fraud</li>
              </ul>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>7. Your Rights</h2>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li><strong>Access:</strong> Request a copy of your data</li>
                <li><strong>Correction:</strong> Update inaccurate information</li>
                <li><strong>Deletion:</strong> Request account and data deletion</li>
                <li><strong>Export:</strong> Download your data in standard formats</li>
                <li><strong>Revoke:</strong> Disconnect Google services at any time</li>
              </ul>
              <p className={`mt-4 ${textClass}`}>
                To exercise these rights, contact us at{' '}
                <a href="mailto:privacy@buildasoil.com" className={linkClass}>
                  privacy@buildasoil.com
                </a>
              </p>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>8. Data Retention</h2>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li>Active accounts: Data retained while account is active</li>
                <li>Canceled accounts: Data deleted within 30 days</li>
                <li>Audit logs: Retained for 90 days</li>
                <li>Legal holds: Data retained as required by law</li>
              </ul>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>9. Cookies & Tracking</h2>
              <p className={textClass}>
                We use essential cookies for:
              </p>
              <ul className={`list-disc pl-6 space-y-2 ${textClass}`}>
                <li>Authentication session management</li>
                <li>User preference storage (theme, sidebar state)</li>
                <li>Security (CSRF protection)</li>
              </ul>
              <p className={`mt-4 ${textClass}`}>
                We do not use third-party advertising or tracking cookies.
              </p>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>10. Children's Privacy</h2>
              <p className={textClass}>
                MuRP is a business application not intended for use by children under 18. We do not knowingly collect information from children.
              </p>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section className="mb-8">
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>11. Changes to This Policy</h2>
              <p className={textClass}>
                We may update this Privacy Policy periodically. Material changes will be notified via email or in-app notification. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <hr className={`my-8 ${dividerClass}`} />

            <section>
              <h2 className={`text-2xl font-semibold ${headingClass} mb-4`}>12. Contact Us</h2>
              <p className={textClass}>
                For privacy-related questions or concerns:
              </p>
              <ul className={`list-none space-y-2 mt-4 ${textClass}`}>
                <li><strong>Email:</strong>{' '}
                  <a href="mailto:privacy@buildasoil.com" className={linkClass}>
                    privacy@buildasoil.com
                  </a>
                </li>
                <li><strong>Company:</strong> BuildASoil</li>
                <li><strong>Address:</strong> 5146 N. Townsend Ave, Montrose, CO 81401 USA</li>
              </ul>
            </section>

          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className={mutedClass}>
            <a href="/terms" className={linkClass}>Terms of Service</a>
            {' | '}
            <a href="/" className={linkClass}>Back to MuRP</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
