/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 AI TEMPLATE GENERATOR SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generates professional email and PDF templates using AI.
 * Templates are suggestions that require user approval before use.
 *
 * Features:
 * - Email template generation (subject + body + signature)
 * - PDF template styling suggestions
 * - Vendor-specific template customization
 * - Industry-appropriate tone and formatting
 * - Variable substitution guidance
 *
 * Cost: ~$0.02 per template generation (Claude Haiku)
 */

import { supabase } from '../lib/supabase/client';

interface TemplateGenerationRequest {
  templateType: 'email' | 'pdf';
  documentType: 'purchase_order' | 'invoice' | 'vendor_inquiry';
  companyInfo?: {
    name: string;
    industry?: string;
    tone?: 'professional' | 'friendly' | 'formal';
  };
  vendorInfo?: {
    name: string;
    relationship?: 'new' | 'established' | 'preferred';
  };
  customInstructions?: string;
}

interface EmailTemplateResult {
  subjectLine: string;
  bodyTemplate: string;
  signature: string;
  explanation: string;
}

interface PDFTemplateResult {
  headerText: string;
  footerText: string;
  headerColor: string;
  styleNotes: string;
  explanation: string;
}

export class AITemplateGenerator {
  /**
   * Generate an email template using AI
   */
  async generateEmailTemplate(
    request: TemplateGenerationRequest
  ): Promise<EmailTemplateResult> {
    const prompt = this.buildEmailPrompt(request);

    try {
      // Call AI service (using existing aiGateway pattern)
      const response = await this.callAIService(prompt);

      return this.parseEmailResponse(response);
    } catch (error) {
      console.error('[AITemplateGenerator] Error generating email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate a PDF template using AI
   */
  async generatePDFTemplate(
    request: TemplateGenerationRequest
  ): Promise<PDFTemplateResult> {
    const prompt = this.buildPDFPrompt(request);

    try {
      const response = await this.callAIService(prompt);

      return this.parsePDFResponse(response);
    } catch (error) {
      console.error('[AITemplateGenerator] Error generating PDF template:', error);
      throw new Error('Failed to generate PDF template');
    }
  }

  /**
   * Build AI prompt for email template
   */
  private buildEmailPrompt(request: TemplateGenerationRequest): string {
    const { companyInfo, vendorInfo, documentType, customInstructions } = request;

    const tone = companyInfo?.tone || 'professional';
    const relationship = vendorInfo?.relationship || 'established';

    return `You are a professional business communications expert. Generate an email template for a ${documentType.replace('_', ' ')}.

CONTEXT:
- Company: ${companyInfo?.name || 'our company'}
- Industry: ${companyInfo?.industry || 'manufacturing'}
- Vendor: ${vendorInfo?.name || 'vendor'}
- Relationship: ${relationship}
- Desired tone: ${tone}
${customInstructions ? `- Special instructions: ${customInstructions}` : ''}

AVAILABLE VARIABLES (use exactly as shown):
- {{po_number}} - Purchase order number
- {{vendor_name}} - Vendor company name
- {{order_date}} - Order creation date
- {{expected_date}} - Expected delivery date
- {{total_amount}} - Total order amount
- {{item_count}} - Number of items
- {{company_name}} - Our company name
- {{company_email}} - Our email
- {{company_phone}} - Our phone

REQUIREMENTS:
1. Subject line should be clear and professional
2. Body should be concise but complete (3-5 paragraphs)
3. Use appropriate variables for personalization
4. Include call-to-action (confirm receipt, provide shipping date, etc.)
5. Signature should be professional but not overly formal
6. Tone should be ${tone}

OUTPUT FORMAT (JSON):
{
  "subjectLine": "...",
  "bodyTemplate": "...",
  "signature": "...",
  "explanation": "Brief explanation of tone and approach used"
}

Generate the template now:`;
  }

  /**
   * Build AI prompt for PDF template
   */
  private buildPDFPrompt(request: TemplateGenerationRequest): string {
    const { companyInfo, documentType, customInstructions } = request;

    return `You are a professional document design expert. Generate styling recommendations for a ${documentType.replace('_', ' ')} PDF template.

CONTEXT:
- Company: ${companyInfo?.name || 'our company'}
- Industry: ${companyInfo?.industry || 'manufacturing'}
- Document type: ${documentType}
${customInstructions ? `- Special instructions: ${customInstructions}` : ''}

REQUIREMENTS:
1. Header text should be clear and bold
2. Footer text should be professional and friendly
3. Color scheme should be appropriate for ${companyInfo?.industry || 'business'}
4. Overall design should be clean and modern

OUTPUT FORMAT (JSON):
{
  "headerText": "Main header text (e.g., 'PURCHASE ORDER')",
  "footerText": "Footer message (e.g., 'Thank you for your business!')",
  "headerColor": "Hex color code (e.g., '#2980b9')",
  "styleNotes": "Brief description of design choices",
  "explanation": "Why these choices work for this industry/purpose"
}

Generate the template now:`;
  }

  /**
   * Call AI service with prompt
   */
  private async callAIService(prompt: string): Promise<string> {
    // Check if AI gateway is configured
    const { data: aiConfig } = await supabase
      .from('ai_config')
      .select('*')
      .single();

    if (!aiConfig || !aiConfig.api_key) {
      throw new Error('AI service not configured. Please add API key in Settings.');
    }

    // Call Supabase Edge Function for AI
    const { data, error } = await supabase.functions.invoke('ai-gateway', {
      body: {
        prompt,
        model: 'claude-3-haiku-20240307', // Fast and cheap for templates
        max_tokens: 1000,
        temperature: 0.7,
      },
    });

    if (error) throw error;

    return data.response;
  }

  /**
   * Parse AI response for email template
   */
  private parseEmailResponse(response: string): EmailTemplateResult {
    try {
      // Extract JSON from response (AI might wrap it in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid AI response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        subjectLine: parsed.subjectLine || '',
        bodyTemplate: parsed.bodyTemplate || '',
        signature: parsed.signature || '',
        explanation: parsed.explanation || 'Template generated by AI',
      };
    } catch (error) {
      console.error('[AITemplateGenerator] Error parsing email response:', error);

      // Fallback to extracting manually
      return {
        subjectLine: 'Purchase Order #{{po_number}} from {{company_name}}',
        bodyTemplate: response,
        signature: '{{company_name}}\nProcurement Team',
        explanation: 'Template extracted from AI response',
      };
    }
  }

  /**
   * Parse AI response for PDF template
   */
  private parsePDFResponse(response: string): PDFTemplateResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid AI response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        headerText: parsed.headerText || 'PURCHASE ORDER',
        footerText: parsed.footerText || 'Thank you for your business!',
        headerColor: parsed.headerColor || '#2980b9',
        styleNotes: parsed.styleNotes || '',
        explanation: parsed.explanation || 'Template generated by AI',
      };
    } catch (error) {
      console.error('[AITemplateGenerator] Error parsing PDF response:', error);

      // Fallback
      return {
        headerText: 'PURCHASE ORDER',
        footerText: 'Thank you for your business!',
        headerColor: '#2980b9',
        styleNotes: 'Clean, professional design',
        explanation: 'Default template',
      };
    }
  }

  /**
   * Get available template variables
   */
  async getTemplateVariables(applies_to?: 'email' | 'pdf'): Promise<any[]> {
    const query = supabase
      .from('template_variables')
      .select('*')
      .order('variable_name');

    if (applies_to) {
      query.contains('applies_to', [applies_to]);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching template variables:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Save generated template (requires user approval)
   */
  async saveTemplate(
    templateType: 'email' | 'pdf',
    templateData: any,
    userId: string
  ): Promise<string> {
    const tableName = templateType === 'email' ? 'email_templates' : 'pdf_templates';

    const { data, error } = await supabase
      .from(tableName)
      .insert({
        ...templateData,
        ai_generated: true,
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;

    return data.id;
  }
}

// Export singleton
export const aiTemplateGenerator = new AITemplateGenerator();
