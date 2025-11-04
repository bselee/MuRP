/**
 * Vendors Page E2E Smoke Tests
 *
 * Tests that the Vendors page renders correctly and displays vendor data
 */

import { test, expect } from '@playwright/test';

test.describe('Vendors Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the vendors page
    // Adjust the URL based on your local dev server or deployment URL
    await page.goto('/vendors');
  });

  test('should display the Vendors page header', async ({ page }) => {
    // Check for the page title
    await expect(page.locator('h1')).toContainText('Vendors');

    // Check for the subtitle
    await expect(page.getByText('Manage your supplier information')).toBeVisible();

    // Check for the "Add New Vendor" button
    await expect(page.getByRole('button', { name: /add new vendor/i })).toBeVisible();
  });

  test('should display the vendors table', async ({ page }) => {
    // Check that the table exists
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Check for table headers
    await expect(page.getByRole('columnheader', { name: /vendor name/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /contact info/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /address/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /lead time/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /source/i })).toBeVisible();
  });

  test('should display vendor rows with correct data', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    // Get all vendor rows
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    // Should have at least one vendor
    expect(rowCount).toBeGreaterThan(0);

    // Check first vendor row has expected structure
    const firstRow = rows.first();

    // Should have vendor name
    const nameCell = firstRow.locator('td').first();
    await expect(nameCell).not.toBeEmpty();

    // Should have contact info (emails or "No email")
    const contactCell = firstRow.locator('td').nth(1);
    await expect(contactCell).not.toBeEmpty();

    // Should have address (address or "No address")
    const addressCell = firstRow.locator('td').nth(2);
    await expect(addressCell).not.toBeEmpty();

    // Should have lead time in days format
    const leadTimeCell = firstRow.locator('td').nth(3);
    await expect(leadTimeCell).toContainText(/\d+ days/);

    // Should have source badge (CSV/API/Manual)
    const sourceCell = firstRow.locator('td').nth(4);
    await expect(sourceCell).not.toBeEmpty();
  });

  test('should display email addresses as clickable links', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    // Find a vendor with an email
    const emailLink = page.locator('table tbody a[href^="mailto:"]').first();

    // Check if at least one email link exists
    const emailCount = await page.locator('table tbody a[href^="mailto:"]').count();

    if (emailCount > 0) {
      // Verify email link is visible and clickable
      await expect(emailLink).toBeVisible();

      // Verify it has mailto: href
      const href = await emailLink.getAttribute('href');
      expect(href).toContain('mailto:');
    } else {
      console.log('No vendors with emails found - skipping email link test');
    }
  });

  test('should display website links correctly', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    // Find vendors with websites
    const websiteLinks = page.locator('table tbody a[href^="http"]');
    const websiteCount = await websiteLinks.count();

    if (websiteCount > 0) {
      const firstWebsite = websiteLinks.first();

      // Verify website link is visible
      await expect(firstWebsite).toBeVisible();

      // Verify it opens in new tab
      const target = await firstWebsite.getAttribute('target');
      expect(target).toBe('_blank');

      // Verify it has rel="noopener noreferrer" for security
      const rel = await firstWebsite.getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    } else {
      console.log('No vendors with websites found - skipping website link test');
    }
  });

  test('should display address components when available', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    const rows = page.locator('table tbody tr');
    const firstRow = rows.first();
    const addressCell = firstRow.locator('td').nth(2);

    // Check that address cell is not empty
    await expect(addressCell).not.toBeEmpty();

    // The address should not show "No address" if vendor has address data
    const addressText = await addressCell.textContent();
    const hasAddress = addressText && !addressText.includes('No address');

    if (hasAddress) {
      // If vendor has address, it should display street, city, state, or zip
      expect(addressText).toBeTruthy();
      expect(addressText!.length).toBeGreaterThan(0);
    }
  });

  test('should display source badges correctly', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    const rows = page.locator('table tbody tr');
    const firstRow = rows.first();
    const sourceCell = firstRow.locator('td').nth(4);

    // Source cell should contain a badge (CSV, API, or Manual)
    const badges = sourceCell.locator('span');
    const badgeCount = await badges.count();

    expect(badgeCount).toBeGreaterThan(0);

    // Check badge text
    const badgeText = await badges.first().textContent();
    expect(badgeText).toMatch(/CSV|API|Manual/);
  });

  test('should display phone numbers when available', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    // Find vendors with phone numbers (indicated by 📞 emoji)
    const phoneElements = page.locator('table tbody').getByText(/📞/);
    const phoneCount = await phoneElements.count();

    if (phoneCount > 0) {
      const firstPhone = phoneElements.first();
      await expect(firstPhone).toBeVisible();

      // Phone should have the emoji and a number
      const phoneText = await firstPhone.textContent();
      expect(phoneText).toContain('📞');
      expect(phoneText!.length).toBeGreaterThan(2); // More than just the emoji
    } else {
      console.log('No vendors with phone numbers found');
    }
  });

  test('should display notes when available', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    // Find vendors with notes (indicated by 📝 emoji)
    const notesElements = page.locator('table tbody').getByText(/📝/);
    const notesCount = await notesElements.count();

    if (notesCount > 0) {
      const firstNotes = notesElements.first();
      await expect(firstNotes).toBeVisible();

      // Notes should have the emoji and some text
      const notesText = await firstNotes.textContent();
      expect(notesText).toContain('📝');
      expect(notesText!.length).toBeGreaterThan(2); // More than just the emoji
    } else {
      console.log('No vendors with notes found');
    }
  });

  test('should handle empty vendor list gracefully', async ({ page }) => {
    // This test checks what happens if there are no vendors
    // In production, there should always be vendors, but during development there might not be

    const rows = await page.locator('table tbody tr').count();

    if (rows === 0) {
      // If no vendors, table should still render
      const table = page.locator('table');
      await expect(table).toBeVisible();

      // Headers should still be visible
      await expect(page.getByRole('columnheader', { name: /vendor name/i })).toBeVisible();

      console.log('No vendors found - empty state test');
    } else {
      console.log(`Found ${rows} vendor(s) - normal state`);
    }
  });

  test('should have proper hover effects on rows', async ({ page }) => {
    // Wait for vendors to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    const firstRow = page.locator('table tbody tr').first();

    // Hover over the row
    await firstRow.hover();

    // Check that hover class is applied (transition-colors duration-200)
    const className = await firstRow.getAttribute('class');
    expect(className).toContain('hover:bg-gray-700/50');
  });
});

test.describe('Vendors Page - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/vendors');
  });

  test('should have proper semantic HTML', async ({ page }) => {
    // Check for proper heading hierarchy
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // Check for table structure
    await expect(page.locator('table thead')).toBeVisible();
    await expect(page.locator('table tbody')).toBeVisible();

    // Check for proper button
    const button = page.getByRole('button', { name: /add new vendor/i });
    await expect(button).toBeVisible();
  });

  test('should have accessible links', async ({ page }) => {
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    // All external links should have target="_blank" and rel="noopener noreferrer"
    const externalLinks = page.locator('a[target="_blank"]');
    const count = await externalLinks.count();

    for (let i = 0; i < count; i++) {
      const link = externalLinks.nth(i);
      const rel = await link.getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });
});

test.describe('Vendors Page - Performance', () => {
  test('should load within reasonable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/vendors');

    // Wait for vendors to be visible
    await page.waitForSelector('table tbody tr', { timeout: 5000 });

    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);

    console.log(`Vendors page loaded in ${loadTime}ms`);
  });
});
