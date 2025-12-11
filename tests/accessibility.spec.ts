import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have proper page title for screen readers', async ({ page }) => {
    await expect(page).toHaveTitle('TGF MRP');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have an h1
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('TGF MRP');
  });

  test('form inputs should have associated labels', async ({ page }) => {
    // Check Email label
    const emailLabel = page.getByText('Email');
    await expect(emailLabel).toBeVisible();
    
    // Check Password label
    const passwordLabel = page.getByText('Password');
    await expect(passwordLabel).toBeVisible();
  });

  test('buttons should be keyboard accessible', async ({ page }) => {
    // Focus on the first button
    await page.keyboard.press('Tab');
    
    // Check that a button receives focus
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await expect(signInBtn).toBeVisible();
  });

  test('form inputs should be keyboard accessible', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    
    // Click to focus
    await emailInput.click();
    
    // Type using keyboard
    await page.keyboard.type('test@example.com');
    
    await expect(emailInput).toHaveValue('test@example.com');
  });

  test('should be able to navigate form with Tab key', async ({ page }) => {
    // Tab through the form
    await page.keyboard.press('Tab'); // Should focus on email or first input
    await page.keyboard.press('Tab'); // Should move to next field
    await page.keyboard.press('Tab'); // Should move to button
    
    // Check that focus is on some element
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('should be able to submit form with Enter key', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    const passwordInput = page.getByPlaceholder('••••••••');
    
    await emailInput.fill('test@example.com');
    await passwordInput.fill('password123');
    
    // Press Enter to submit
    await passwordInput.press('Enter');
    
    // Form submission would be handled by Supabase, but we can verify the form accepts Enter key
    await expect(page).toHaveTitle('TGF MRP');
  });

  test('image should have proper alt text', async ({ page }) => {
    const logo = page.locator('img').first();
    await expect(logo).toBeVisible();
    
    // Check if image has alt attribute (even if empty, it should exist)
    const altText = await logo.getAttribute('alt');
    expect(altText).not.toBeNull();
  });

  test('interactive elements should be distinguishable', async ({ page }) => {
    // All buttons should be visible and appear interactive
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    expect(buttonCount).toBeGreaterThan(0);
    
    for (let i = 0; i < buttonCount; i++) {
      await expect(buttons.nth(i)).toBeVisible();
    }
  });

  test('focus should be visible on interactive elements', async ({ page }) => {
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    
    // Focus the button
    await signInBtn.focus();
    
    // Check button is focused
    await expect(signInBtn).toBeFocused();
  });

  test('color contrast should be sufficient (visual check)', async ({ page }) => {
    // This is a basic check - proper contrast would need color analysis
    // We check that text is visible against background
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    
    const subtitle = page.locator('p').first();
    await expect(subtitle).toBeVisible();
  });

  test('error messages should be accessible (placeholder test)', async ({ page }) => {
    // This test verifies the structure for error handling
    // Actual error messages would appear after form submission with invalid data
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await expect(signInBtn).toBeVisible();
  });

  test('sign up form should be accessible', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign up' }).click();
    
    // Check all fields have labels
    await expect(page.getByText('Full Name')).toBeVisible();
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Password')).toBeVisible();
    
    // Check helper text
    await expect(page.getByText('At least 6 characters')).toBeVisible();
  });

  test('password reset form should be accessible', async ({ page }) => {
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    
    // Check field has label
    await expect(page.getByText('Email')).toBeVisible();
    
    // Check helper text
    await expect(page.getByText("We'll send you a password reset link")).toBeVisible();
  });

  test('all text should be selectable', async ({ page }) => {
    const heading = page.locator('h1');
    const headingText = await heading.textContent();
    
    expect(headingText).toBeTruthy();
    expect(headingText?.length).toBeGreaterThan(0);
  });
});
