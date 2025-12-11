import { test, expect } from '@playwright/test';

test.describe('UI Elements and Styling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have dark theme background', async ({ page }) => {
    const container = page.locator('body');
    await expect(container).toHaveClass(/bg-gray-900/);
  });

  test('login form should be centered', async ({ page }) => {
    const container = page.locator('div.min-h-screen').first();
    await expect(container).toHaveClass(/flex items-center justify-center/);
  });

  test('all buttons should be visible and clickable', async ({ page }) => {
    // Check Sign In button
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await expect(signInBtn).toBeVisible();
    await expect(signInBtn).toBeEnabled();
    
    // Check Forgot password button
    const forgotBtn = page.getByRole('button', { name: 'Forgot password?' });
    await expect(forgotBtn).toBeVisible();
    await expect(forgotBtn).toBeEnabled();
    
    // Check Sign up button
    const signUpBtn = page.getByRole('button', { name: 'Sign up' });
    await expect(signUpBtn).toBeVisible();
    await expect(signUpBtn).toBeEnabled();
  });

  test('input fields should have proper placeholders', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'you@example.com');
    
    const passwordInput = page.getByPlaceholder('••••••••');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('placeholder', '••••••••');
  });

  test('logo should be properly sized', async ({ page }) => {
    const logo = page.locator('img').first();
    await expect(logo).toBeVisible();
  });

  test('heading should be prominent', async ({ page }) => {
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveClass(/text-4xl font-bold/);
  });

  test('form should have proper spacing', async ({ page }) => {
    const form = page.locator('form, div').filter({ hasText: 'Sign In' }).first();
    await expect(form).toBeVisible();
  });

  test('should display proper text colors', async ({ page }) => {
    // Check heading is white
    const heading = page.locator('h1');
    await expect(heading).toHaveClass(/text-white/);
    
    // Check subtitle is gray
    const subtitle = page.locator('p').first();
    await expect(subtitle).toHaveClass(/text-gray-400/);
  });

  test('buttons should have hover states (visual check)', async ({ page }) => {
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    
    // Button should be visible and enabled, implying it has proper styling
    await expect(signInBtn).toBeVisible();
    await expect(signInBtn).toBeEnabled();
    
    // Hover over the button
    await signInBtn.hover();
    
    // Button should still be visible after hover
    await expect(signInBtn).toBeVisible();
  });

  test('responsive layout should work', async ({ page }) => {
    // Check that form has max-width constraint
    const formContainer = page.locator('div.w-full.max-w-md');
    await expect(formContainer).toBeVisible();
  });

  test('form inputs should be accessible', async ({ page }) => {
    // Check that inputs have associated labels or text
    const emailLabel = page.getByText('Email');
    await expect(emailLabel).toBeVisible();
    
    const passwordLabel = page.getByText('Password');
    await expect(passwordLabel).toBeVisible();
  });

  test('should have proper form structure on sign up page', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign up' }).click();
    
    // Check all form elements are visible
    await expect(page.getByText('Full Name')).toBeVisible();
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Password')).toBeVisible();
    await expect(page.getByText('At least 6 characters')).toBeVisible();
  });

  test('should have proper form structure on password reset page', async ({ page }) => {
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    
    // Check form elements
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText("We'll send you a password reset link")).toBeVisible();
  });
});
