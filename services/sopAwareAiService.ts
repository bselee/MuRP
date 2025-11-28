/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🤖 SOP-AWARE AI SERVICE - AI with Institutional Knowledge
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Advanced AI service that leverages SOP data to provide contextual,
 * procedure-aware assistance and decision support throughout the application.
 *
 * Features:
 * ✨ SOP-aware chat responses with relevant procedure references
 * ✨ Compliance checking against current SOPs
 * ✨ Contextual help based on operational procedures
 * ✨ SOP improvement suggestions based on usage patterns
 * ✨ Smart SOP retrieval and recommendation engine
 * ✨ Workflow-aware decision support
 *
 * @module services/sopAwareAiService
 * @version 1.0.0 - SOP Integration Edition
 */

import { supabase } from '../lib/supabase/client';
import { sendChatMessage, type ChatRequest } from './aiGatewayService';
import { sopWorkflowService } from './sopWorkflowService';
import type {
  StandardOperatingProcedure,
  SOPSubmission,
  SOPApproval,
  BillOfMaterials,
  InventoryItem,
  Vendor,
  PurchaseOrder,
  User
} from '../types';

export interface SOPContext {
  relevantSOPs: StandardOperatingProcedure[];
  activeWorkflows: SOPSubmission[];
  departmentProcedures: string[];
  complianceStatus: 'compliant' | 'review_needed' | 'non_compliant';
  recommendations: string[];
}

