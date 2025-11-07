// AI State Research Service
// Automatically research state agriculture departments and regulatory requirements

import { callGemini } from './geminiService';
import type { StateAgency, StateResearchTask, StateRegulation } from '../types/stateRegulatory';
import { STATE_NAMES } from '../types/stateRegulatory';

/**
 * Research contact information for a state agriculture department
 */
export async function researchStateContacts(stateCode: string): Promise<Partial<StateAgency>> {
  const stateName = STATE_NAMES[stateCode];

  const prompt = `You are researching official government contact information for agriculture regulatory agencies.

**Task:** Find current contact information for the ${stateName} Department of Agriculture (or equivalent agency responsible for fertilizer/soil amendment regulation).

**Required Information:**
1. Official department name
2. Specific division handling fertilizers/soil amendments (if separate)
3. Complete mailing address
4. Phone number (main line)
5. Email address (general inquiries)
6. Official website URL
7. Online portal URL (if one exists for registration/licensing)

**Instructions:**
- Use your search capability to find OFFICIAL government websites only (.gov domains preferred)
- Verify information is current (check "last updated" dates if available)
- If a state has a dedicated fertilizer/soil amendment division, get that specific contact info
- For online portals, note if account creation is required

**Return Format:**
Return ONLY a JSON object with this exact structure (no other text):
\`\`\`json
{
  "departmentName": "Full official department name",
  "divisionName": "Specific division name (or null if not applicable)",
  "mailingAddress": {
    "street": "Street address",
    "city": "City",
    "state": "${stateCode}",
    "zip": "ZIP code"
  },
  "phone": "Phone number",
  "fax": "Fax (or null)",
  "email": "Email address",
  "website": "Official website URL",
  "onlinePortal": {
    "url": "Portal URL (or null if none)",
    "requiresAccount": true/false,
    "notes": "Any special notes about portal access"
  },
  "sources": ["url1", "url2", "url3"]
}
\`\`\`

If you cannot find specific information, use null for that field. Be thorough and accurate.`;

  try {
    const response = await callGemini('gemini-2.5-flash', prompt);

    // Extract JSON from response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const data = JSON.parse(jsonText);

    // Build partial StateAgency object
    const agency: Partial<StateAgency> = {
      stateCode,
      stateName,
      departmentName: data.departmentName,
      divisionName: data.divisionName || undefined,
      mailingAddress: data.mailingAddress,
      phone: data.phone,
      fax: data.fax || undefined,
      email: data.email,
      website: data.website,
      onlinePortal: data.onlinePortal?.url ? {
        url: data.onlinePortal.url,
        requiresAccount: data.onlinePortal.requiresAccount || false,
        notes: data.onlinePortal.notes || ''
      } : undefined,
      lastUpdated: new Date().toISOString(),
      dataSource: 'ai_research'
    };

    console.log(`[State Research] Successfully researched ${stateName} contacts`);
    return agency;

  } catch (error) {
    console.error(`[State Research] Error researching ${stateName}:`, error);
    throw error;
  }
}

/**
 * Research registration process for a specific state
 */
