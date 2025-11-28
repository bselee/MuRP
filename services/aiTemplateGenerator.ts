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

  /**
   * Generate SOP suggestions based on BOM data, processes, or user context
   * Enhanced with learning capabilities from historical usage data
   */
  async generateSOPSuggestions(
    context: {
      bomData?: any;
      processType?: string;
      userRole?: string;
      department?: string;
      equipment?: string[];
      materials?: string[];
      customInstructions?: string;
      sopId?: string; // For learning from specific SOP usage
    }
  ): Promise<{
    suggestions: Array<{
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      category: string;
      estimatedTime: string;
      prerequisites: string[];
      steps: string[];
      safetyNotes?: string[];
      complianceRequirements?: string[];
    }>;
    explanation: string;
    learningInsights?: {
      basedOnHistoricalData: boolean;
      similarProcesses: string[];
      successPatterns: string[];
      commonIssues: string[];
      recommendedImprovements: string[];
    };
  }> {
    const prompt = this.buildSOPPrompt(context);

    // Get learning insights if SOP ID is provided
    let learningContext = '';
    if (context.sopId) {
      try {
        const insights = await this.getLearningInsights(context.sopId);
        if (insights) {
          learningContext = `

LEARNING CONTEXT FROM HISTORICAL DATA:
- Success Patterns: ${insights.successPatterns?.join(', ') || 'None identified'}
- Common Issues: ${insights.commonIssues?.join(', ') || 'None identified'}
- Recommended Improvements: ${insights.recommendedImprovements?.join(', ') || 'None identified'}
- Similar Processes: ${insights.similarProcesses?.join(', ') || 'None identified'}

Use this historical data to improve suggestions and avoid past issues.`;
        }
      } catch (error) {
        console.warn('[AITemplateGenerator] Could not load learning insights:', error);
      }
    }

    const fullPrompt = prompt + learningContext;

    try {
      const response = await this.callAIService(fullPrompt);
      const result = this.parseSOPResponse(response);

      // Add learning insights if available
      if (context.sopId) {
        try {
          const insights = await this.getLearningInsights(context.sopId);
          if (insights) {
            result.learningInsights = insights;
          }
        } catch (error) {
          console.warn('[AITemplateGenerator] Could not add learning insights:', error);
        }
      }

      return result;
    } catch (error) {
      console.error('[AITemplateGenerator] Error generating SOP suggestions:', error);
      throw new Error('Failed to generate SOP suggestions');
    }
  }

  /**
   * Get learning insights from historical SOP usage data
   */
  private async getLearningInsights(sopId: string): Promise<{
    basedOnHistoricalData: boolean;
    similarProcesses: string[];
    successPatterns: string[];
    commonIssues: string[];
    recommendedImprovements: string[];
  } | null> {
    try {
      // Call the database function to get learning insights
      const { data, error } = await supabase
        .rpc('generate_sop_learning_insights', { sop_id_param: sopId });

      if (error) throw error;

      if (data && data.length > 0) {
        const insights = data[0];
        return {
          basedOnHistoricalData: true,
          similarProcesses: insights.similar_processes || [],
          successPatterns: insights.success_patterns || [],
          commonIssues: insights.common_issues || [],
          recommendedImprovements: insights.recommended_improvements || [],
        };
      }

      return {
        basedOnHistoricalData: false,
        similarProcesses: [],
        successPatterns: [],
        commonIssues: [],
        recommendedImprovements: [],
      };
    } catch (error) {
      console.error('[AITemplateGenerator] Error getting learning insights:', error);
      return null;
    }
  }

  /**
   * Build AI prompt for SOP suggestions
   */
  private buildSOPPrompt(context: any): string {
    const {
      bomData,
      processType,
      userRole,
      department,
      equipment,
      materials,
      customInstructions
    } = context;

    return `You are an expert manufacturing process engineer and safety compliance specialist. Generate SOP (Standard Operating Procedure) suggestions based on the provided context.

CONTEXT:
${processType ? `- Process Type: ${processType}` : ''}
${userRole ? `- User Role: ${userRole}` : ''}
${department ? `- Department: ${department}` : ''}
${equipment?.length ? `- Equipment: ${equipment.join(', ')}` : ''}
${materials?.length ? `- Materials: ${materials.join(', ')}` : ''}
${bomData ? `- BOM Data: ${JSON.stringify(bomData, null, 2)}` : ''}
${customInstructions ? `- Special instructions: ${customInstructions}` : ''}

REQUIREMENTS:
1. Generate 3-5 relevant SOP suggestions
2. Each suggestion should include:
   - Clear title and description
   - Priority level (high/medium/low)
   - Category (safety, quality, maintenance, production, etc.)
   - Estimated time to complete
   - Prerequisites needed
   - Step-by-step procedure
   - Safety notes (if applicable)
   - Compliance requirements (if applicable)

3. Consider manufacturing industry standards and best practices
4. Include relevant safety protocols and PPE requirements
5. Account for regulatory compliance (OSHA, EPA, FDA, etc.)
6. Focus on practical, actionable procedures

OUTPUT FORMAT (JSON):
{
  "suggestions": [
    {
      "title": "SOP Title",
      "description": "Brief description of what this SOP covers",
      "priority": "high|medium|low",
      "category": "safety|quality|maintenance|production|compliance",
      "estimatedTime": "X minutes/hours/days",
      "prerequisites": ["Required training", "Equipment check", "PPE"],
      "steps": ["Step 1", "Step 2", "Step 3"],
      "safetyNotes": ["Wear safety glasses", "Ensure ventilation"],
      "complianceRequirements": ["OSHA 1910.1200", "EPA guidelines"]
    }
  ],
  "explanation": "Brief explanation of how these suggestions were generated and prioritized"
}

Generate the SOP suggestions now:`;
  }

  /**
   * Parse AI response for SOP suggestions
   */
  private parseSOPResponse(response: string): {
    suggestions: Array<{
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      category: string;
      estimatedTime: string;
      prerequisites: string[];
      steps: string[];
      safetyNotes?: string[];
      complianceRequirements?: string[];
    }>;
    explanation: string;
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid AI response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        suggestions: parsed.suggestions || [],
        explanation: parsed.explanation || 'SOP suggestions generated by AI',
      };
    } catch (error) {
      console.error('[AITemplateGenerator] Error parsing SOP response:', error);

      // Fallback with basic suggestions
      return {
        suggestions: [
          {
            title: 'Equipment Safety Check',
            description: 'Daily safety inspection of manufacturing equipment',
            priority: 'high',
            category: 'safety',
            estimatedTime: '15 minutes',
            prerequisites: ['Safety training completed'],
            steps: [
              'Visual inspection of equipment',
              'Check emergency stops',
              'Verify guards are in place',
              'Document findings'
            ],
            safetyNotes: ['Wear appropriate PPE', 'Do not operate faulty equipment'],
            complianceRequirements: ['OSHA 1910.132']
          }
        ],
        explanation: 'Basic safety SOP generated as fallback',
      };
    }
  }
}

// Export singleton
export const aiTemplateGenerator = new AITemplateGenerator();
