import { test, expect } from '@playwright/test';

test.describe('Form Validation', () => {
  test.describe('Sign In Form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
    });

    test('should have proper input types', async ({ page }) => {
      const emailInput = page.getByPlaceholder('you@example.com');
      const passwordInput = page.getByPlaceholder('••••••••');
      
      // Email input should accept text
      await emailInput.fill('test@example.com');
      await expect(emailInput).toHaveValue('test@example.com');
      
      // Password input should accept text
      await passwordInput.fill('password123');
      await expect(passwordInput).toHaveValue('password123');
    });

    test('should accept valid email format', async ({ page }) => {
      const emailInput = page.getByPlaceholder('you@example.com');
      
      // Valid email formats
      await emailInput.fill('user@example.com');
      await expect(emailInput).toHaveValue('user@example.com');
      
      await emailInput.fill('user.name@example.co.uk');
      await expect(emailInput).toHaveValue('user.name@example.co.uk');
      
      await emailInput.fill('user+tag@example.com');
      await expect(emailInput).toHaveValue('user+tag@example.com');
    });

    test('should accept various password formats', async ({ page }) => {
      const passwordInput = page.getByPlaceholder('••••••••');
      
      // Short password
      await passwordInput.fill('pass');
      await expect(passwordInput).toHaveValue('pass');
      
      // Long password
      await passwordInput.fill('verylongpassword123456789');
      await expect(passwordInput).toHaveValue('verylongpassword123456789');
      
      // Password with special characters
      await passwordInput.fill('p@ssw0rd!#$');
      await expect(passwordInput).toHaveValue('p@ssw0rd!#$');
    });

    test('should allow empty form fields', async ({ page }) => {
      // Form should render even with empty fields
      const signInBtn = page.getByRole('button', { name: 'Sign In' });
      await expect(signInBtn).toBeVisible();
      await expect(signInBtn).toBeEnabled();
    });
  });

  test.describe('Sign Up Form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Sign up' }).click();
    });

    test('should have proper input fields', async ({ page }) => {
      const nameInput = page.getByPlaceholder('John Doe');
      const emailInput = page.getByPlaceholder('you@example.com');
      const passwordInput = page.getByPlaceholder('••••••••');
      
      await expect(nameInput).toBeVisible();
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });

    test('should accept valid name', async ({ page }) => {
      const nameInput = page.getByPlaceholder('John Doe');
      
      await nameInput.fill('John Doe');
      await expect(nameInput).toHaveValue('John Doe');
      
      await nameInput.fill('María García');
      await expect(nameInput).toHaveValue('María García');
      
      await nameInput.fill('O\'Brien');
      await expect(nameInput).toHaveValue('O\'Brien');
    });

    test('should display password requirement', async ({ page }) => {
      await expect(page.getByText('At least 6 characters')).toBeVisible();
    });

    test('should accept password meeting minimum length', async ({ page }) => {
      const passwordInput = page.getByPlaceholder('••••••••');
      
      // Exactly 6 characters
      await passwordInput.fill('pass12');
      await expect(passwordInput).toHaveValue('pass12');
      
      // More than 6 characters
      await passwordInput.fill('password123');
      await expect(passwordInput).toHaveValue('password123');
    });

    test('all form fields should accept input', async ({ page }) => {
      const nameInput = page.getByPlaceholder('John Doe');
      const emailInput = page.getByPlaceholder('you@example.com');
      const passwordInput = page.getByPlaceholder('••••••••');
      
      await nameInput.fill('Test User');
      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      
      await expect(nameInput).toHaveValue('Test User');
      await expect(emailInput).toHaveValue('test@example.com');
      await expect(passwordInput).toHaveValue('password123');
    });
  });

  test.describe('Password Reset Form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Forgot password?' }).click();
    });

    test('should have email input field', async ({ page }) => {
      const emailInput = page.getByPlaceholder('you@example.com');
      await expect(emailInput).toBeVisible();
    });

    test('should accept valid email', async ({ page }) => {
      const emailInput = page.getByPlaceholder('you@example.com');
      
      await emailInput.fill('reset@example.com');
      await expect(emailInput).toHaveValue('reset@example.com');
    });

    test('should display helper text', async ({ page }) => {
      await expect(page.getByText("We'll send you a password reset link")).toBeVisible();
    });
  });

  test.describe('Input Clearing', () => {
    test('should be able to clear and re-enter text in sign in form', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.getByPlaceholder('you@example.com');
      
      await emailInput.fill('first@example.com');
      await expect(emailInput).toHaveValue('first@example.com');
      
      await emailInput.clear();
      await expect(emailInput).toHaveValue('');
      
      await emailInput.fill('second@example.com');
      await expect(emailInput).toHaveValue('second@example.com');
    });

    test('should be able to clear and re-enter text in sign up form', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Sign up' }).click();
      
      const nameInput = page.getByPlaceholder('John Doe');
      
      await nameInput.fill('First Name');
      await expect(nameInput).toHaveValue('First Name');
      
      await nameInput.clear();
      await expect(nameInput).toHaveValue('');
      
      await nameInput.fill('Second Name');
      await expect(nameInput).toHaveValue('Second Name');
    });
  });

  test.describe('Special Characters', () => {
    test('should handle special characters in email', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.getByPlaceholder('you@example.com');
      
      // Email with plus sign (common for email aliases)
      await emailInput.fill('user+test@example.com');
      await expect(emailInput).toHaveValue('user+test@example.com');
    });

    test('should handle special characters in name', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Sign up' }).click();
      
      const nameInput = page.getByPlaceholder('John Doe');
      
      // Name with apostrophe
      await nameInput.fill("O'Connor");
      await expect(nameInput).toHaveValue("O'Connor");
      
      // Name with hyphen
      await nameInput.fill('Mary-Jane');
      await expect(nameInput).toHaveValue('Mary-Jane');
    });

    test('should handle special characters in password', async ({ page }) => {
      await page.goto('/');
      
      const passwordInput = page.getByPlaceholder('••••••••');
      
      // Password with special characters
      await passwordInput.fill('P@ssw0rd!#$%');
      await expect(passwordInput).toHaveValue('P@ssw0rd!#$%');
    });
  });
});
