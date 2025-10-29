import { test, expect } from '@playwright/test';

test.describe('Authentication Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should navigate from sign in to sign up and back', async ({ page }) => {
    // Start at sign in
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    
    // Navigate to sign up
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByText('Create a new account')).toBeVisible();
    
    // Navigate back to sign in
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Sign in to your account')).toBeVisible();
  });

  test('should navigate from sign in to password reset and back', async ({ page }) => {
    // Start at sign in
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    
    // Navigate to password reset
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByText('Reset your password')).toBeVisible();
    
    // Navigate back to sign in
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Sign in to your account')).toBeVisible();
  });

  test('should navigate between all three auth screens', async ({ page }) => {
    // Sign In -> Sign Up
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByText('Create a new account')).toBeVisible();
    
    // Sign Up -> Sign In
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    
    // Sign In -> Reset Password
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByText('Reset your password')).toBeVisible();
    
    // Reset Password -> Sign In
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Sign in to your account')).toBeVisible();
  });

  test('form data should be preserved when navigating away and back', async ({ page }) => {
    // Fill in email on sign in page
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('test@example.com');
    
    // Navigate to sign up
    await page.getByRole('button', { name: 'Sign up' }).click();
    
    // Navigate back to sign in
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    // Email should still be filled (React state management)
    await expect(emailInput).toHaveValue('test@example.com');
  });

  test('should display correct logo on all auth screens', async ({ page }) => {
    const logo = page.locator('img').first();
    
    // Check logo on sign in
    await expect(logo).toBeVisible();
    
    // Check logo on sign up
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(logo).toBeVisible();
    
    // Check logo on password reset
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(logo).toBeVisible();
  });

  test('should display TGF MRP heading on all auth screens', async ({ page }) => {
    const heading = page.locator('h1');
    
    // Check heading on sign in
    await expect(heading).toContainText('TGF MRP');
    
    // Check heading on sign up
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(heading).toContainText('TGF MRP');
    
    // Check heading on password reset
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(heading).toContainText('TGF MRP');
  });
});
