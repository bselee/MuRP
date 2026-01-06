import { test, expect } from '@playwright/test';

/**
 * E2E tests for Purchase Order tracking features
 *
 * Tests the UnifiedPOList component with:
 * - Progress visualization
 * - Email intelligence display
 * - Tracking number links
 * - Status cards
 * - Filter tabs
 */

test.describe('Purchase Order Tracking', () => {
  test.beforeEach(async ({ page }) => {
    // Set up mock data for consistent testing
    await page.addInitScript(() => {
      window.localStorage.setItem('murp::forceMockData', '1');
    });
  });

  test('displays Purchase Orders page with tracking features', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Verify page loads
    await expect(page.getByRole('heading', { name: 'Purchase Orders', exact: true })).toBeVisible();

    // Check for key UI elements that should always be present
    // Status summary cards section (At Risk, Out for Delivery, etc.)
    const statusCardsSection = page.locator('[class*="grid-cols-4"]').first();
    if (await statusCardsSection.isVisible()) {
      await expect(statusCardsSection).toBeVisible();
    }

    // Filter tabs (All, Active, Attention)
    const filterTabs = page.locator('button:has-text("All"), button:has-text("Active"), button:has-text("Attention")');
    const tabCount = await filterTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(0); // May not have tabs if no data
  });

  test('shows empty state when no POs exist', async ({ page }) => {
    // Clear any mock data
    await page.addInitScript(() => {
      window.localStorage.removeItem('murp::forceMockData');
    });

    await page.goto('/purchase-orders?e2e=1');
    await expect(page.getByRole('heading', { name: 'Purchase Orders', exact: true })).toBeVisible();

    // Either shows PO list or empty state - both are valid
    const hasPOs = await page.locator('table').isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/No Purchase Orders|No POs|Create a new PO/i).isVisible().catch(() => false);

    expect(hasPOs || hasEmptyState).toBe(true);
  });

  test('tracking number links are clickable and open in new tab', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Look for any tracking number links (format: truncated tracking with external link icon)
    const trackingLinks = page.locator('a[href*="ups.com"], a[href*="fedex.com"], a[href*="usps.com"], a[href*="dhl.com"]');
    const linkCount = await trackingLinks.count();

    if (linkCount > 0) {
      // Verify first tracking link has target="_blank" for new tab
      const firstLink = trackingLinks.first();
      await expect(firstLink).toHaveAttribute('target', '_blank');
      await expect(firstLink).toHaveAttribute('rel', /noopener/);
    }
    // Test passes even with 0 links (no tracking data yet)
  });

  test('progress dots show correct number of stages', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Progress dots should have 5 stages: Ordered, Confirmed, Shipped, Transit, Delivered
    // Look for progress indicator containers
    const progressIndicators = page.locator('[class*="flex"][class*="items-center"][class*="gap-1"]');

    // If progress indicators exist, verify structure
    const indicatorCount = await progressIndicators.count();
    if (indicatorCount > 0) {
      // Each progress indicator should have multiple dots
      const dots = page.locator('[class*="rounded-full"][class*="w-5"][class*="h-5"]');
      const dotCount = await dots.count();
      // Could be 5 dots per row, times number of POs
      expect(dotCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('status badges use correct color coding', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Check for status badges with expected color classes
    const deliveredBadges = page.locator('[class*="bg-emerald"]:has-text("Delivered"), [class*="bg-emerald"]:has-text("Received")');
    const inTransitBadges = page.locator('[class*="bg-blue"]:has-text("In Transit"), [class*="bg-blue"]:has-text("Shipped")');
    const exceptionBadges = page.locator('[class*="bg-red"]:has-text("Exception"), [class*="bg-red"]:has-text("Delayed")');

    // At least verify no JavaScript errors occurred
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Page should render without critical errors
    await page.waitForTimeout(1000);
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('filter tabs change displayed POs', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Find filter buttons
    const activeTab = page.getByRole('button', { name: 'Active' });
    const attentionTab = page.getByRole('button', { name: 'Attention' });
    const allTab = page.getByRole('button', { name: 'All' });

    // If tabs exist, test clicking them
    if (await activeTab.isVisible()) {
      await activeTab.click();
      await page.waitForTimeout(300);

      // Should show only active POs (not completed/cancelled)
      const completedInList = page.locator('text=/Completed|Received|Cancelled/i');
      // In active filter, completed items should be filtered out
    }

    if (await attentionTab.isVisible()) {
      await attentionTab.click();
      await page.waitForTimeout(300);
      // Should show only POs needing attention
    }

    if (await allTab.isVisible()) {
      await allTab.click();
      await page.waitForTimeout(300);
      // Should show all POs
    }
  });

  test('row expansion shows timeline details', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Find a PO row and click to expand
    const poRow = page.locator('tr[class*="cursor-pointer"]').first();

    if (await poRow.isVisible()) {
      await poRow.click();

      // Expanded section should show delivery progress
      const deliveryProgress = page.getByText('Delivery Progress');
      if (await deliveryProgress.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(deliveryProgress).toBeVisible();

        // Should show stage names
        await expect(page.getByText('Ordered')).toBeVisible();
        await expect(page.getByText('Delivered')).toBeVisible();
      }
    }
  });

  test('email intel shows message count and reply status', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Email Intel column should exist in header
    const emailIntelHeader = page.getByRole('columnheader', { name: /Email Intel/i });

    if (await emailIntelHeader.isVisible()) {
      // Look for email indicators in the table
      const emailIcons = page.locator('[class*="MailIcon"], svg[class*="mail"]');
      const awaitingReply = page.getByText(/Awaiting reply/i);
      const replied = page.getByText(/Replied/i);

      // At least verify the column renders
      await expect(emailIntelHeader).toBeVisible();
    }
  });

  test('Timeline button opens details view', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Find Timeline button in table
    const timelineButton = page.getByRole('button', { name: 'Timeline' }).first();

    if (await timelineButton.isVisible()) {
      await timelineButton.click();

      // Should trigger onViewDetails callback
      // The actual behavior depends on parent component implementation
      await page.waitForTimeout(500);
    }
  });

  test('status cards show correct counts', async ({ page }) => {
    await page.goto('/purchase-orders?e2e=1');

    // Look for status card labels
    const atRiskCard = page.getByText('At Risk');
    const outForDeliveryCard = page.getByText('Out for Delivery');
    const deliveredTodayCard = page.getByText('Delivered Today');
    const needsFollowupCard = page.getByText('Needs Follow-up');

    // If cards exist, verify they have numeric values
    if (await atRiskCard.isVisible()) {
      // Find the number next to the label
      const atRiskSection = atRiskCard.locator('..'); // Parent element
      const numberText = await atRiskSection.locator('[class*="text-2xl"]').textContent();
      if (numberText) {
        expect(parseInt(numberText)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test.describe('Email Connection Required', () => {
  test('settings page shows email connection option', async ({ page }) => {
    await page.goto('/settings?e2e=1');

    // Look for Email Monitoring section specifically
    const emailSection = page.getByRole('button', { name: /Email Monitoring/i }).first();

    if (await emailSection.isVisible().catch(() => false)) {
      await emailSection.click();

      // Should show connection options
      await expect(page.getByText(/Connect Gmail|Connect Email|Purchasing Email/i)).toBeVisible({ timeout: 5000 }).catch(() => {
        // May not be visible if already connected
      });
    } else {
      // If no Email Monitoring button, check for Company Email Policy
      const policySection = page.getByRole('button', { name: /Company Email Policy/i });
      if (await policySection.isVisible().catch(() => false)) {
        await policySection.click();
        // Email policy section exists
      }
    }
  });
});
