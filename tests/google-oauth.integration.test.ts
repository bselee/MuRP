/**
 * Google OAuth Integration Tests
 * 
 * Tests the complete OAuth flow including PKCE, token management, and API calls
 */

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'testpassword123';

test.describe('Google OAuth Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:3000');
  });

  test('should load auth service without errors', async ({ page }) => {
    // Check that Google auth service initializes
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    // Should not have critical errors about Google auth
    const authErrors = errors.filter(e => 
      e.includes('GoogleAuthService') || 
      e.includes('GOOGLE_CLIENT_ID')
    );

    expect(authErrors.length).toBe(0);
  });

  test('should have Google OAuth scopes configured', async ({ page }) => {
    // Execute in browser context to check scopes
    const scopes = await page.evaluate(() => {
      // Import scopes from the module
      return new Promise((resolve) => {
        import('./lib/google/scopes.js').then(module => {
          resolve({
            hasDefaultScopes: Array.isArray(module.DEFAULT_SCOPES),
            scopeCount: module.DEFAULT_SCOPES?.length || 0,
            hasGoogleScopes: typeof module.GOOGLE_SCOPES === 'object',
          });
        }).catch(() => {
          resolve({ error: 'Failed to load scopes' });
        });
      });
    });

    expect(scopes).toHaveProperty('hasDefaultScopes', true);
    expect(scopes).toHaveProperty('scopeCount');
    expect((scopes as any).scopeCount).toBeGreaterThan(0);
  });

  test('should not expose client_secret in browser bundle', async ({ page }) => {
    // Check all script tags for client_secret
    const scripts = await page.$$eval('script[src]', (scripts) => 
      scripts.map(s => (s as HTMLScriptElement).src)
    );

    for (const scriptSrc of scripts) {
      if (scriptSrc.startsWith('http')) {
        const response = await page.request.get(scriptSrc);
        const content = await response.text();
        
        expect(content).not.toContain('GOOGLE_CLIENT_SECRET');
        expect(content).not.toContain('client_secret');
      }
    }
  });

  test('should handle PKCE generation', async ({ page }) => {
    const pkce = await page.evaluate(() => {
      return new Promise(async (resolve) => {
        try {
          const { generateCodeVerifier, generateCodeChallenge } = await import('./lib/google/pkce.js');
          
          const verifier = generateCodeVerifier();
          const challenge = await generateCodeChallenge(verifier);
          
          resolve({
            hasVerifier: typeof verifier === 'string',
            verifierLength: verifier.length,
            hasChallenge: typeof challenge === 'string',
            challengeLength: challenge.length,
          });
        } catch (error) {
          resolve({ error: (error as Error).message });
        }
      });
    });

    expect(pkce).toHaveProperty('hasVerifier', true);
    expect(pkce).toHaveProperty('hasChallenge', true);
    expect((pkce as any).verifierLength).toBeGreaterThan(20);
    expect((pkce as any).challengeLength).toBeGreaterThan(20);
  });
});

test.describe('Google API Token Proxy', () => {
  test('should return 401 for unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/google-token', {
      data: { action: 'status' },
    });

    expect(response.status()).toBe(401);
  });

  test('should validate action parameter', async ({ request, page }) => {
    // Login first to get auth token
    await page.goto('http://localhost:3000');
    
    // Attempt to login (will fail with test creds, but we can check error handling)
    const response = await request.post('/api/google-token', {
      headers: {
        'Authorization': 'Bearer fake-token',
      },
      data: { action: 'invalid_action' },
    });

    // Should reject invalid action
    expect([400, 401]).toContain(response.status());
  });
});

test.describe('Google Sheets Service', () => {
  test('should have sheets service methods', async ({ page }) => {
    const hasService = await page.evaluate(() => {
      return new Promise(async (resolve) => {
        try {
          const { getGoogleSheetsService } = await import('./services/googleSheetsService.js');
          const service = getGoogleSheetsService();
          
          resolve({
            hasReadSheet: typeof service.readSheet === 'function',
            hasWriteSheet: typeof service.writeSheet === 'function',
            hasCreateSpreadsheet: typeof service.createSpreadsheet === 'function',
            hasAppendSheet: typeof service.appendSheet === 'function',
          });
        } catch (error) {
          resolve({ error: (error as Error).message });
        }
      });
    });

    expect(hasService).toHaveProperty('hasReadSheet', true);
    expect(hasService).toHaveProperty('hasWriteSheet', true);
    expect(hasService).toHaveProperty('hasCreateSpreadsheet', true);
  });
});

test.describe('SPA Routing', () => {
  test('should serve index.html for /reset-password', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/reset-password');
    
    expect(response?.status()).toBe(200);
    
    // Should load the React app
    await expect(page.locator('body')).toBeVisible();
    
    // Should not show Vercel 404
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('NOT_FOUND');
  });

  test('should serve index.html for /auth/callback', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/auth/callback');
    
    expect(response?.status()).toBe(200);
    
    // Should load the React app
    await expect(page.locator('body')).toBeVisible();
  });

  test('should still serve API routes from filesystem', async ({ request }) => {
    // API routes should be handled by filesystem first
    const response = await request.post('/api/google-token', {
      data: { action: 'status' },
    });

    // Should get API response (401 for no auth), not index.html
    expect(response.status()).toBe(401);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });

  test('should serve static assets normally', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Check that JS and CSS load
    const scripts = await page.$$eval('script[src]', (scripts) => 
      scripts.map(s => (s as HTMLScriptElement).src)
    );
    
    expect(scripts.length).toBeGreaterThan(0);
    
    // All scripts should load successfully
    for (const scriptSrc of scripts) {
      if (scriptSrc.startsWith('http://localhost:3000')) {
        const response = await page.request.get(scriptSrc);
        expect(response.status()).toBe(200);
      }
    }
  });
});

test.describe('Security Checks', () => {
  test('should not expose sensitive env vars in browser', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    const envVars = await page.evaluate(() => {
      return {
        hasClientSecret: typeof (import.meta.env as any).GOOGLE_CLIENT_SECRET !== 'undefined',
        hasServiceKey: typeof (import.meta.env as any).SUPABASE_SERVICE_ROLE_KEY !== 'undefined',
        hasClientId: typeof (import.meta.env as any).VITE_GOOGLE_CLIENT_ID !== 'undefined',
      };
    });

    // Should NOT have server-only secrets
    expect(envVars.hasClientSecret).toBe(false);
    expect(envVars.hasServiceKey).toBe(false);
    
    // Should have client-safe vars
    expect(envVars.hasClientId).toBe(true);
  });

  test('should use HTTPS for Google API calls in production', async ({ page }) => {
    // Mock Google API call
    const apiCalls: string[] = [];
    
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('googleapis.com') || url.includes('google.com')) {
        apiCalls.push(url);
      }
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // All Google API calls should use HTTPS
    apiCalls.forEach(url => {
      expect(url).toMatch(/^https:\/\//);
    });
  });
});
