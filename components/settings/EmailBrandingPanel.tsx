/**
 * EmailBrandingPanel
 *
 * Settings panel for customizing email templates with company branding.
 * Allows users to set logo, colors, contact info, and preview templates.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../ThemeProvider';
import {
  PhotoIcon,
  PaletteIcon,
  MailIcon,
  EyeIcon,
  CheckIcon,
  ArrowPathIcon,
  BuildingOffice2Icon,
  GlobeIcon,
} from '../icons';
import Button from '../ui/Button';
import {
  getEmailBranding,
  saveEmailBranding,
  generatePOConfirmationEmail,
  previewEmail,
  type EmailBranding,
} from '../../services/emailTemplateService';
import {
  SettingsCard,
  SettingsInput,
  SettingsTextarea,
  SettingsLoading,
  SettingsButtonGroup,
} from './ui';

interface EmailBrandingPanelProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const EmailBrandingPanel: React.FC<EmailBrandingPanelProps> = ({ addToast }) => {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branding, setBranding] = useState<EmailBranding>({
    companyName: '',
    companyLogoText: '',
    primaryColor: '#0f172a',
    secondaryColor: '#334155',
    accentColor: '#0f172a',
    contactEmail: '',
    contactPhone: '',
    companyAddress: '',
    website: '',
    footerText: '',
  });
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load branding settings
  useEffect(() => {
    const load = async () => {
      try {
        const saved = await getEmailBranding();
        setBranding(saved);
      } catch (error) {
        console.error('Error loading email branding:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Handle input changes
  const handleChange = useCallback((field: keyof EmailBranding, value: string) => {
    setBranding(prev => ({ ...prev, [field]: value }));
  }, []);

  // Save branding settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveEmailBranding(branding);
      if (result.success) {
        addToast?.('Email branding saved successfully', 'success');
      } else {
        addToast?.('Failed to save branding: ' + result.error, 'error');
      }
    } catch (error) {
      addToast?.('Error saving branding', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Preview email template
  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      // Create sample PO data for preview
      const samplePO = {
        id: 'preview-123',
        orderId: 'PO-2024-00847',
        order_id: 'PO-2024-00847',
        orderDate: new Date().toISOString(),
        order_date: new Date().toISOString(),
        expectedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        expected_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        supplierName: 'Sample Vendor Co.',
        supplier_name: 'Sample Vendor Co.',
        totalCost: 10235.00,
        total_cost: 10235.00,
        items: [
          { itemName: 'Organic Perlite - 4 Cu Ft Bag', item_name: 'Organic Perlite - 4 Cu Ft Bag', inventorySku: 'PM-2847', inventory_sku: 'PM-2847', quantityOrdered: 150, quantity_ordered: 150, unitCost: 24.50, unit_cost: 24.50 },
          { itemName: 'Coco Coir Block - 5kg Compressed', item_name: 'Coco Coir Block - 5kg Compressed', inventorySku: 'PM-1923', inventory_sku: 'PM-1923', quantityOrdered: 200, quantity_ordered: 200, unitCost: 18.75, unit_cost: 18.75 },
          { itemName: 'Worm Castings - 25lb Bag', item_name: 'Worm Castings - 25lb Bag', inventorySku: 'PM-3341', inventory_sku: 'PM-3341', quantityOrdered: 80, quantity_ordered: 80, unitCost: 32.00, unit_cost: 32.00 },
        ],
      };

      const template = await generatePOConfirmationEmail({
        po: samplePO as any,
        buyerName: 'Preview User',
        buyerEmail: branding.contactEmail || 'purchasing@example.com',
        specialInstructions: 'This is a preview of your email template. Please palletize items separately by SKU.',
        paymentTerms: 'Net 30',
        shippingMethod: 'LTL Freight',
      });

      previewEmail(template);
    } catch (error) {
      console.error('Error generating preview:', error);
      addToast?.('Error generating preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle logo file upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      addToast?.('Please select an image file', 'error');
      return;
    }

    // Validate file size (max 500KB)
    if (file.size > 500 * 1024) {
      addToast?.('Image must be less than 500KB', 'error');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      handleChange('companyLogo', base64);
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <SettingsCard>
        <SettingsLoading variant="skeleton" />
      </SettingsCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Email Branding
          </h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Customize how your emails look when sent to vendors and partners
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handlePreview}
            disabled={previewLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isDark
                ? 'bg-gray-700 text-white hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <EyeIcon className="w-4 h-4" />
            {previewLoading ? 'Loading...' : 'Preview'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" /> : <CheckIcon className="w-4 h-4 mr-2" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Info */}
        <SettingsCard>
          <div className="flex items-center gap-2 mb-4">
            <BuildingOffice2Icon className={`w-5 h-5 ${isDark ? 'text-accent-400' : 'text-accent-500'}`} />
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Company Information</h3>
          </div>

          <div className="space-y-4">
            <SettingsInput
              label="Company Name *"
              value={branding.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
              placeholder="Your Company Name"
            />

            <div className="grid grid-cols-2 gap-4">
              <SettingsInput
                label="Contact Email *"
                type="email"
                value={branding.contactEmail}
                onChange={(e) => handleChange('contactEmail', e.target.value)}
                placeholder="purchasing@company.com"
              />
              <SettingsInput
                label="Contact Phone"
                type="tel"
                value={branding.contactPhone || ''}
                onChange={(e) => handleChange('contactPhone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <SettingsInput
              label="Company Address"
              value={branding.companyAddress || ''}
              onChange={(e) => handleChange('companyAddress', e.target.value)}
              placeholder="123 Main St, City, State 12345"
            />

            <SettingsInput
              label="Website"
              type="url"
              value={branding.website || ''}
              onChange={(e) => handleChange('website', e.target.value)}
              placeholder="https://yourcompany.com"
              icon={<GlobeIcon className="w-4 h-4" />}
            />
          </div>
        </SettingsCard>

        {/* Logo & Colors */}
        <SettingsCard>
          <div className="flex items-center gap-2 mb-4">
            <PaletteIcon className={`w-5 h-5 ${isDark ? 'text-accent-400' : 'text-accent-500'}`} />
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Logo & Colors</h3>
          </div>

          <div className="space-y-4">
            {/* Logo Upload */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Company Logo
              </label>
              <div className="flex items-start gap-4">
                <div className={`w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden ${
                  isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-gray-50'
                }`}>
                  {branding.companyLogo ? (
                    <img src={branding.companyLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                      style={{ background: branding.primaryColor }}
                    >
                      {branding.companyLogoText || branding.companyName.charAt(0) || 'M'}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      isDark
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <PhotoIcon className="w-4 h-4" />
                    Upload Logo
                  </label>
                  <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    PNG, JPG up to 500KB. Recommended: 200x60px
                  </p>
                </div>
              </div>
            </div>

            {/* Fallback Logo Text */}
            <SettingsInput
              label="Logo Fallback Text"
              value={branding.companyLogoText || ''}
              onChange={(e) => handleChange('companyLogoText', e.target.value)}
              placeholder="M"
              maxLength={3}
              className="w-24"
              helpText="1-3 chars shown if no logo uploaded"
            />

            {/* Colors */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className={`flex-1 px-2 py-1 rounded-lg border text-xs font-mono transition-colors ${
                      isDark
                        ? 'bg-gray-900 border-gray-700 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-accent-500/20`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Secondary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={branding.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className={`flex-1 px-2 py-1 rounded-lg border text-xs font-mono transition-colors ${
                      isDark
                        ? 'bg-gray-900 border-gray-700 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-accent-500/20`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={branding.accentColor}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={branding.accentColor}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    className={`flex-1 px-2 py-1 rounded-lg border text-xs font-mono transition-colors ${
                      isDark
                        ? 'bg-gray-900 border-gray-700 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-accent-500/20`}
                  />
                </div>
              </div>
            </div>

            {/* Color Preview */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Header Preview
              </label>
              <div
                className="h-16 rounded-lg flex items-center px-4"
                style={{
                  background: `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold"
                    style={{ background: 'white', color: branding.primaryColor }}
                  >
                    {branding.companyLogoText || branding.companyName.charAt(0) || 'M'}
                  </div>
                  <span className="text-white font-medium">{branding.companyName || 'Company Name'}</span>
                </div>
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* Footer Text */}
        <SettingsCard className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <MailIcon className={`w-5 h-5 ${isDark ? 'text-accent-400' : 'text-accent-500'}`} />
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Email Footer</h3>
          </div>

          <SettingsTextarea
            label="Footer Text"
            value={branding.footerText || ''}
            onChange={(e) => handleChange('footerText', e.target.value)}
            placeholder="This is an automated message from Your Company"
            rows={2}
            helpText="Displayed at the bottom of all outgoing emails"
          />
        </SettingsCard>
      </div>

      {/* Template Types Info */}
      <SettingsCard className="lg:col-span-2">
        <h3 className={`font-medium mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>Email Templates</h3>
        <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Your branding is automatically applied to all outgoing emails:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>PO Confirmation</span>
            </div>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Sent when a new PO is created and emailed to vendor
            </p>
          </div>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Follow-Up</span>
            </div>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Automated follow-ups for acknowledgment or status updates
            </p>
          </div>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Shipping Request</span>
            </div>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Requests for tracking info or delivery updates
            </p>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};

export default EmailBrandingPanel;
