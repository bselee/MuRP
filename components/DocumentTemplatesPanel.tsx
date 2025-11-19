/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📄 DOCUMENT TEMPLATES PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Admin settings panel for managing document templates.
 *
 * Features:
 * - Company information settings
 * - Email template editor with AI generation
 * - PDF template stylin with AI suggestions
 * - Template variables reference
 * - Preview functionality
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { aiTemplateGenerator } from '../services/aiTemplateGenerator';
import { BotIcon, SaveIcon, EyeIcon } from './icons';
import { getGoogleDocsService } from '../services/googleDocsService';

interface DocumentTemplatesPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const DocumentTemplatesPanel: React.FC<DocumentTemplatesPanelProps> = ({ addToast }) => {
  // Company Settings State
  const [companyName, setCompanyName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [taxRate, setTaxRate] = useState(0.08);

  // Email Template State
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSignature, setEmailSignature] = useState('');

  // PDF Template State
  const [pdfHeaderText, setPdfHeaderText] = useState('');
  const [pdfFooterText, setPdfFooterText] = useState('');
  const [pdfHeaderColor, setPdfHeaderColor] = useState('#2980b9');

  // UI State
  const [activeTab, setActiveTab] = useState<'company' | 'email' | 'pdf'>('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [variables, setVariables] = useState<any[]>([]);
  const [isExportingDoc, setIsExportingDoc] = useState(false);

  useEffect(() => {
    loadSettings();
    loadVariables();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);

      // Load company settings
      const { data: company, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (company) {
        setCompanyName(company.company_name || '');
        setAddressLine1(company.address_line1 || '');
        setCity(company.city || '');
        setState(company.state || '');
        setPostalCode(company.postal_code || '');
        setPhone(company.phone || '');
        setEmail(company.email || '');
        setTaxRate(company.tax_rate || 0.08);
      }

      // Load default email template
      const { data: emailTemplate, error: emailError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null)
        .single();

      if (emailTemplate) {
        setEmailSubject(emailTemplate.subject_line || '');
        setEmailBody(emailTemplate.body_template || '');
        setEmailSignature(emailTemplate.signature || '');
      }

      // Load default PDF template
      const { data: pdfTemplate, error: pdfError } = await supabase
        .from('pdf_templates')
        .select('*')
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null)
        .single();

      if (pdfTemplate) {
        setPdfHeaderText(pdfTemplate.header_text || '');
        setPdfFooterText(pdfTemplate.footer_text || '');
        setPdfHeaderColor(pdfTemplate.header_color || '#2980b9');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      addToast?.('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadVariables = async () => {
    const vars = await aiTemplateGenerator.getTemplateVariables();
    setVariables(vars);
  };

  const saveCompanySettings = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('company_settings')
        .update({
          company_name: companyName,
          address_line1: addressLine1,
          city,
          state,
          postal_code: postalCode,
          phone,
          email,
          tax_rate: taxRate,
        })
        .eq('id', (await supabase.from('company_settings').select('id').single()).data?.id);

      if (error) throw error;

      addToast?.('Company settings saved', 'success');
    } catch (error) {
      console.error('Error saving company settings:', error);
      addToast?.('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEmailTemplate = async () => {
    try {
      setSaving(true);

      // Update existing default template
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject_line: emailSubject,
          body_template: emailBody,
          signature: emailSignature,
        })
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null);

      if (error) throw error;

      addToast?.('Email template saved', 'success');
    } catch (error) {
      console.error('Error saving email template:', error);
      addToast?.('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePDFTemplate = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('pdf_templates')
        .update({
          header_text: pdfHeaderText,
          footer_text: pdfFooterText,
          header_color: pdfHeaderColor,
        })
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null);

      if (error) throw error;

      addToast?.('PDF template saved', 'success');
    } catch (error) {
      console.error('Error saving PDF template:', error);
      addToast?.('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const buildTemplateSummary = () => {
    return `Company Information\n======================\nName: ${companyName}\nAddress: ${addressLine1 || ''}\n${city || ''}, ${state || ''} ${postalCode || ''}\nPhone: ${phone || ''}\nEmail: ${email || ''}\nTax Rate: ${(taxRate * 100).toFixed(2)}%\n\nEmail Template\n===============\nSubject: ${emailSubject}\n\n${emailBody}\n\nSignature:\n${emailSignature}\n\nPDF Template\n============\nHeader: ${pdfHeaderText}\nFooter: ${pdfFooterText}\nHeader Color: ${pdfHeaderColor}`;
  };

  const handleExportToGoogleDoc = async () => {
    try {
      setIsExportingDoc(true);
      const docsService = getGoogleDocsService();
      const { documentUrl } = await docsService.createDocument({
        title: `MuRP Templates ${new Date().toLocaleDateString()}`,
        body: buildTemplateSummary(),
      });
      addToast?.('Template exported to Google Docs', 'success');
      window.open(documentUrl, '_blank');
    } catch (error) {
      console.error('Error exporting template to Google Docs:', error);
      addToast?.('Failed to export template to Google Docs', 'error');
    } finally {
      setIsExportingDoc(false);
    }
  };

  const generateEmailWithAI = async () => {
    try {
      setGenerating(true);
      addToast?.('Generating email template with AI...', 'info');

      const result = await aiTemplateGenerator.generateEmailTemplate({
        templateType: 'email',
        documentType: 'purchase_order',
        companyInfo: {
          name: companyName,
          tone: 'professional',
        },
      });

      setEmailSubject(result.subjectLine);
      setEmailBody(result.bodyTemplate);
      setEmailSignature(result.signature);

      addToast?.('AI template generated! Review and save if you like it.', 'success');
    } catch (error: any) {
      console.error('Error generating template:', error);
      addToast?.(error.message || 'Failed to generate template', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const generatePDFWithAI = async () => {
    try {
      setGenerating(true);
      addToast?.('Generating PDF template with AI...', 'info');

      const result = await aiTemplateGenerator.generatePDFTemplate({
        templateType: 'pdf',
        documentType: 'purchase_order',
        companyInfo: {
          name: companyName,
        },
      });

      setPdfHeaderText(result.headerText);
      setPdfFooterText(result.footerText);
      setPdfHeaderColor(result.headerColor);

      addToast?.('AI template generated! Review and save if you like it.', 'success');
    } catch (error: any) {
      console.error('Error generating template:', error);
      addToast?.(error.message || 'Failed to generate template', 'error');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleExportToGoogleDoc}
          disabled={isExportingDoc}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-md text-sm font-medium transition-colors"
        >
          {isExportingDoc ? 'Exporting…' : 'Export Settings to Google Docs'}
        </button>
      </div>
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-700">
        {[
          { key: 'company', label: 'Company Info' },
          { key: 'email', label: 'Email Templates' },
          { key: 'pdf', label: 'PDF Templates' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === tab.key
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Company Info Tab */}
      {activeTab === 'company' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Address</label>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Street address"
              className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Postal Code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Default Tax Rate (%)</label>
              <input
                type="number"
                value={(taxRate * 100).toFixed(2)}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) / 100)}
                step="0.01"
                min="0"
                max="100"
                className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={saveCompanySettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500"
          >
            <SaveIcon className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Company Info'}
          </button>
        </div>
      )}

      {/* Email Template Tab */}
      {activeTab === 'email' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">Customize the default email template for purchase orders</p>
            <button
              onClick={generateEmailWithAI}
              disabled={generating}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-500"
            >
              <BotIcon className="w-4 h-4" />
              {generating ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Subject Line</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Purchase Order #{{po_number}} from {{company_name}}"
              className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email Body</label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={10}
              placeholder="Hello {{vendor_name}},&#10;&#10;Please find attached..."
              className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Signature</label>
            <textarea
              value={emailSignature}
              onChange={(e) => setEmailSignature(e.target.value)}
              rows={4}
              placeholder="{{company_name}}&#10;Procurement Team"
              className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm font-mono"
            />
          </div>

          {/* Variables Reference */}
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Available Variables</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {variables
                .filter((v) => v.applies_to?.includes('email'))
                .map((v) => (
                  <div key={v.id} className="text-gray-400">
                    <code className="text-indigo-400">{v.variable_key}</code> - {v.description}
                  </div>
                ))}
            </div>
          </div>

          <button
            onClick={saveEmailTemplate}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500"
          >
            <SaveIcon className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Email Template'}
          </button>
        </div>
      )}

      {/* PDF Template Tab */}
      {activeTab === 'pdf' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">Customize the default PDF template for purchase orders</p>
            <button
              onClick={generatePDFWithAI}
              disabled={generating}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-500"
            >
              <BotIcon className="w-4 h-4" />
              {generating ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Header Text</label>
            <input
              type="text"
              value={pdfHeaderText}
              onChange={(e) => setPdfHeaderText(e.target.value)}
              placeholder="PURCHASE ORDER"
              className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Footer Text</label>
            <input
              type="text"
              value={pdfFooterText}
              onChange={(e) => setPdfFooterText(e.target.value)}
              placeholder="Thank you for your business!"
              className="w-full bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Header Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={pdfHeaderColor}
                onChange={(e) => setPdfHeaderColor(e.target.value)}
                className="h-10 w-20 bg-gray-700 border-gray-600 rounded-md"
              />
              <input
                type="text"
                value={pdfHeaderColor}
                onChange={(e) => setPdfHeaderColor(e.target.value)}
                placeholder="#2980b9"
                className="flex-1 bg-gray-700 border-gray-600 rounded-md text-white px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <button
            onClick={savePDFTemplate}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-500"
          >
            <SaveIcon className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save PDF Template'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DocumentTemplatesPanel;
