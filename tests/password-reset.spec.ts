import { test, expect } from '@playwright/test';

test.describe('Password Reset Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Click on Forgot password button to navigate to reset form
    await page.getByRole('button', { name: 'Forgot password?' }).click();
  });

  test('should display password reset form', async ({ page }) => {
    await expect(page.getByText('Reset your password')).toBeVisible();
    
    // Check form fields
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    
    // Check helper text
    await expect(page.getByText("We'll send you a password reset link")).toBeVisible();
    
    // Check buttons
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('email field should accept input', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('reset@example.com');
    await expect(emailInput).toHaveValue('reset@example.com');
  });

  test('should be able to navigate back to sign in', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Sign in to your account')).toBeVisible();
  });

  test('should display remember password text', async ({ page }) => {
    await expect(page.getByText('Remember your password?')).toBeVisible();
  });

  test('should have correct page title', async ({ page }) => {
    await expect(page).toHaveTitle('TGF MRP');
  });
});
