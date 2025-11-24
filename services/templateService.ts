/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📝 TEMPLATE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Handles template loading and variable substitution for emails and PDFs.
 *
 * Features:
 * - Load templates from database with vendor overrides
 * - Variable substitution ({{variable_name}})
 * - Fallback to hardcoded defaults
 * - Company settings integration
 */

import { supabase } from '../lib/supabase/client';
import type { PurchaseOrder, Vendor } from '../types';

interface CompanySettings {
  company_name: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  tax_rate: number;
  logo_url?: string | null;
}

interface EmailTemplate {
  subject_line: string;
  body_template: string;
  signature: string;
}

interface PDFTemplate {
  header_text: string;
  footer_text: string;
  header_color: string;
  show_logo: boolean;
  show_company_info: boolean;
  show_tax: boolean;
  font_family?: string;
  layout_config?: {
    sections?: Array<{
      id: string;
      enabled?: boolean;
      title?: string;
    }>;
  };
}

export class TemplateService {
  private companySettings: CompanySettings | null = null;
  private settingsLoaded: boolean = false;

  /**
   * Load company settings (cached)
   */
  async getCompanySettings(): Promise<CompanySettings> {
    if (this.settingsLoaded && this.companySettings) {
      return this.companySettings;
    }

    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (error) throw error;

      this.companySettings = {
        company_name: data.company_name || 'MuRP',
        address_line1: data.address_line1,
        address_line2: data.address_line2,
        city: data.city,
        state: data.state,
        postal_code: data.postal_code,
        country: data.country,
        phone: data.phone,
        email: data.email,
        website: data.website,
        tax_rate: data.tax_rate || 0.08,
        logo_url: data.logo_url,
      };

      this.settingsLoaded = true;
      return this.companySettings;
    } catch (error) {
      console.error('[TemplateService] Error loading company settings:', error);

      // Return defaults
      return {
        company_name: 'MuRP',
        address_line1: '123 MuRP Lane',
        city: 'Mycelia',
        state: 'CA',
        postal_code: '90210',
        country: 'USA',
        phone: '(555) 123-4567',
        email: 'contact@murp.app',
        website: 'https://murp.app',
        tax_rate: 0.08,
        logo_url: null,
      };
    }
  }

  /**
   * Load email template (checks vendor override, then default)
   */
  async getEmailTemplate(vendorId?: string): Promise<EmailTemplate> {
    try {
      let template = null;

      // Try vendor-specific template first
      if (vendorId) {
        const { data } = await supabase
          .from('email_templates')
          .select('*')
          .eq('template_type', 'purchase_order')
          .eq('vendor_id', vendorId)
          .single();

        template = data;
      }

      // Fall back to default template
      if (!template) {
        const { data } = await supabase
          .from('email_templates')
          .select('*')
          .eq('template_type', 'purchase_order')
          .eq('is_default', true)
          .is('vendor_id', null)
          .single();

        template = data;
      }

      if (template) {
        return {
          subject_line: template.subject_line,
          body_template: template.body_template,
          signature: template.signature || '',
        };
      }
    } catch (error) {
      console.error('[TemplateService] Error loading email template:', error);
    }

    // Hardcoded fallback
    const company = await this.getCompanySettings();
    return {
      subject_line: `Purchase Order #{{po_number}} from ${company.company_name}`,
      body_template: `Hello {{vendor_name}} Team,

Please find attached our Purchase Order #{{po_number}}.

Order Details:
- Order Date: {{order_date}}
- Expected Delivery: {{expected_date}}
- Total Amount: {{total_amount}}
- Items: {{item_count}}

Kindly confirm receipt and provide an estimated shipping date at your earliest convenience.

Thank you,`,
      signature: `${company.company_name}
Procurement Team
${company.email}
${company.phone}`,
    };
  }

  /**
   * Load PDF template (checks vendor override, then default)
   */
  async getPDFTemplate(vendorId?: string): Promise<PDFTemplate> {
    try {
      let template = null;

      // Try vendor-specific template first
      if (vendorId) {
        const { data } = await supabase
          .from('pdf_templates')
          .select('*')
          .eq('template_type', 'purchase_order')
          .eq('vendor_id', vendorId)
          .single();

        template = data;
      }

      // Fall back to default template
      if (!template) {
        const { data } = await supabase
          .from('pdf_templates')
          .select('*')
          .eq('template_type', 'purchase_order')
          .eq('is_default', true)
          .is('vendor_id', null)
          .single();

        template = data;
      }

      if (template) {
        return {
          header_text: template.header_text || 'PURCHASE ORDER',
          footer_text: template.footer_text || 'Thank you for your business!',
          header_color: template.header_color || '#2980b9',
          show_logo: template.show_logo !== false,
          show_company_info: template.show_company_info !== false,
          show_tax: template.show_tax !== false,
          font_family: template.font_family || 'helvetica',
          layout_config: template.layout_config ?? null,
        };
      }
    } catch (error) {
      console.error('[TemplateService] Error loading PDF template:', error);
    }

    // Hardcoded fallback
    return {
      header_text: 'PURCHASE ORDER',
      footer_text: 'Thank you for your business!',
      header_color: '#2980b9',
      show_logo: true,
      show_company_info: true,
      show_tax: true,
      font_family: 'helvetica',
    };
  }

  /**
   * Substitute variables in template string
   */
  substituteVariables(
    template: string,
    variables: Record<string, string | number>
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }

    return result;
  }

  /**
   * Get variable values for a PO
   */
  async getPOVariables(po: PurchaseOrder, vendor: Vendor): Promise<Record<string, string | number>> {
    const company = await this.getCompanySettings();

    const total = po.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return {
      po_number: po.id,
      vendor_name: vendor.name,
      order_date: new Date(po.createdAt).toLocaleDateString(),
      expected_date: po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A',
      total_amount: `$${total.toFixed(2)}`,
      item_count: po.items.length,
      company_name: company.company_name,
      company_phone: company.phone || '',
      company_email: company.email || '',
      vendor_contact: vendor.contactPerson || vendor.name,
    };
  }

  /**
   * Get formatted company address
   */
  async getCompanyAddress(): Promise<string> {
    const company = await this.getCompanySettings();

    const parts = [
      company.address_line1,
      company.address_line2,
      [company.city, company.state, company.postal_code].filter(Boolean).join(', '),
      company.country,
    ].filter(Boolean);

    return parts.join('\n');
  }
}

// Export singleton
export const templateService = new TemplateService();