export interface SOPAwareResponse {
  response: string;
  sopReferences: Array<{
    sopId: string;
    title: string;
    relevance: number;
    section?: string;
    excerpt?: string;
  }>;
  complianceNotes?: string[];
  suggestions?: string[];
  workflowActions?: Array<{
    type: 'create_submission' | 'review_approval' | 'update_procedure';
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SOP CONTEXT ANALYSIS - Understanding Operational Context
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Analyzes current context to find relevant SOPs and procedures
 */
export async function analyzeSOPContext(
  userId: string,
  context: {
    action?: string;
    department?: string;
    bomId?: string;
    inventoryItems?: string[];
    vendors?: string[];
    keywords?: string[];
  }
): Promise<SOPContext> {
  try {
    // Get user's department and role
    const { data: userData } = await supabase
      .from('user_department_roles')
      .select('department, role')
      .eq('user_id', userId)
      .single();

    const userDepartment = userData?.department || context.department;
    const userRole = userData?.role;

    // Find relevant SOPs based on context
    let relevantSOPs: StandardOperatingProcedure[] = [];

    // Query SOPs by department
    if (userDepartment) {
      const { data: deptSOPs } = await supabase
        .from('sop_repository')
        .select('*')
        .eq('department', userDepartment)
        .eq('status', 'published');

      if (deptSOPs) relevantSOPs.push(...deptSOPs);
    }

    // Query SOPs by BOM if provided
    if (context.bomId) {
      const { data: bomSOPs } = await supabase
        .from('sop_repository')
        .select('*')
        .eq('bom_id', context.bomId)
        .eq('status', 'published');

      if (bomSOPs) relevantSOPs.push(...bomSOPs);
    }

    // Query SOPs by keywords in title/description
    if (context.keywords && context.keywords.length > 0) {
      const keywordQuery = context.keywords.join(' | ');
      const { data: keywordSOPs } = await supabase
        .from('sop_repository')
        .select('*')
        .or(`title.ilike.%${keywordQuery}%,description.ilike.%${keywordQuery}%`)
        .eq('status', 'published');

      if (keywordSOPs) relevantSOPs.push(...keywordSOPs);
    }

    // Remove duplicates
    relevantSOPs = relevantSOPs.filter((sop, index, self) =>
      index === self.findIndex(s => s.id === sop.id)
    );

    // Get active workflows for this user/department
    const activeWorkflows = await sopWorkflowService.getSubmissionsForUser(userId);

    // Analyze compliance status
    const complianceStatus = await checkComplianceStatus(userId, context);

    // Generate recommendations
    const recommendations = await generateSOPRecommendations(userId, context, relevantSOPs);

    return {
      relevantSOPs,
      activeWorkflows,
      departmentProcedures: relevantSOPs.map(sop => sop.title),
      complianceStatus,
      recommendations
    };

  } catch (error) {
    console.error('Error analyzing SOP context:', error);
    return {
      relevantSOPs: [],
      activeWorkflows: [],
      departmentProcedures: [],
      complianceStatus: 'compliant',
      recommendations: []
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 💬 SOP-AWARE AI CHAT - Contextually Intelligent Responses
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Generates AI response with SOP context and references
 */
export async function generateSOPAwareResponse(
  userId: string,
  message: string,
  context: {
    action?: string;
    department?: string;
    bomId?: string;
    inventoryItems?: string[];
    vendors?: string[];
    currentPage?: string;
  },
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<SOPAwareResponse> {

  // Analyze SOP context first
  const sopContext = await analyzeSOPContext(userId, context);

  // Build enhanced prompt with SOP context
  const enhancedPrompt = buildSOPAwarePrompt(message, sopContext, context);

  // Generate AI response
  const chatRequest: ChatRequest = {
    messages: [
      ...(conversationHistory || []).map(h => ({
        role: h.role,
        content: h.content
      })),
      {
        role: 'user',
        content: enhancedPrompt
      }
    ],
    featureType: 'chat',
    userId
  };

  const aiResponse = await sendChatMessage(chatRequest);

  // Extract SOP references from the response
  const sopReferences = extractSOPReferences(aiResponse.response, sopContext.relevantSOPs);

  // Generate workflow actions if applicable
  const workflowActions = await suggestWorkflowActions(userId, message, sopContext);

  return {
    response: aiResponse.response,
    sopReferences,
    complianceNotes: sopContext.complianceStatus === 'review_needed' ?
      ['Consider reviewing current SOPs for this action'] : undefined,
    suggestions: sopContext.recommendations,
    workflowActions
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📋 SOP COMPLIANCE CHECKING - Ensuring Adherence to Procedures
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Checks if a proposed action complies with current SOPs
 */
export async function checkSOPCompliance(
  userId: string,
  action: string,
  context: {
    department?: string;
    bomId?: string;
    inventoryItems?: string[];
    vendors?: string[];
  }
): Promise<{
  compliant: boolean;
  violations: string[];
  recommendations: string[];
  relevantSOPs: StandardOperatingProcedure[];
}> {

  const sopContext = await analyzeSOPContext(userId, context);

  // Use AI to analyze compliance
  const compliancePrompt = `
  Analyze whether the following action complies with the provided SOPs:

  ACTION: ${action}

  RELEVANT SOPS:
  ${sopContext.relevantSOPs.map(sop =>
    `Title: ${sop.title}\nDescription: ${sop.description}\nSections: ${sop.sections.map(s => s.title).join(', ')}`
  ).join('\n\n')}

  Please respond with:
  1. COMPLIANT: Yes/No
  2. VIOLATIONS: List any violations found
  3. RECOMMENDATIONS: Suggestions for compliance
  `;

  const chatRequest: ChatRequest = {
    messages: [{ role: 'user', content: compliancePrompt }],
    featureType: 'compliance',
    userId
  };

  const aiResponse = await sendChatMessage(chatRequest);

  // Parse AI response
  const response = aiResponse.response;
  const compliant = response.toLowerCase().includes('compliant: yes');
  const violations = extractListFromResponse(response, 'violations');
  const recommendations = extractListFromResponse(response, 'recommendations');

  return {
    compliant,
    violations,
    recommendations,
    relevantSOPs: sopContext.relevantSOPs
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SMART SOP RECOMMENDATIONS - Learning from Usage Patterns
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Generates SOP improvement suggestions based on usage patterns
 */
export async function generateSOPImprovementSuggestions(
  userId: string,
  timeRange: { start: Date; end: Date }
): Promise<Array<{
  sopId: string;
  title: string;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
  reasoning: string;
}>> {

  // Get SOP usage logs
  const { data: usageLogs } = await supabase
    .from('sop_usage_logs')
    .select('*')
    .gte('started_at', timeRange.start.toISOString())
    .lte('started_at', timeRange.end.toISOString());

  // Get workflow submissions
  const submissions = await sopWorkflowService.getSubmissions();

  // Analyze patterns and generate suggestions
  const suggestions: Array<{
    sopId: string;
    title: string;
    suggestion: string;
    priority: 'low' | 'medium' | 'high';
    reasoning: string;
  }> = [];

  // Analyze usage patterns
  if (usageLogs) {
    const sopUsage = usageLogs.reduce((acc, log) => {
      acc[log.sop_id] = (acc[log.sop_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Find frequently used SOPs that might need updates
    Object.entries(sopUsage).forEach(([sopId, usageCount]) => {
      if (usageCount > 10) { // High usage threshold
        suggestions.push({
          sopId,
          title: 'High Usage SOP Review',
          suggestion: 'Consider reviewing this frequently used SOP for potential improvements or updates',
          priority: 'medium',
          reasoning: `This SOP has been used ${usageCount} times in the specified period`
        });
      }
    });
  }

  // Analyze workflow patterns
  const recentSubmissions = submissions.filter(s =>
    new Date(s.created_at) >= timeRange.start &&
    new Date(s.created_at) <= timeRange.end
  );

  if (recentSubmissions.length > 5) {
    suggestions.push({
      sopId: 'general',
      title: 'Workflow Process Review',
      suggestion: 'Multiple SOP change requests suggest reviewing the overall process',
      priority: 'high',
      reasoning: `${recentSubmissions.length} SOP submissions in the period indicate potential process improvements needed`
    });
  }

  return suggestions;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔍 SOP SEARCH & DISCOVERY - Finding the Right Procedure
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Smart SOP search with AI-powered relevance ranking
 */
export async function searchSOPs(
  query: string,
  userId: string,
  filters?: {
    department?: string;
    category?: string;
    status?: string;
  }
): Promise<Array<{
  sop: StandardOperatingProcedure;
  relevanceScore: number;
  matchedSections: string[];
  reasoning: string;
}>> {

  // First, do a basic database search
  let queryBuilder = supabase
    .from('sop_repository')
    .select('*')
    .eq('status', 'published');

  if (filters?.department) {
    queryBuilder = queryBuilder.eq('department', filters.department);
  }
  if (filters?.category) {
    queryBuilder = queryBuilder.eq('category', filters.category);
  }

  const { data: sops } = await queryBuilder;

  if (!sops || sops.length === 0) {
    return [];
  }

  // Use AI to rank relevance
  const rankingPrompt = `
  Rank the following SOPs by relevance to the query: "${query}"

  SOPs:
  ${sops.map((sop, index) =>
    `${index + 1}. ${sop.title}\n   Description: ${sop.description}\n   Sections: ${sop.sections.map(s => s.title).join(', ')}`
  ).join('\n\n')}

  For each SOP, provide:
  - Relevance score (0-100)
  - Matched sections
  - Brief reasoning for the score
  `;

  const chatRequest: ChatRequest = {
    messages: [{ role: 'user', content: rankingPrompt }],
    featureType: 'search',
    userId
  };

  const aiResponse = await sendChatMessage(chatRequest);

  // Parse AI ranking response
  const rankedSOPs = sops.map((sop, index) => ({
    sop,
    relevanceScore: 50, // Default score
    matchedSections: [],
    reasoning: 'AI analysis pending'
  }));

  // Extract scores from AI response (simplified parsing)
  const response = aiResponse.response;
  sops.forEach((sop, index) => {
    const sopIndex = index + 1;
    const scoreMatch = response.match(new RegExp(`${sopIndex}\\..*?(\\d+).*?relevance`, 'is'));
    if (scoreMatch) {
      rankedSOPs[index].relevanceScore = parseInt(scoreMatch[1]) || 50;
    }
  });

  return rankedSOPs.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🛠️ HELPER FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

function buildSOPAwarePrompt(
  message: string,
  sopContext: SOPContext,
  context: any
): string {
  const sopInfo = sopContext.relevantSOPs.map(sop =>
    `SOP: ${sop.title}\nDescription: ${sop.description}\nKey Sections: ${sop.sections.slice(0, 3).map(s => s.title).join(', ')}`
  ).join('\n\n');

  return `
You are an AI assistant with deep knowledge of the company's Standard Operating Procedures (SOPs).

USER MESSAGE: ${message}

CURRENT CONTEXT:
- Department: ${context.department || 'Not specified'}
- Action: ${context.action || 'General inquiry'}
- Relevant SOPs Available: ${sopContext.relevantSOPs.length}

RELEVANT SOPs:
${sopInfo}

ACTIVE WORKFLOWS: ${sopContext.activeWorkflows.length} pending items

Please provide a helpful response that:
1. References relevant SOPs when applicable
2. Suggests SOP updates if current procedures seem inadequate
3. Offers to help with SOP-related workflows if relevant
4. Maintains awareness of compliance requirements

Response should be natural and conversational while being SOP-aware.
  `.trim();
}

function extractSOPReferences(
  response: string,
  availableSOPs: StandardOperatingProcedure[]
): Array<{
  sopId: string;
  title: string;
  relevance: number;
  section?: string;
  excerpt?: string;
}> {
  const references: Array<{
    sopId: string;
    title: string;
    relevance: number;
    section?: string;
    excerpt?: string;
  }> = [];

  availableSOPs.forEach(sop => {
    // Simple text matching - could be enhanced with AI
    if (response.toLowerCase().includes(sop.title.toLowerCase())) {
      references.push({
        sopId: sop.id,
        title: sop.title,
        relevance: 80,
        excerpt: sop.description.substring(0, 100) + '...'
      });
    }
  });

  return references;
}

async function checkComplianceStatus(
  userId: string,
  context: any
): Promise<'compliant' | 'review_needed' | 'non_compliant'> {
  // Simplified compliance check - could be enhanced
  const activeWorkflows = await sopWorkflowService.getSubmissionsForUser(userId);
  const overdueWorkflows = activeWorkflows.filter(w =>
    w.status === 'pending_review' &&
    new Date(w.created_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days
  );

  if (overdueWorkflows.length > 0) {
    return 'review_needed';
  }

  return 'compliant';
}

async function generateSOPRecommendations(
  userId: string,
  context: any,
  relevantSOPs: StandardOperatingProcedure[]
): Promise<string[]> {
  const recommendations: string[] = [];

  // Check for outdated SOPs
  const oldSOPs = relevantSOPs.filter(sop =>
    new Date(sop.updated_at) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) // 6 months
  );

  if (oldSOPs.length > 0) {
    recommendations.push(`${oldSOPs.length} SOP(s) haven't been updated in 6+ months - consider review`);
  }

  // Check for high-usage SOPs that might need updates
  const { data: usageLogs } = await supabase
    .from('sop_usage_logs')
    .select('sop_id')
    .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

  if (usageLogs) {
    const usageCount = usageLogs.reduce((acc, log) => {
      acc[log.sop_id] = (acc[log.sop_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const highUsageSOPs = Object.entries(usageCount)
      .filter(([, count]) => count > 5)
      .map(([sopId]) => relevantSOPs.find(sop => sop.id === sopId)?.title)
      .filter(Boolean);

    if (highUsageSOPs.length > 0) {
      recommendations.push(`Frequently used SOPs: ${highUsageSOPs.join(', ')} - consider gathering feedback`);
    }
  }

  return recommendations;
}

async function suggestWorkflowActions(
  userId: string,
  message: string,
  sopContext: SOPContext
): Promise<Array<{
  type: 'create_submission' | 'review_approval' | 'update_procedure';
  description: string;
  priority: 'low' | 'medium' | 'high';
}>> {
  const actions: Array<{
    type: 'create_submission' | 'review_approval' | 'update_procedure';
    description: string;
    priority: 'low' | 'medium' | 'high';
  }> = [];

  // Check for pending approvals
  const pendingApprovals = sopContext.activeWorkflows.filter(w =>
    w.status === 'pending_approval' || w.status === 'under_review'
  );

  if (pendingApprovals.length > 0) {
    actions.push({
      type: 'review_approval',
      description: `Review ${pendingApprovals.length} pending SOP approval(s)`,
      priority: 'medium'
    });
  }

  // Suggest SOP updates based on message content
  if (message.toLowerCase().includes('problem') ||
      message.toLowerCase().includes('issue') ||
      message.toLowerCase().includes('doesn\'t work')) {
    actions.push({
      type: 'create_submission',
      description: 'Consider submitting an SOP improvement based on this issue',
      priority: 'low'
    });
  }

  return actions;
}

function extractListFromResponse(response: string, sectionName: string): string[] {
  const sectionMatch = response.match(new RegExp(`${sectionName}:([\\s\\S]*?)(?=\\n\\n|$)`, 'i'));
  if (!sectionMatch) return [];

  return sectionMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-') || line.match(/^\d+\./))
    .map(line => line.replace(/^[-•]\s*|\d+\.\s*/, '').trim())
    .filter(line => line.length > 0);
}