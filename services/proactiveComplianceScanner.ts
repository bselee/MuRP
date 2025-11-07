// Enhanced Regulatory Compliance: Proactive BOM Compliance Scanner
// Automatically scans all BOMs for potential regulatory compliance issues

import type { BillOfMaterials, WatchlistItem } from '../types';
import type { ComplianceStatus, ComplianceIssue, ComplianceRiskLevel, ComplianceDashboardStats } from '../types/regulatory';
import { callGemini } from './geminiService';

// In-memory compliance status cache (would be Supabase in production)
let complianceStatuses: Map<string, ComplianceStatus> = new Map();

/**
 * DEFAULT STATES TO SCAN
 * Focus on states with strict agriculture/fertilizer regulations
 */
const DEFAULT_SCAN_STATES = ['CA', 'OR', 'WA', 'NY', 'VT', 'ME'];

/**
 * Scan a single BOM for compliance issues across multiple states
 * This is the core function that powers proactive compliance monitoring
 */
export async function scanBOMForCompliance(
  bom: BillOfMaterials,
  watchlist: WatchlistItem[],
  states: string[] = DEFAULT_SCAN_STATES,
  skipCache: boolean = false
): Promise<ComplianceStatus> {
  console.log(`[Compliance Scanner] Scanning BOM: ${bom.name} (${bom.id})`);

  // Check if we have a recent scan (< 90 days old)
  if (!skipCache) {
    const cached = complianceStatuses.get(bom.id);
    if (cached) {
      const expiresAt = new Date(cached.expiresAt);
      if (expiresAt > new Date()) {
        console.log(`[Compliance Scanner] Using cached status for ${bom.name}`);
        return cached;
      }
    }
  }

  // Extract ingredient names from BOM components
  const ingredientNames = bom.components.map(c => c.name);
  const ingredientList = ingredientNames.join(', ');

  // Check against watchlist for known issues
  const watchlistMatches = findWatchlistMatches(ingredientNames, watchlist);

  // Build initial issues from watchlist
  const issues: ComplianceIssue[] = [];

  for (const match of watchlistMatches) {
    // Scan each state for this ingredient
    for (const state of states) {
      try {
        const stateIssues = await scanIngredientInState(
          match.ingredient,
          match.watchlistItem,
          state,
          bom.name
        );
        issues.push(...stateIssues);
      } catch (error) {
        console.error(`[Compliance Scanner] Error scanning ${match.ingredient} in ${state}:`, error);
        // Add unknown issue if scan fails
        issues.push({
          ingredient: match.ingredient,
          state,
          riskLevel: 'unknown',
          issue: 'Scan failed - requires manual review',
          recommendation: 'Manually check state agriculture department website',
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Calculate overall risk (highest risk level)
  const overallRisk = calculateOverallRisk(issues);

  // Create compliance status
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 90); // 90-day expiration

  const status: ComplianceStatus = {
    bomId: bom.id,
    lastScanDate: now.toISOString(),
    overallRisk,
    issueCount: issues.length,
    issues,
    statesScanned: states,
    expiresAt: expiresAt.toISOString(),
  };

  // Save to cache
  complianceStatuses.set(bom.id, status);

  console.log(`[Compliance Scanner] Scan complete for ${bom.name}: ${overallRisk} risk, ${issues.length} issues`);

  return status;
}

/**
 * Find watchlist items that match BOM ingredients
 */
function findWatchlistMatches(
  ingredientNames: string[],
  watchlist: WatchlistItem[]
): Array<{ ingredient: string; watchlistItem: WatchlistItem }> {
  const matches: Array<{ ingredient: string; watchlistItem: WatchlistItem }> = [];

  for (const ingredient of ingredientNames) {
    const lowerIngredient = ingredient.toLowerCase();

    for (const watchlistItem of watchlist) {
      const lowerTerm = watchlistItem.term.toLowerCase();

      // Check if ingredient contains watchlist term (case-insensitive)
      if (lowerIngredient.includes(lowerTerm) || lowerTerm.includes(lowerIngredient)) {
        matches.push({ ingredient, watchlistItem });
      }
    }
  }

  return matches;
}

/**
 * Scan a specific ingredient for compliance issues in a specific state using AI
 */
async function scanIngredientInState(
  ingredient: string,
  watchlistItem: WatchlistItem,
  state: string,
  productName: string
): Promise<ComplianceIssue[]> {
  const prompt = `You are a regulatory compliance expert for agriculture and soil amendment products.

**Task:** Analyze the ingredient "${ingredient}" for potential regulatory compliance issues when used in a product sold in ${getStateName(state)}.

**Context:**
- Product Name: ${productName}
- Ingredient: ${ingredient}
- Watchlist Reason: ${watchlistItem.reason}
- Watchlist Type: ${watchlistItem.type}

**Your Response:**
Provide a JSON object with this exact structure:
{
  "hasIssues": true/false,
  "riskLevel": "clear|low|medium|high|critical",
  "issue": "Short description of the issue (if any)",
  "recommendation": "Specific action to take (if any)",
  "regulationUrl": "URL to specific regulation (if found)"
}

**Risk Levels:**
- "clear": No issues found
- "low": Minor labeling/disclosure requirements
- "medium": Registration or testing may be required
- "high": Definite registration/testing required
- "critical": Prohibited or heavily restricted

**Important:**
- Use your search capability to find current ${state} Department of Agriculture regulations
- Be specific about requirements (e.g., "Register with Form XYZ")
- Provide regulatory URLs when possible
- If unsure, default to "medium" risk and recommend manual review

Respond ONLY with the JSON object, no other text.`;

  try {
    const response = await callGemini('gemini-2.5-flash', prompt);

    // Parse AI response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // If no issues, return empty array
    if (!analysis.hasIssues || analysis.riskLevel === 'clear') {
      return [];
    }

    // Create compliance issue
    const issue: ComplianceIssue = {
      ingredient,
      state,
      riskLevel: analysis.riskLevel as ComplianceRiskLevel,
      issue: analysis.issue || 'Potential compliance concern',
      recommendation: analysis.recommendation || 'Consult state agriculture department',
      regulationUrl: analysis.regulationUrl,
      detectedAt: new Date().toISOString(),
    };

    return [issue];
  } catch (error) {
    console.error(`[Compliance Scanner] AI scan failed for ${ingredient} in ${state}:`, error);
    // Return conservative "unknown" issue
    return [{
      ingredient,
      state,
      riskLevel: 'unknown',
      issue: 'Unable to complete regulatory scan',
      recommendation: 'Manually verify compliance requirements',
      detectedAt: new Date().toISOString(),
    }];
  }
}

/**
 * Calculate overall risk level from list of issues
 */
function calculateOverallRisk(issues: ComplianceIssue[]): ComplianceRiskLevel {
  if (issues.length === 0) return 'clear';

  // Priority order: critical > high > medium > low > unknown
  if (issues.some(i => i.riskLevel === 'critical')) return 'critical';
  if (issues.some(i => i.riskLevel === 'high')) return 'high';
  if (issues.some(i => i.riskLevel === 'medium')) return 'medium';
  if (issues.some(i => i.riskLevel === 'low')) return 'low';

  return 'unknown';
}

/**
 * Get full state name from abbreviation
 */
function getStateName(abbr: string): string {
  const stateNames: Record<string, string> = {
    CA: 'California',
    OR: 'Oregon',
    WA: 'Washington',
    NY: 'New York',
    VT: 'Vermont',
    ME: 'Maine',
    TX: 'Texas',
    FL: 'Florida',
    CO: 'Colorado',
    AZ: 'Arizona',
  };
  return stateNames[abbr] || abbr;
}

/**
 * Batch scan all BOMs
 */
export async function scanAllBOMs(
  boms: BillOfMaterials[],
  watchlist: WatchlistItem[],
  states: string[] = DEFAULT_SCAN_STATES,
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, ComplianceStatus>> {
  console.log(`[Compliance Scanner] Batch scanning ${boms.length} BOMs across ${states.length} states`);

  const results = new Map<string, ComplianceStatus>();

  for (let i = 0; i < boms.length; i++) {
    const bom = boms[i];

    if (onProgress) {
      onProgress(i + 1, boms.length);
    }

    try {
      const status = await scanBOMForCompliance(bom, watchlist, states, false);
      results.set(bom.id, status);
    } catch (error) {
      console.error(`[Compliance Scanner] Failed to scan ${bom.name}:`, error);
      // Create error status
      const errorStatus: ComplianceStatus = {
        bomId: bom.id,
        lastScanDate: new Date().toISOString(),
        overallRisk: 'unknown',
        issueCount: 0,
        issues: [],
        statesScanned: [],
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      };
      results.set(bom.id, errorStatus);
    }

    // Rate limiting: wait 1 second between scans to avoid hitting AI API limits
    if (i < boms.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Compliance Scanner] Batch scan complete. ${results.size} BOMs scanned.`);
  return results;
}

/**
 * Get compliance status for a specific BOM
 */
export function getComplianceStatus(bomId: string): ComplianceStatus | null {
  return complianceStatuses.get(bomId) || null;
}

/**
 * Get compliance status for all BOMs
 */
export function getAllComplianceStatuses(): Map<string, ComplianceStatus> {
  return new Map(complianceStatuses);
}

/**
 * Generate dashboard statistics
 */
export function generateComplianceDashboardStats(
  boms: BillOfMaterials[]
): ComplianceDashboardStats {
  const totalBOMs = boms.length;
  let scannedBOMs = 0;
  let clearBOMs = 0;
  let lowRiskBOMs = 0;
  let mediumRiskBOMs = 0;
  let highRiskBOMs = 0;
  let criticalRiskBOMs = 0;
  let unknownBOMs = 0;

  const ingredientIssues = new Map<string, number>();
  const stateIssues = new Map<string, number>();

  for (const bom of boms) {
    const status = complianceStatuses.get(bom.id);

    if (!status) {
      unknownBOMs++;
      continue;
    }

    scannedBOMs++;

    switch (status.overallRisk) {
      case 'clear':
        clearBOMs++;
        break;
      case 'low':
        lowRiskBOMs++;
        break;
      case 'medium':
        mediumRiskBOMs++;
        break;
      case 'high':
        highRiskBOMs++;
        break;
      case 'critical':
        criticalRiskBOMs++;
        break;
      default:
        unknownBOMs++;
    }

    // Count ingredient issues
    for (const issue of status.issues) {
      const count = ingredientIssues.get(issue.ingredient) || 0;
      ingredientIssues.set(issue.ingredient, count + 1);

      const stateCount = stateIssues.get(issue.state) || 0;
      stateIssues.set(issue.state, stateCount + 1);
    }
  }

  // Sort and get top 5
  const topIngredients = Array.from(ingredientIssues.entries())
    .map(([ingredient, issueCount]) => ({ ingredient, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 5);

  const topStates = Array.from(stateIssues.entries())
    .map(([state, issueCount]) => ({ state, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 5);

  return {
    totalBOMs,
    scannedBOMs,
    clearBOMs,
    lowRiskBOMs,
    mediumRiskBOMs,
    highRiskBOMs,
    criticalRiskBOMs,
    unknownBOMs,
    topIngredients,
    topStates,
  };
}

/**
 * Clear all compliance statuses (useful for testing/reset)
 */
export function clearAllComplianceStatuses(): void {
  complianceStatuses.clear();
  console.log('[Compliance Scanner] All compliance statuses cleared');
}
