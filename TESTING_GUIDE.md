# TGF-MRP Testing Guide

This guide provides instructions for running and understanding the comprehensive Playwright test suite for TGF-MRP.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Install Playwright Browsers (First time only)
```bash
npx playwright install --with-deps chromium
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Run Tests (in a separate terminal)
```bash
npm test
```

## Available Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests in headless mode |
| `npm run test:headed` | Run tests with browser UI visible |
| `npm run test:ui` | Open Playwright's interactive test UI |
| `npm run test:report` | View HTML report of last test run |

## Advanced Test Commands

### Run Specific Test File
```bash
npx playwright test tests/login.spec.ts
```

### Run Tests in Debug Mode
```bash
npx playwright test --debug
```

### Run Tests with Specific Browser
```bash
npx playwright test --project=chromium
```

### Run Only Failed Tests
```bash
npx playwright test --last-failed
```

### Update Snapshots (if using visual regression)
```bash
npx playwright test --update-snapshots
```

## Test Structure

```
TGF-MRP/
├── tests/
│   ├── README.md              # Detailed test documentation
│   ├── login.spec.ts          # Login page tests
│   ├── signup.spec.ts         # Sign up page tests
│   ├── password-reset.spec.ts # Password reset tests
│   ├── auth-navigation.spec.ts # Navigation tests
│   ├── ui-elements.spec.ts    # UI component tests
│   ├── responsive.spec.ts     # Responsive design tests
│   ├── accessibility.spec.ts  # Accessibility tests
│   ├── form-validation.spec.ts # Form validation tests
│   └── integration.spec.ts    # Integration tests
├── playwright.config.ts       # Playwright configuration
├── TEST_RESULTS.md           # Test results documentation
└── TESTING_GUIDE.md          # This file
```

## What Gets Tested

### 1. Authentication Flows ✅
- Login page display and functionality
- Sign up process with all fields
- Password reset workflow
- Navigation between auth screens
- Form state persistence

### 2. UI/UX Elements ✅
- Dark theme consistency
- Layout and centering
- Button states and interactions
- Input field placeholders and labels
- Typography and colors
- Logo and branding

### 3. Responsive Design ✅
- **Desktop**: 1920x1080, 1366x768
- **Tablet**: 768x1024
- **Mobile**: 375x667, 414x896, 360x640, 320x480
- Element sizing and spacing
- Form usability on small screens

### 4. Accessibility ✅
- Screen reader compatibility
- Keyboard navigation
- Focus management
- Tab order
- ARIA labels and roles
- Color contrast

### 5. Form Validation ✅
- Email format validation
- Password requirements
- Special character handling
- Unicode support
- Long input handling
- Field clearing and re-entry

### 6. Integration Scenarios ✅
- Complete user journeys
- Multi-screen navigation
- Form data persistence
- Viewport changes
- Edge cases and error handling
- Performance checks

## Understanding Test Results

### Successful Test Run
```
Running 100+ tests using 1 worker
  ✓ tests/login.spec.ts (12 tests)
  ✓ tests/signup.spec.ts (8 tests)
  ✓ tests/password-reset.spec.ts (6 tests)
  ...
  
100 passed (2m)
```

### Failed Test
If a test fails, you'll see:
```
  ✗ tests/login.spec.ts:10:1 › should display login form
    Error: Timed out 30000ms waiting for expect(locator).toBeVisible()
```

To debug:
1. Check the screenshot in `test-results/`
2. Run with `--headed` to see what's happening
3. Use `--debug` to step through the test

## Test Reports

After running tests, view the HTML report:
```bash
npm run test:report
```

The report shows:
- Test pass/fail status
- Execution time
- Screenshots of failures
- Videos of test runs (on failure)
- Traces for debugging

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Playwright Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps chromium
      
      - name: Run Playwright tests
        run: npm test
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Environment Configuration

Tests use `.env.local` with test values:
```env
VITE_SUPABASE_URL=https://test-project.supabase.co
VITE_SUPABASE_ANON_KEY=test_anon_key_for_playwright_testing
```

⚠️ **Note**: These are mock values for testing. Real Supabase integration would require actual credentials.

## Common Issues and Solutions

### Issue: "Chromium not installed"
**Solution**: Run `npx playwright install --with-deps chromium`

### Issue: "Port 3001 already in use"
**Solution**: 
1. Stop other processes using the port
2. Or update `playwright.config.ts` to use a different port

### Issue: "Tests timeout"
**Solution**: 
1. Increase timeout in `playwright.config.ts`
2. Check if dev server is running
3. Verify network connectivity

### Issue: "Cannot find module"
**Solution**: Run `npm install` to ensure all dependencies are installed

### Issue: "Tests fail in CI but pass locally"
**Solution**: 
1. Check browser versions match
2. Ensure environment variables are set in CI
3. Verify network access in CI environment

## Writing New Tests

### Basic Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should do something', async ({ page }) => {
    // Arrange - Set up test data
    const button = page.getByRole('button', { name: 'Click Me' });
    
    // Act - Perform action
    await button.click();
    
    // Assert - Verify outcome
    await expect(page.getByText('Success!')).toBeVisible();
  });
});
```

### Best Practices

1. **Use semantic selectors**: Prefer `getByRole`, `getByText`, `getByLabel` over CSS selectors
2. **Wait for elements**: Playwright auto-waits, but be explicit when needed
3. **Independent tests**: Each test should work in isolation
4. **Descriptive names**: Test names should describe what they test
5. **Clear assertions**: Use specific assertions for better error messages
6. **Screenshot failures**: Playwright does this automatically
7. **Group related tests**: Use `test.describe()` to organize tests

## Performance Testing

To measure page load performance:

```typescript
test('should load quickly', async ({ page }) => {
  const startTime = Date.now();
  await page.goto('/');
  const loadTime = Date.now() - startTime;
  
  expect(loadTime).toBeLessThan(3000); // 3 seconds
});
```

## Visual Regression Testing

To add visual regression tests (future enhancement):

```typescript
test('should match screenshot', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('login-page.png');
});
```

## Debugging Tips

### 1. Use Playwright Inspector
```bash
npx playwright test --debug
```

### 2. Add console.log in tests
```typescript
test('debug test', async ({ page }) => {
  const text = await page.textContent('h1');
  console.log('Heading text:', text);
});
```

### 3. Pause test execution
```typescript
test('pause test', async ({ page }) => {
  await page.goto('/');
  await page.pause(); // Test will pause here
});
```

### 4. Take screenshots manually
```typescript
test('manual screenshot', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'debug.png' });
});
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Test Assertions](https://playwright.dev/docs/test-assertions)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Debugging Guide](https://playwright.dev/docs/debug)

## Support

For issues or questions about the test suite:
1. Check `tests/README.md` for detailed documentation
2. Review `TEST_RESULTS.md` for test coverage details
3. See Playwright documentation for framework-specific questions
4. Check test files for examples of testing patterns

## Contributing

When adding new tests:
1. Follow existing test structure and naming conventions
2. Add tests to appropriate spec file or create new one
3. Update `tests/README.md` with new coverage
4. Ensure tests pass locally before committing
5. Add documentation for complex test scenarios

---

**Last Updated**: October 2024
**Test Framework**: Playwright v1.56.1
**Total Tests**: 100+
**Test Coverage**: Authentication, UI/UX, Responsive Design, Accessibility, Form Validation, Integration
