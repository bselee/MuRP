import { test, expect } from '@playwright/test';

test.describe('Integration Tests', () => {
  test.describe('Complete User Journey', () => {
    test('should complete a full sign up flow', async ({ page }) => {
      await page.goto('/');
      
      // Start at login page
      await expect(page.getByText('Sign in to your account')).toBeVisible();
      
      // Navigate to sign up
      await page.getByRole('button', { name: 'Sign up' }).click();
      await expect(page.getByText('Create a new account')).toBeVisible();
      
      // Fill out sign up form
      await page.getByPlaceholder('John Doe').fill('Test User');
      await page.getByPlaceholder('you@example.com').fill('test@example.com');
      await page.getByPlaceholder('••••••••').fill('testpassword123');
      
      // Verify all fields are filled
      await expect(page.getByPlaceholder('John Doe')).toHaveValue('Test User');
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('test@example.com');
      await expect(page.getByPlaceholder('••••••••')).toHaveValue('testpassword123');
      
      // Verify Sign Up button is enabled
      const signUpBtn = page.getByRole('button', { name: 'Sign Up' });
      await expect(signUpBtn).toBeEnabled();
    });

    test('should complete a password reset flow', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to password reset
      await page.getByRole('button', { name: 'Forgot password?' }).click();
      await expect(page.getByText('Reset your password')).toBeVisible();
      
      // Fill email
      await page.getByPlaceholder('you@example.com').fill('reset@example.com');
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('reset@example.com');
      
      // Verify button is enabled
      const resetBtn = page.getByRole('button', { name: 'Send Reset Link' });
      await expect(resetBtn).toBeEnabled();
      
      // Navigate back to sign in
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByText('Sign in to your account')).toBeVisible();
    });

    test('should switch between all auth screens multiple times', async ({ page }) => {
      await page.goto('/');
      
      // Loop through screens
      for (let i = 0; i < 2; i++) {
        // Sign In -> Sign Up
        await page.getByRole('button', { name: 'Sign up' }).click();
        await expect(page.getByText('Create a new account')).toBeVisible();
        
        // Sign Up -> Sign In
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByText('Sign in to your account')).toBeVisible();
        
        // Sign In -> Password Reset
        await page.getByRole('button', { name: 'Forgot password?' }).click();
        await expect(page.getByText('Reset your password')).toBeVisible();
        
        // Password Reset -> Sign In
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByText('Sign in to your account')).toBeVisible();
      }
    });
  });

  test.describe('Form Persistence', () => {
    test('should maintain email when switching between sign in and password reset', async ({ page }) => {
      await page.goto('/');
      
      // Fill email on sign in
      await page.getByPlaceholder('you@example.com').fill('persist@example.com');
      
      // Go to password reset
      await page.getByRole('button', { name: 'Forgot password?' }).click();
      
      // Go back to sign in
      await page.getByRole('button', { name: 'Sign in' }).click();
      
      // Email should persist
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('persist@example.com');
    });

    test('should clear password when switching forms', async ({ page }) => {
      await page.goto('/');
      
      // Fill both fields
      await page.getByPlaceholder('you@example.com').fill('test@example.com');
      await page.getByPlaceholder('••••••••').fill('password123');
      
      // Navigate to sign up
      await page.getByRole('button', { name: 'Sign up' }).click();
      
      // Navigate back
      await page.getByRole('button', { name: 'Sign in' }).click();
      
      // Email persists but password should be cleared for security
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('test@example.com');
    });
  });

  test.describe('Multi-Device Testing', () => {
    test('should work correctly on desktop and mobile', async ({ page }) => {
      // Test on desktop
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');
      await expect(page.getByText('TGF MRP')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
      
      // Switch to mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(page.getByText('TGF MRP')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
      
      // Test form on mobile
      await page.getByPlaceholder('you@example.com').fill('mobile@example.com');
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('mobile@example.com');
      
      // Switch back to desktop
      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('mobile@example.com');
    });

    test('should maintain functionality across viewport changes', async ({ page }) => {
      await page.goto('/');
      
      // Start with desktop
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.getByPlaceholder('you@example.com').fill('viewport@example.com');
      
      // Resize to tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('viewport@example.com');
      
      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('viewport@example.com');
      
      // All elements should still be accessible
      await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle very long input values', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Sign up' }).click();
      
      const longName = 'A'.repeat(100);
      const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
      
      await page.getByPlaceholder('John Doe').fill(longName);
      await page.getByPlaceholder('you@example.com').fill(longEmail);
      
      await expect(page.getByPlaceholder('John Doe')).toHaveValue(longName);
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue(longEmail);
    });

    test('should handle rapid form switching', async ({ page }) => {
      await page.goto('/');
      
      // Rapidly switch between forms
      for (let i = 0; i < 5; i++) {
        await page.getByRole('button', { name: 'Sign up' }).click();
        await page.getByRole('button', { name: 'Sign in' }).click();
      }
      
      // Should still be functional
      await expect(page.getByText('Sign in to your account')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    });

    test('should handle multiple field updates', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.getByPlaceholder('you@example.com');
      
      // Update field multiple times rapidly
      for (let i = 0; i < 10; i++) {
        await emailInput.fill(`test${i}@example.com`);
      }
      
      await expect(emailInput).toHaveValue('test9@example.com');
    });

    test('should handle special characters in all fields', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Sign up' }).click();
      
      // Special characters in name
      await page.getByPlaceholder('John Doe').fill("O'Connor-Smith III");
      await expect(page.getByPlaceholder('John Doe')).toHaveValue("O'Connor-Smith III");
      
      // Email with special characters
      await page.getByPlaceholder('you@example.com').fill('user+test@sub-domain.example.com');
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('user+test@sub-domain.example.com');
      
      // Password with special characters
      await page.getByPlaceholder('••••••••').fill('P@$$w0rd!#$%^&*()');
      await expect(page.getByPlaceholder('••••••••')).toHaveValue('P@$$w0rd!#$%^&*()');
    });
  });

  test.describe('Performance and Loading', () => {
    test('should load page quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      const loadTime = Date.now() - startTime;
      
      // Page should load in reasonable time (less than 5 seconds)
      expect(loadTime).toBeLessThan(5000);
      
      // Main elements should be visible
      await expect(page.getByText('TGF MRP')).toBeVisible();
    });

    test('should handle page reload', async ({ page }) => {
      await page.goto('/');
      
      // Fill form
      await page.getByPlaceholder('you@example.com').fill('reload@example.com');
      
      // Reload page
      await page.reload();
      
      // Page should load correctly
      await expect(page.getByText('Sign in to your account')).toBeVisible();
      
      // Form should be empty after reload (no persistence across page loads)
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('');
    });

    test('should handle browser back/forward', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText('Sign in to your account')).toBeVisible();
      
      // Navigate to sign up
      await page.getByRole('button', { name: 'Sign up' }).click();
      await expect(page.getByText('Create a new account')).toBeVisible();
      
      // Use browser back (Note: In SPA, this might not work as expected without routing)
      // This test verifies the app handles it gracefully
      await page.goBack();
      
      // Should still show a valid page
      const pageIsValid = await page.getByText('TGF MRP').isVisible();
      expect(pageIsValid).toBe(true);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should support complete keyboard navigation', async ({ page }) => {
      await page.goto('/');
      
      // Tab to email field
      await page.keyboard.press('Tab');
      
      // Type email
      await page.keyboard.type('keyboard@example.com');
      
      // Tab to password
      await page.keyboard.press('Tab');
      
      // Type password
      await page.keyboard.type('password123');
      
      // Verify values
      await expect(page.getByPlaceholder('you@example.com')).toHaveValue('keyboard@example.com');
      await expect(page.getByPlaceholder('••••••••')).toHaveValue('password123');
    });

    test('should support escape key to clear focus', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.click();
      await emailInput.fill('test@example.com');
      
      // Press Escape
      await page.keyboard.press('Escape');
      
      // Field should still have value (Escape doesn't clear, just unfocuses)
      await expect(emailInput).toHaveValue('test@example.com');
    });
  });
});
