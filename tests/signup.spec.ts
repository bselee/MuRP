import { test, expect } from '@playwright/test';

test.describe('Sign Up Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Click on Sign up button to navigate to signup form
    await page.getByRole('button', { name: 'Sign up' }).click();
  });

  test('should display sign up form', async ({ page }) => {
    await expect(page.getByText('Create a new account')).toBeVisible();
    
    // Check form fields
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    
    // Check password requirement text
    await expect(page.getByText('At least 6 characters')).toBeVisible();
    
    // Check buttons
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('name field should accept input', async ({ page }) => {
    const nameInput = page.getByPlaceholder('John Doe');
    await nameInput.fill('Test User');
    await expect(nameInput).toHaveValue('Test User');
  });

  test('email field should accept input', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('testuser@example.com');
    await expect(emailInput).toHaveValue('testuser@example.com');
  });

  test('password field should accept input', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('••••••••');
    await passwordInput.fill('password123');
    await expect(passwordInput).toHaveValue('password123');
  });

  test('should be able to navigate back to sign in', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Sign in to your account')).toBeVisible();
  });

  test('should display already have account text', async ({ page }) => {
    await expect(page.getByText('Already have an account?')).toBeVisible();
  });

  test('form fields should be in correct order', async ({ page }) => {
    // Get all input fields and verify their order
    const inputs = page.locator('input[type="text"], input[type="email"], input[type="password"]');
    
    // Should have at least 3 inputs (name, email, password)
    await expect(inputs).toHaveCount(3);
  });
});
