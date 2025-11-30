import Button from '@/components/ui/Button';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import { aiTemplateGenerator } from '../services/aiTemplateGenerator';
import {
  BotIcon,
  SaveIcon,
  MagicSparklesIcon,
  TrashIcon,
  PlusCircleIcon,
  GripVerticalIcon,
  PhotoIcon,
  InformationCircleIcon,
  EyeIcon,
} from './icons';
import { getGoogleDocsService } from '../services/googleDocsService';

interface DocumentTemplatesPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type EmailBlockType = 'intro' | 'details' | 'cta' | 'closing' | 'custom';

interface EmailBlock {
  id: string;
  label: string;
  type: EmailBlockType;
  content: string;
}

type PdfSectionId =
  | 'branding'
  | 'poMeta'
  | 'company'
  | 'vendor'
  | 'shipTo'
  | 'lineItems'
  | 'totals'
  | 'notes';

interface PdfSection {
  id: PdfSectionId;
  title: string;
  description: string;
  enabled: boolean;
}

const EMAIL_BLOCK_PRESETS: EmailBlock[] = [
  {
    id: 'intro',
    label: 'Intro / Greeting',
    type: 'intro',
    content:
      'Hello {{vendor_name}},\n\nThank you for moving quickly on Purchase Order #{{po_number}}.',
  },
  {
    id: 'orderSummary',
    label: 'Order summary',
    type: 'details',
    content:
      'Order date: {{order_date}}\nExpected delivery: {{expected_date}}\nTotal: {{total_amount}}\nItems: {{item_count}} line items',
  },
  {
    id: 'cta',
    label: 'Call to action',
    type: 'cta',
    content:
      'Please confirm receipt of this PO and share tracking information as soon as it becomes available so we can keep production synchronized.',
  },
  {
    id: 'closing',
    label: 'Closing',
    type: 'closing',
    content: 'Appreciate the partnership,\n{{company_name}} purchasing',
  },
];

const PDF_SECTION_PRESETS: PdfSection[] = [
  {
    id: 'branding',
    title: 'Branding header',
    description: 'Logo, PO title, and accent color.',
    enabled: true,
  },
  {
    id: 'poMeta',
    title: 'PO metadata',
    description: 'PO number, order date, and expected delivery.',
    enabled: true,
  },
  {
    id: 'company',
    title: 'From / Company info',
    description: 'Your company mailing address and contact info.',
    enabled: true,
  },
  {
    id: 'vendor',
    title: 'Vendor summary',
    description: 'Vendor name, address, and phone/email.',
    enabled: true,
  },
  {
    id: 'shipTo',
    title: 'Ship-to instructions',
    description: 'Destination and receiving contact (if provided on the PO).',
    enabled: true,
  },
  {
    id: 'lineItems',
    title: 'Line items table',
    description: 'Itemized list with SKU, qty, and extended totals.',
    enabled: true,
  },
  {
    id: 'totals',
    title: 'Totals & taxes',
    description: 'Subtotal, tax, and grand total row.',
    enabled: true,
  },
  {
    id: 'notes',
    title: 'Notes & footer',
    description: 'Vendor notes plus footer message.',
    enabled: true,
  },
];

const PDF_FONTS = [
  { value: 'helvetica', label: 'Helvetica (clean & modern)' },
  { value: 'times', label: 'Times New Roman (formal)' },
  { value: 'courier', label: 'Courier (monospace)' },
];

const generateId = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

const serializeEmailBlocks = (blocks: EmailBlock[]) =>
  blocks
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join('\n\n');

const normalizeEmailBlocks = (body: string, layoutConfig?: any): EmailBlock[] => {
  if (layoutConfig?.sections?.length) {
    return layoutConfig.sections.map((section: any, index: number) => ({
      id: section.id ?? generateId(),
      label: section.label ?? `Section ${index + 1}`,
      type: (section.type as EmailBlockType) ?? 'custom',
      content: section.content ?? '',
    }));
  }

  if (!body) {
    return EMAIL_BLOCK_PRESETS.map((preset) => ({ ...preset, id: generateId() }));
  }

  const fragments = body.split(/\n{2,}/).map((fragment) => fragment.trim());
  if (!fragments.length) {
    return EMAIL_BLOCK_PRESETS.map((preset) => ({ ...preset, id: generateId() }));
  }

  return fragments.map((fragment, index) => ({
    id: generateId(),
    label: `Section ${index + 1}`,
    type: 'custom',
    content: fragment,
  }));
};

