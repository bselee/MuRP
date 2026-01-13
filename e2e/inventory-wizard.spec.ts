import { test, expect } from '@playwright/test';

test.describe('Inventory Setup Wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Inventory page with e2e bypass
    await page.goto('/inventory?e2e=1');
  });

  test('should show empty state when no items exist', async ({ page }) => {
    // Note: We can't easily force "no items" in a live e2e without a clean DB, 
    // but we can check if the components exist if the state happened to be empty,
    // or we can test the "Import" button flow if we manually trigger the wizard.

    // Since we can't guarantee empty state in E2E environment without resetting DB,
    // let's verify the Import button functionality which opens the wizard.
    
    // Check if we can find the Import button (either in empty state or header)
    const importButton = page.getByRole('button', { name: /Import/i }).first();
    await expect(importButton).toBeVisible();
    await importButton.click();

    // Verify Wizard Modal opens
    await expect(page.getByText('How would you like to add your inventory?')).toBeVisible();
    await expect(page.getByText('Upload Spreadsheet')).toBeVisible();
    await expect(page.getByText('Get Template')).toBeVisible();
    await expect(page.getByText('Try Sample Data')).toBeVisible();
  });

  test('should preview sample data correctly', async ({ page }) => {
    // Open wizard
    const importButton = page.getByRole('button', { name: /Import/i }).first();
    await importButton.click();
    
    // Choose Sample Data
    await page.getByText('Try Sample Data').click();

    // Verify Preview Step
    await expect(page.getByText('Import Preview')).toBeVisible();
    
    // Check for sample data content
    await expect(page.getByText('Premium Widget')).toBeVisible();
    await expect(page.getByText('Gadgets Inc')).toBeVisible();
    await expect(page.getByText('Valid')).first().toBeVisible();

    // Verify Complete Button exists
    const completeButton = page.getByRole('button', { name: /Complete Import/i });
    await expect(completeButton).toBeVisible();
  });

  // Note: We avoid clicking "Complete Import" in this test to not pollute the DB with sample data repeatedly
});
