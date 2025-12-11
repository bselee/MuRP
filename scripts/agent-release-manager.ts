/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🐙 GITHUB AGENT - DevOps & Release Manager
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent monitors Git branches and PRs, specifically focusing on
 * "agent" updates (feature branches). It acts as a release manager.
 *
 * Capabilities:
 * - Monitors open PRs and feature branches
 * - Verifies CI/CD status (checks if merge is "good")
 * - "Thoughtful Merge": Collects ready PRs into a release candidates
 * - Pushes to main (merges PRs)
 *
 * @module services/githubAgent
 */

import { Octokit } from '@octokit/rest';

// Initialize Octokit with token from env
// Note: In a real client-side app, you might proxy this through an API route
// to avoid exposing the token, or use a specific permission-scoped token.
const octokit = new Octokit({
    auth: import.meta.env.VITE_GITHUB_TOKEN || process.env.GITHUB_TOKEN,
});

const OWNER = 'bselee'; // Detected from user info: bselee/MuRP
const REPO = 'MuRP';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PullRequest {
    id: number;
    number: number;
    title: string;
    author: string;
    branch: string;
    base: string;
    status: 'open' | 'closed' | 'merged';
    mergeable: boolean;
    ciStatus: 'success' | 'failure' | 'pending' | 'unknown';
    labels: string[];
    createdAt: string;
}

export interface MergeCandidate {
    prString: string; // "PR #123: Title"
    readiness: 'ready' | 'blocked' | 'pending';
    blockers: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Monitor for all open agent-related updates (PRs)
 */
export async function monitorAgentUpdates(): Promise<PullRequest[]> {
    try {
        const { data: prs } = await octokit.rest.pulls.list({
            owner: OWNER,
            repo: REPO,
            state: 'open',
            sort: 'updated',
            direction: 'desc',
        });

        const detailedPRs = await Promise.all(
            prs.map(async (pr) => {
                // Get detailed info for mergeable state
                const { data: fullPR } = await octokit.rest.pulls.get({
                    owner: OWNER,
                    repo: REPO,
                    pull_number: pr.number,
                });

                // Get CI status
                const { data: status } = await octokit.rest.repos.getCombinedStatusForRef({
                    owner: OWNER,
                    repo: REPO,
                    ref: pr.head.sha,
                });

                return {
                    id: pr.id,
                    number: pr.number,
                    title: pr.title,
                    author: pr.user?.login || 'unknown',
                    branch: pr.head.ref,
                    base: pr.base.ref,
                    status: pr.state as any,
                    mergeable: fullPR.mergeable ?? false,
                    ciStatus: status.state as any,
                    labels: pr.labels.map((l: any) => l.name),
                    createdAt: pr.created_at,
                };
            })
        );

        return detailedPRs;
    } catch (error) {
        console.error('Error monitoring agent updates:', error);
        return [];
    }
}

/**
 * Verify if a specific feature (PR) is good to merge
 */
export async function verifyMerge(prNumber: number): Promise<MergeCandidate> {
    try {
        const { data: pr } = await octokit.rest.pulls.get({
            owner: OWNER,
            repo: REPO,
            pull_number: prNumber,
        });

        const { data: status } = await octokit.rest.repos.getCombinedStatusForRef({
            owner: OWNER,
            repo: REPO,
            ref: pr.head.sha,
        });

        const blockers: string[] = [];

        if (pr.mergeable === false) blockers.push('Merge conflicts detected');
        if (status.state === 'failure') blockers.push('CI checks failed');
        if (status.state === 'pending') blockers.push('CI checks still running');

        // Check for "do not merge" label
        if (pr.labels.some((l: any) => l.name?.toLowerCase().includes('do not merge'))) {
            blockers.push('Marked as "Do Not Merge"');
        }

        return {
            prString: `PR #${pr.number}: ${pr.title}`,
            readiness: blockers.length === 0 ? 'ready' : (status.state === 'pending' ? 'pending' : 'blocked'),
            blockers,
        };
    } catch (error) {
        console.error('Error verifying merge:', error);
        return {
            prString: `PR #${prNumber}`,
            readiness: 'blocked',
            blockers: ['Failed to fetch PR details'],
        };
    }
}

/**
 * "Thoughtful Merge": Collects compatible PRs and pushes them to main.
 * In a real scenario, this might create a rollup branch.
 * For now, it merges them sequentially if they are ready.
 */
export async function thoughtfulMerge(prNumbers: number[]): Promise<{ success: number[]; failed: number[] }> {
    const success: number[] = [];
    const failed: number[] = [];

    for (const prNumber of prNumbers) {
        const verification = await verifyMerge(prNumber);

        if (verification.readiness === 'ready') {
            try {
                await octokit.rest.pulls.merge({
                    owner: OWNER,
                    repo: REPO,
                    pull_number: prNumber,
                    merge_method: 'squash', // Thoughtful merge = squash for clean history
                    commit_title: `🤖 Agent Merge: PR #${prNumber}`,
                    commit_message: `Merged by Github Agent after verification.\n\n${verification.prString}`,
                });
                success.push(prNumber);
            } catch (error) {
                console.error(`Failed to merge PR #${prNumber}:`, error);
                failed.push(prNumber);
            }
        } else {
            failed.push(prNumber);
        }
    }

    return { success, failed };
}

/**
 * Get statistics for the dashboard
 */
export async function getGithubStats(): Promise<{
    openPRs: number;
    readyToMerge: number;
    avgCiTime: string; // Placeholder
}> {
    const updates = await monitorAgentUpdates();
    const ready = updates.filter(pr => pr.ciStatus === 'success' && pr.mergeable);

    return {
        openPRs: updates.length,
        readyToMerge: ready.length,
        avgCiTime: '4m 30s', // Placeholder
    };
}

/**
 * 🔄 Auto-Pilot Routine
 * Checks for ready PRs and merges them automatically if safe.
 */
export async function runAutoMergeRoutine(): Promise<{ merged: number[]; message: string }> {
    try {
        const prs = await monitorAgentUpdates();

        // Strict safety check for auto-merge:
        // 1. CI must be success (not pending, not failure)
        // 2. Must be mergeable
        // 3. Must NOT have 'do-not-merge' label
        const readyPrs = prs.filter(pr =>
            pr.ciStatus === 'success' &&
            pr.mergeable &&
            !pr.labels.some(l => l.toLowerCase().includes('do not merge'))
        );

        if (readyPrs.length === 0) {
            return { merged: [], message: 'No PRs ready for auto-merge' };
        }

        const prNumbers = readyPrs.map(pr => pr.number);
        const result = await thoughtfulMerge(prNumbers);

        return {
            merged: result.success,
            message: `Auto-merged ${result.success.length} PRs (${result.failed.length} failed)`
        };
    } catch (error: any) {
        console.error('Auto-merge routine failed:', error);
        return { merged: [], message: `Auto-merge error: ${error.message}` };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
    monitorAgentUpdates,
    verifyMerge,
    thoughtfulMerge,
    getGithubStats,
    runAutoMergeRoutine,
};