const normalizePdfSections = (layoutConfig?: any): PdfSection[] => {
  const layoutSections: PdfSection[] = layoutConfig?.sections?.map((section: any) => ({
    id: section.id as PdfSectionId,
    title: section.title ?? PDF_SECTION_PRESETS.find((preset) => preset.id === section.id)?.title ?? section.id,
    description:
      PDF_SECTION_PRESETS.find((preset) => preset.id === section.id)?.description ?? 'Custom section',
    enabled: section.enabled ?? true,
  })) ?? [];

  const merged: PdfSection[] = [];
  PDF_SECTION_PRESETS.forEach((preset) => {
    const existing = layoutSections.find((section) => section.id === preset.id);
    if (existing) {
      merged.push({
        ...preset,
        ...existing,
      });
    } else {
      merged.push({ ...preset });
    }
  });

  // Maintain the order from layout config if provided, otherwise default order.
  if (layoutSections.length) {
    const orderMap = new Map(layoutSections.map((section, index) => [section.id, index]));
    merged.sort((a, b) => {
      const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }

  return merged;
};

const companyAddressSummary = (company: {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}) => {
  const lines = [
    company.address1,
    company.address2,
    [company.city, company.state, company.postalCode].filter(Boolean).join(', '),
    company.country,
  ].filter(Boolean);
  return lines.join('\n');
};

const DocumentTemplatesPanel: React.FC<DocumentTemplatesPanelProps> = ({ addToast }) => {
  // Company settings
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('USA');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [taxRate, setTaxRate] = useState(0.08);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Email template
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBlocks, setEmailBlocks] = useState<EmailBlock[]>(EMAIL_BLOCK_PRESETS);
  const [emailSignature, setEmailSignature] = useState('');

  // PDF template
  const [pdfHeaderText, setPdfHeaderText] = useState('PURCHASE ORDER');
  const [pdfFooterText, setPdfFooterText] = useState('Thank you for your business!');
  const [pdfHeaderColor, setPdfHeaderColor] = useState('#2980b9');
  const [pdfFontFamily, setPdfFontFamily] = useState('helvetica');
  const [pdfSections, setPdfSections] = useState<PdfSection[]>(PDF_SECTION_PRESETS);
  const [showLogo, setShowLogo] = useState(true);
  const [showCompanyInfo, setShowCompanyInfo] = useState(true);
  const [showTax, setShowTax] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<'company' | 'email' | 'pdf'>('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [variables, setVariables] = useState<any[]>([]);
  const [isExportingDoc, setIsExportingDoc] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [emailDragId, setEmailDragId] = useState<string | null>(null);
  const [pdfDragId, setPdfDragId] = useState<PdfSectionId | null>(null);

  useEffect(() => {
    void loadSettings();
    void loadVariables();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);

      const { data: company } = await supabase
        .from('company_settings')
        .select('*')
        .maybeSingle();

      if (company) {
        setCompanyId(company.id);
        setCompanyName(company.company_name ?? '');
        setAddressLine1(company.address_line1 ?? '');
        setAddressLine2(company.address_line2 ?? '');
        setCity(company.city ?? '');
        setState(company.state ?? '');
        setPostalCode(company.postal_code ?? '');
        setCountry(company.country ?? 'USA');
        setPhone(company.phone ?? '');
        setEmail(company.email ?? '');
        setWebsite(company.website ?? '');
        setTaxRate(company.tax_rate ?? 0.08);
        setLogoDataUrl(company.logo_url ?? null);
      }

      const { data: emailTemplate } = await supabase
        .from('email_templates')
        .select('subject_line, body_template, signature, layout_config')
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null)
        .maybeSingle();

      if (emailTemplate) {
        setEmailSubject(emailTemplate.subject_line ?? '');
        setEmailBlocks(normalizeEmailBlocks(emailTemplate.body_template ?? '', emailTemplate.layout_config));
        setEmailSignature(emailTemplate.signature ?? '');
      }

      const { data: pdfTemplate } = await supabase
        .from('pdf_templates')
        .select('header_text, footer_text, header_color, show_logo, show_company_info, show_tax, font_family, layout_config')
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null)
        .maybeSingle();

      if (pdfTemplate) {
        setPdfHeaderText(pdfTemplate.header_text ?? 'PURCHASE ORDER');
        setPdfFooterText(pdfTemplate.footer_text ?? 'Thank you for your business!');
        setPdfHeaderColor(pdfTemplate.header_color ?? '#2980b9');
        setShowLogo(pdfTemplate.show_logo !== false);
        setShowCompanyInfo(pdfTemplate.show_company_info !== false);
        setShowTax(pdfTemplate.show_tax !== false);
        setPdfFontFamily(pdfTemplate.font_family ?? 'helvetica');
        setPdfSections(normalizePdfSections(pdfTemplate.layout_config));
      }
    } catch (error) {
      console.error('[DocumentTemplatesPanel] load error', error);
      addToast?.('Failed to load template settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadVariables = async () => {
    try {
      const vars = await aiTemplateGenerator.getTemplateVariables();
      setVariables(vars);
    } catch (error) {
      console.error('[DocumentTemplatesPanel] template variable load failed', error);
    }
  };

  const serializeEmailLayoutConfig = () => ({
    version: 1,
    sections: emailBlocks.map((block) => ({
      id: block.id,
      label: block.label,
      type: block.type,
      content: block.content,
    })),
  });

  const serializePdfLayoutConfig = () => ({
    version: 1,
    sections: pdfSections.map((section) => ({
      id: section.id,
      title: section.title,
      enabled: section.enabled,
    })),
  });

  const handleCompanyLogoChange = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast?.('Please upload an image file.', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast?.('Logo must be smaller than 2MB.', 'error');
      return;
    }

    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result?.toString() ?? null;
      setLogoDataUrl(result);
      setLogoUploading(false);
    };
    reader.onerror = () => {
      addToast?.('Failed to read image file.', 'error');
      setLogoUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleCompanyLogoChange(event.dataTransfer.files[0]);
      event.dataTransfer.clearData();
    }
  };

  const saveCompanySettings = async () => {
    try {
      setSaving(true);
      if (companyId) {
        const { error } = await supabase
          .from('company_settings')
          .update({
            company_name: companyName,
            address_line1: addressLine1,
            address_line2: addressLine2,
            city,
            state,
            postal_code: postalCode,
            country,
            phone,
            email,
            website,
            tax_rate: taxRate,
            logo_url: logoDataUrl,
          })
          .eq('id', companyId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('company_settings')
          .insert({
            company_name: companyName,
            address_line1: addressLine1,
            address_line2: addressLine2,
            city,
            state,
            postal_code: postalCode,
            country,
            phone,
            email,
            website,
            tax_rate: taxRate,
            logo_url: logoDataUrl,
          })
          .select('id')
          .single();
        if (error) throw error;
        setCompanyId(data.id);
      }
      addToast?.('Company settings saved', 'success');
    } catch (error) {
      console.error('[DocumentTemplatesPanel] company save error', error);
      addToast?.('Failed to save company settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEmailTemplate = async () => {
    try {
      setSaving(true);
      const bodyTemplate = serializeEmailBlocks(emailBlocks);
      const layoutConfig = serializeEmailLayoutConfig();
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject_line: emailSubject,
          body_template: bodyTemplate,
          signature: emailSignature,
          layout_config: layoutConfig,
        })
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null);
      if (error) throw error;
      addToast?.('Email template saved', 'success');
    } catch (error) {
      console.error('[DocumentTemplatesPanel] email save error', error);
      addToast?.('Failed to save email template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePDFTemplate = async () => {
    try {
      setSaving(true);
      const layoutConfig = serializePdfLayoutConfig();
      const { error } = await supabase
        .from('pdf_templates')
        .update({
          header_text: pdfHeaderText,
          footer_text: pdfFooterText,
          header_color: pdfHeaderColor,
          show_logo: showLogo,
          show_company_info: showCompanyInfo,
          show_tax: showTax,
          font_family: pdfFontFamily,
          layout_config: layoutConfig,
        })
        .eq('is_default', true)
        .eq('template_type', 'purchase_order')
        .is('vendor_id', null);
      if (error) throw error;
      addToast?.('PDF template saved', 'success');
    } catch (error) {
      console.error('[DocumentTemplatesPanel] pdf save error', error);
      addToast?.('Failed to save PDF template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const buildTemplateSummary = () => {
    const company = {
      address1: addressLine1,
      address2: addressLine2,
      city,
      state,
      postalCode,
      country,
    };
    return `Company Information
======================
Name: ${companyName}
Address:
${companyAddressSummary(company)}
Phone: ${phone || '—'}
Email: ${email || '—'}
Website: ${website || '—'}
Tax Rate: ${(taxRate * 100).toFixed(2)}%

Email Template
===============
Subject: ${emailSubject}

${serializeEmailBlocks(emailBlocks)}

Signature:
${emailSignature}

PDF Template
============
Header: ${pdfHeaderText}
Footer: ${pdfFooterText}
Font: ${pdfFontFamily}
Header Color: ${pdfHeaderColor}
Sections: ${pdfSections
      .map((section) => `${section.enabled ? '✓' : '✗'} ${section.title}`)
      .join(', ')}`;
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

  const handleGenerateEmailWithAI = async () => {
    try {
      setGenerating(true);
      addToast?.('Generating email template with AI…', 'info');
      const result = await aiTemplateGenerator.generateEmailTemplate({
        templateType: 'email',
        documentType: 'purchase_order',
        companyInfo: {
          name: companyName,
          tone: 'professional',
        },
      });
      setEmailSubject(result.subjectLine);
      setEmailBlocks(normalizeEmailBlocks(result.bodyTemplate));
      setEmailSignature(result.signature);
      addToast?.('AI template generated! Review and save if you like it.', 'success');
    } catch (error: any) {
      console.error('[DocumentTemplatesPanel] AI email error', error);
      addToast?.(error.message ?? 'Failed to generate template', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePdfWithAI = async () => {
    try {
      setGenerating(true);
      addToast?.('Generating PDF styles with AI…', 'info');
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
      addToast?.(result.explanation ?? 'PDF style updated', 'success');
    } catch (error: any) {
      console.error('[DocumentTemplatesPanel] AI pdf error', error);
      addToast?.(error.message ?? 'Failed to generate PDF styles', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const emailPreview = useMemo(() => {
    const body = serializeEmailBlocks(emailBlocks);
    return `${body}\n\n${emailSignature}`.trim();
  }, [emailBlocks, emailSignature]);

  const handleBlockReorder = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    const currentIndex = emailBlocks.findIndex((block) => block.id === dragId);
    const targetIndex = emailBlocks.findIndex((block) => block.id === targetId);
    if (currentIndex === -1 || targetIndex === -1) return;
    const updated = [...emailBlocks];
    const [removed] = updated.splice(currentIndex, 1);
    updated.splice(targetIndex, 0, removed);
    setEmailBlocks(updated);
  };

  const handlePdfReorder = (dragId: PdfSectionId, targetId: PdfSectionId) => {
    if (dragId === targetId) return;
    const currentIndex = pdfSections.findIndex((section) => section.id === dragId);
    const targetIndex = pdfSections.findIndex((section) => section.id === targetId);
    if (currentIndex === -1 || targetIndex === -1) return;
    const updated = [...pdfSections];
    const [removed] = updated.splice(currentIndex, 1);
    updated.splice(targetIndex, 0, removed);
    setPdfSections(updated);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading templates…</div>;
  }

  const renderEmailBlocks = () => (
    <div className="space-y-4">
      {emailBlocks.map((block) => (
        <div
          key={block.id}
          draggable
          onDragStart={() => setEmailDragId(block.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (emailDragId) {
              handleBlockReorder(emailDragId, block.id);
            }
            setEmailDragId(null);
          }}
          className="rounded-xl border border-white/10 bg-gray-900/50 p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <GripVerticalIcon className="w-4 h-4 text-gray-500 mt-1" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="flex-1 bg-transparent border-b border-gray-700 text-white text-sm font-semibold focus:border-accent-400"
                  value={block.label}
                  onChange={(event) =>
                    setEmailBlocks((prev) =>
                      prev.map((item) => (item.id === block.id ? { ...item, label: event.target.value } : item)),
                    )
                  }
                />
                <select
                  value={block.type}
                  onChange={(event) =>
                    setEmailBlocks((prev) =>
                      prev.map((item) => (item.id === block.id ? { ...item, type: event.target.value as EmailBlockType } : item)),
                    )
                  }
                  className="text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-300"
                >
                  <option value="intro">Intro</option>
                  <option value="details">Details</option>
                  <option value="cta">CTA</option>
                  <option value="closing">Closing</option>
                  <option value="custom">Custom</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Use AI to rewrite the entire email"
                  onClick={handleGenerateEmailWithAI}
                >
                  <MagicSparklesIcon className="w-4 h-4 text-accent-300" />
                </Button>
                {emailBlocks.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEmailBlocks((prev) => prev.filter((item) => item.id !== block.id))}
                  >
                    <TrashIcon className="w-4 h-4 text-rose-300" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <textarea
            value={block.content}
            onChange={(event) =>
              setEmailBlocks((prev) =>
                prev.map((item) => (item.id === block.id ? { ...item, content: event.target.value } : item)),
              )
            }
            rows={5}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            placeholder="Write the section copy here. Use merge fields like {{po_number}} or {{vendor_name}}."
          />
        </div>
      ))}

      <Button
        onClick={() =>
          setEmailBlocks((prev) => [
            ...prev,
            {
              id: generateId(),
              label: `Section ${prev.length + 1}`,
              type: 'custom',
              content: '',
            },
          ])
        }
        variant="ghost"
        className="inline-flex items-center gap-2 text-accent-200"
      >
        <PlusCircleIcon className="w-4 h-4" />
        Add block
      </Button>
    </div>
  );

  const renderPdfSections = () => (
    <div className="space-y-3">
      {pdfSections.map((section) => (
        <div
          key={section.id}
          draggable
          onDragStart={() => setPdfDragId(section.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (pdfDragId) {
              handlePdfReorder(pdfDragId, section.id);
            }
            setPdfDragId(null);
          }}
          className="flex flex-col gap-3 rounded-xl border border-white/10 bg-gray-900/40 p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GripVerticalIcon className="w-4 h-4 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{section.title}</p>
              <p className="text-xs text-gray-400">{section.description}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-200">
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={(event) =>
                  setPdfSections((prev) =>
                    prev.map((item) => (item.id === section.id ? { ...item, enabled: event.target.checked } : item)),
                  )
                }
                className="rounded border-gray-600 bg-gray-800 text-accent-500 focus:ring-accent-500"
              />
              Show
            </label>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button
          onClick={handleExportToGoogleDoc}
          disabled={isExportingDoc}
          className="px-4 py-2 bg-accent-500 hover:bg-accent-600 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-md text-sm font-medium transition-colors"
        >
          {isExportingDoc ? 'Exporting…' : 'Export Settings to Google Docs'}
        </Button>
      </div>

      <div className="flex gap-2 border-b border-gray-800">
        {[
          { key: 'company', label: 'Company & Branding' },
          { key: 'email', label: 'Email Templates' },
          { key: 'pdf', label: 'PDF Templates' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'
            }`}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Support Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Address line 1</label>
            <input
              type="text"
              value={addressLine1}
              onChange={(event) => setAddressLine1(event.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Address line 2</label>
            <input
              type="text"
              value={addressLine2}
              onChange={(event) => setAddressLine2(event.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">State / Province</label>
              <input
                type="text"
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Postal code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Website</label>
              <input
                type="text"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Default tax rate (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={(taxRate * 100).toFixed(2)}
                onChange={(event) => setTaxRate(Number(event.target.value) / 100)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Logo</label>
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-gray-900/40 p-6 text-center text-sm text-gray-400"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleLogoDrop}
            >
              {logoDataUrl ? (
                <>
                  <img src={logoDataUrl} alt="Company logo" className="max-h-24 object-contain" />
                  <div className="flex gap-3">
                    <Button variant="ghost" size="sm" onClick={() => logoDataUrl && window.open(logoDataUrl, '_blank')}>
                      Preview
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setLogoDataUrl(null)}>
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <PhotoIcon className="w-10 h-10 text-gray-600" />
                  <p>Drag & drop your logo (PNG/SVG, max 2MB) or</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={logoUploading}
                  >
                    {logoUploading ? 'Uploading…' : 'Upload image'}
                  </Button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(event) => event.target.files && handleCompanyLogoChange(event.target.files[0])}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Logos are stored securely in Supabase and embedded directly into generated PDFs.
            </p>
          </div>

          <Button
            onClick={saveCompanySettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-500"
          >
            <SaveIcon className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save company info'}
          </Button>
        </div>
      )}

      {/* Email Tab */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-400">
                Customize the default purchase order email and drag blocks to change the flow.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerateEmailWithAI}
              disabled={generating}
              title="Let the AI assistant rewrite the email template"
            >
              <BotIcon className="w-4 h-4 text-purple-300" />
              AI rewrite
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Subject line</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(event) => setEmailSubject(event.target.value)}
              placeholder="Purchase Order #{{po_number}} from {{company_name}}"
              className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm font-mono"
            />
          </div>

          {renderEmailBlocks()}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Signature</label>
            <textarea
              value={emailSignature}
              onChange={(event) => setEmailSignature(event.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm font-mono"
              placeholder="{{company_name}}\nProcurement team"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <InformationCircleIcon className="w-4 h-4 text-accent-300" />
                <p className="text-sm font-semibold text-white">Available variables</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {variables
                  .filter((variable) => variable.applies_to?.includes('email'))
                  .map((variable) => (
                    <div key={variable.id} className="text-gray-400">
                      <code className="text-accent-300">{variable.variable_key}</code> — {variable.description}
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <EyeIcon className="w-4 h-4 text-emerald-300" />
                <p className="text-sm font-semibold text-white">Live preview</p>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[13px] text-gray-200">{emailPreview}</pre>
            </div>
          </div>

          <Button
            onClick={saveEmailTemplate}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-500"
          >
            <SaveIcon className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save email template'}
          </Button>
        </div>
      )}

      {/* PDF Tab */}
      {activeTab === 'pdf' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-400">Drag sections to reorder the PDF layout or toggle visibility.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGeneratePdfWithAI}
              disabled={generating}
              title="Ask AI to suggest header/footer text"
            >
              <MagicSparklesIcon className="w-4 h-4 text-purple-300" />
              AI suggestions
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Header text</label>
              <input
                type="text"
                value={pdfHeaderText}
                onChange={(event) => setPdfHeaderText(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Footer text</label>
              <input
                type="text"
                value={pdfFooterText}
                onChange={(event) => setPdfFooterText(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Accent color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={pdfHeaderColor}
                  onChange={(event) => setPdfHeaderColor(event.target.value)}
                  className="h-10 w-16 bg-gray-800 border border-gray-700 rounded"
                />
                <input
                  type="text"
                  value={pdfHeaderColor}
                  onChange={(event) => setPdfHeaderColor(event.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Font family</label>
              <select
                value={pdfFontFamily}
                onChange={(event) => setPdfFontFamily(event.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white px-3 py-2 text-sm"
              >
                {PDF_FONTS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Visibility</label>
              <div className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(event) => setShowLogo(event.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-accent-500 focus:ring-accent-500"
                />
                <span>Show logo</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={showCompanyInfo}
                  onChange={(event) => setShowCompanyInfo(event.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-accent-500 focus:ring-accent-500"
                />
                <span>Show company info</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={showTax}
                  onChange={(event) => setShowTax(event.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-accent-500 focus:ring-accent-500"
                />
                <span>Show tax line</span>
              </div>
            </div>
          </div>

          {renderPdfSections()}

          <Button
            onClick={savePDFTemplate}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors disabled:bg-gray-500"
          >
            <SaveIcon className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save PDF template'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default DocumentTemplatesPanel;