export async function researchRegistrationProcess(stateCode: string): Promise<StateAgency['registrationProcess']> {
  const stateName = STATE_NAMES[stateCode];

  const prompt = `Research the fertilizer/soil amendment product registration process for ${stateName}.

**Find:**
1. Step-by-step process to register a new product
2. Required forms (with form numbers/names)
3. Registration fees (initial and renewal)
4. Required testing/analysis
5. Labeling requirements
6. Typical timeline from application to approval
7. Any special notes or gotchas

**Return Format:**
Return ONLY a JSON object:
\`\`\`json
{
  "steps": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "requiredForms": ["Form ABC-123", "Form XYZ-789"],
  "fees": "Detailed fee structure (e.g., $250 initial, $100 annual renewal)",
  "typicalTimeline": "Estimated time (e.g., 4-6 weeks)",
  "notes": "Important notes, exceptions, or special requirements",
  "sources": ["url1", "url2"]
}
\`\`\`

Be specific and actionable. If information isn't available, note that in the "notes" field.`;

  try {
    const response = await callGemini('gemini-2.5-flash', prompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const data = JSON.parse(jsonText);

    console.log(`[State Research] Successfully researched ${stateName} registration process`);
    return data;

  } catch (error) {
    console.error(`[State Research] Error researching ${stateName} registration process:`, error);
    throw error;
  }
}

/**
 * Research specific ingredient regulations for a state
 */
export async function researchIngredientRegulation(
  stateCode: string,
  ingredient: string
): Promise<Partial<StateRegulation>> {
  const stateName = STATE_NAMES[stateCode];

  const prompt = `Research ${stateName} regulations regarding the ingredient "${ingredient}" in soil amendments or fertilizer products.

**Research:**
1. Is this ingredient restricted, prohibited, or freely allowed?
2. Does it require special registration or licensing?
3. Are there labeling requirements?
4. Are there testing requirements (heavy metals, purity, etc.)?
5. What are the penalties for violations?
6. What are the relevant statute/regulation citations?

**Return Format:**
\`\`\`json
{
  "title": "Brief regulation title",
  "description": "Detailed description of how this ingredient is regulated",
  "requiresRegistration": true/false,
  "requiresTesting": true/false,
  "requiresLabeling": true/false,
  "requiresReporting": true/false,
  "statute": "Legal citation (or null)",
  "regulation": "Regulation citation (or null)",
  "violationPenalty": "Penalty description (or null)",
  "sourceUrl": "Primary source URL",
  "guidanceDocuments": ["url1", "url2"],
  "confidence": "high/medium/low",
  "notes": "Additional relevant information"
}
\`\`\`

Use your search capability. Be thorough. If you can't find specific information, indicate that and provide your confidence level.`;

  try {
    const response = await callGemini('gemini-2.5-flash', prompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const data = JSON.parse(jsonText);

    const regulation: Partial<StateRegulation> = {
      stateCode,
      regulationType: 'fertilizer', // Default
      title: data.title,
      description: data.description,
      requiresRegistration: data.requiresRegistration || false,
      requiresTesting: data.requiresTesting || false,
      requiresLabeling: data.requiresLabeling || false,
      requiresReporting: data.requiresReporting || false,
      statute: data.statute || undefined,
      regulation: data.regulation || undefined,
      violationPenalty: data.violationPenalty || undefined,
      sourceUrl: data.sourceUrl,
      guidanceDocuments: data.guidanceDocuments || [],
      confidence: data.confidence || 'medium',
      notes: data.notes || '',
      appliesToIngredients: [ingredient],
      lastVerified: new Date().toISOString()
    };

    console.log(`[State Research] Successfully researched ${ingredient} regulations for ${stateName}`);
    return regulation;

  } catch (error) {
    console.error(`[State Research] Error researching ${ingredient} in ${stateName}:`, error);
    throw error;
  }
}

/**
 * Analyze uploaded letter from state agency
 */
export async function analyzeStateLetter(letterContent: string, stateCode: string): Promise<{
  summary: string;
  identifiedIssues: string[];
  requiredActions: string[];
  deadline?: string;
  severity: 'info' | 'warning' | 'urgent' | 'critical';
  relatedProducts: string[];
  estimatedWorkHours: number;
}> {
  const stateName = STATE_NAMES[stateCode];

  const prompt = `You are a regulatory compliance expert analyzing a letter from the ${stateName} Department of Agriculture.

**Letter Content:**
${letterContent}

**Analyze this letter and extract:**

1. **Summary:** 2-3 sentence summary of what this letter is about

2. **Type of Communication:**
   - Is this a complaint, warning, registration requirement, fee notice, testing requirement, or informational?

3. **Identified Issues:**
   - List specific compliance issues mentioned
   - Which products/ingredients are affected?
   - What regulations are cited?

4. **Required Actions:**
   - What must we do to resolve this?
   - Are there specific forms to submit?
   - Is payment required?
   - Is testing/analysis needed?
   - Do we need to change labels?

5. **Deadline:**
   - Is there a response deadline mentioned?
   - What happens if we miss the deadline?

6. **Severity Assessment:**
   - **Info:** Informational only, no action needed
   - **Warning:** Potential issue, needs attention within 30+ days
   - **Urgent:** Must respond within 30 days, or fines may apply
   - **Critical:** Legal action threatened, active violation, immediate response required

7. **Related Products:**
   - Which product names or SKUs are mentioned?
   - If not mentioned, which products might be affected?

8. **Estimated Work:**
   - How many person-hours will it take to fully resolve this?
   - Consider: research time, form filling, testing, label changes, correspondence

**Return Format:**
\`\`\`json
{
  "summary": "Brief summary",
  "identifiedIssues": ["Issue 1", "Issue 2"],
  "requiredActions": ["Action 1", "Action 2"],
  "deadline": "YYYY-MM-DD or null",
  "severity": "info|warning|urgent|critical",
  "relatedProducts": ["Product 1", "Product 2"],
  "estimatedWorkHours": 10
}
\`\`\`

Be specific and actionable. This analysis will guide our response strategy.`;

  try {
    const response = await callGemini('gemini-2.5-flash', prompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const analysis = JSON.parse(jsonText);

    console.log(`[State Research] Successfully analyzed letter from ${stateName}`);
    return analysis;

  } catch (error) {
    console.error(`[State Research] Error analyzing letter from ${stateName}:`, error);
    throw error;
  }
}

/**
 * Draft response letter to state agency
 */
export async function draftResponseLetter(
  stateCode: string,
  agencyInfo: Partial<StateAgency>,
  letterAnalysis: any,
  companyInfo: {
    name: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
  },
  responseDetails: {
    actionsTaken: string[];
    supportingDocs: string[];
    additionalNotes?: string;
  }
): Promise<string> {
  const stateName = STATE_NAMES[stateCode];

  const prompt = `Draft a professional, formal response letter to the ${stateName} Department of Agriculture.

**Context:**
We received a letter from ${agencyInfo.departmentName || 'the state agency'} regarding compliance issues.

**Letter Analysis:**
Summary: ${letterAnalysis.summary}
Issues: ${letterAnalysis.identifiedIssues.join(', ')}
Required Actions: ${letterAnalysis.requiredActions.join(', ')}

**Our Response:**
We have taken the following corrective actions:
${responseDetails.actionsTaken.map((action, i) => `${i + 1}. ${action}`).join('\n')}

Supporting documentation we are including:
${responseDetails.supportingDocs.join(', ')}

${responseDetails.additionalNotes ? `Additional context: ${responseDetails.additionalNotes}` : ''}

**Draft Requirements:**
1. Use professional business letter format
2. Address to: ${agencyInfo.departmentName || '[Department Name]'}
3. Reference the original letter (use placeholder [LETTER DATE] if unknown)
4. Acknowledge their concerns
5. Detail our corrective actions
6. List enclosed documentation
7. Request closure or next steps
8. Professional, respectful tone (not defensive)

**Company Information to Use:**
${companyInfo.name}
${companyInfo.contactPerson}
${companyInfo.address}
${companyInfo.phone}
${companyInfo.email}

**Return the complete, formatted letter ready to print. Use standard business letter formatting with proper spacing and structure.**`;

  try {
    const letter = await callGemini('gemini-2.5-flash', prompt);

    console.log(`[State Research] Successfully drafted response letter for ${stateName}`);
    return letter;

  } catch (error) {
    console.error(`[State Research] Error drafting response letter for ${stateName}:`, error);
    throw error;
  }
}

/**
 * Batch research multiple states
 */
export async function batchResearchStates(
  stateCodes: string[],
  onProgress?: (current: number, total: number, state: string) => void
): Promise<Map<string, Partial<StateAgency>>> {
  console.log(`[State Research] Starting batch research for ${stateCodes.length} states`);

  const results = new Map<string, Partial<StateAgency>>();

  for (let i = 0; i < stateCodes.length; i++) {
    const stateCode = stateCodes[i];

    if (onProgress) {
      onProgress(i + 1, stateCodes.length, STATE_NAMES[stateCode]);
    }

    try {
      const agency = await researchStateContacts(stateCode);
      results.set(stateCode, agency);
    } catch (error) {
      console.error(`[State Research] Failed to research ${stateCode}:`, error);
      // Continue with next state
    }

    // Rate limiting: wait 2 seconds between requests
    if (i < stateCodes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[State Research] Batch research complete. ${results.size}/${stateCodes.length} successful.`);
  return results;
}
