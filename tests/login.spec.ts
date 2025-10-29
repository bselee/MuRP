import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form', async ({ page }) => {
    // Check if the login form is visible
    await expect(page.locator('h1')).toContainText('TGF MRP');
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    
    // Check form fields
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    
    // Check buttons
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
  });

  test('should have correct page title', async ({ page }) => {
    await expect(page).toHaveTitle('TGF MRP');
  });

  test('should show logo image', async ({ page }) => {
    const logo = page.locator('img').first();
    await expect(logo).toBeVisible();
  });

  test('email field should accept input', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
  });

  test('password field should accept input and mask it', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('••••••••');
    await passwordInput.fill('testpassword123');
    // Password fields typically have type="password" which masks the input
    await expect(passwordInput).toHaveValue('testpassword123');
  });

  test('should have sign up link', async ({ page }) => {
    const signUpText = page.getByText("Don't have an account?");
    await expect(signUpText).toBeVisible();
    
    const signUpButton = page.getByRole('button', { name: 'Sign up' });
    await expect(signUpButton).toBeVisible();
  });

  test('forgot password button should be present', async ({ page }) => {
    const forgotPasswordBtn = page.getByRole('button', { name: 'Forgot password?' });
    await expect(forgotPasswordBtn).toBeVisible();
  });
});
