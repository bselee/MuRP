# TGF-MRP Playwright Test Suite

This directory contains comprehensive end-to-end tests for the TGF-MRP application using Playwright.

## Test Coverage

### Authentication Tests
- **login.spec.ts** - Tests for the login page functionality
  - Login form display and validation
  - Input field functionality
  - Button interactions
  - Page title and branding

- **signup.spec.ts** - Tests for the sign-up page functionality
  - Sign-up form display
  - All input fields (name, email, password)
  - Form validation requirements
  - Navigation between auth screens

- **password-reset.spec.ts** - Tests for password reset functionality
  - Password reset form display
  - Email input validation
  - Helper text and instructions
  - Navigation back to sign in

- **auth-navigation.spec.ts** - Tests for navigation between authentication screens
  - Sign in to sign up navigation
  - Sign in to password reset navigation
  - State preservation during navigation
  - Logo and branding consistency

### UI/UX Tests
- **ui-elements.spec.ts** - Tests for UI elements and styling
  - Dark theme verification
  - Layout and centering
  - Button states and visibility
  - Input placeholders and labels
  - Color contrast and typography
  - Form structure

- **responsive.spec.ts** - Tests for responsive design
  - Desktop layouts (1920x1080, 1366x768)
  - Tablet layouts (768x1024)
  - Mobile layouts (375x667, 414x896, 360x640)
  - Form responsiveness on different screens
  - Button and input sizing on mobile

- **accessibility.spec.ts** - Tests for accessibility features
  - Page title for screen readers
  - Heading hierarchy
  - Form labels and associations
  - Keyboard navigation
  - Focus management
  - Tab order
  - Alt text for images
  - Color contrast

### Form Validation Tests
- **form-validation.spec.ts** - Tests for form validation
  - Input type validation
  - Email format validation
  - Password requirements
  - Special character handling
  - Input clearing and re-entry
  - Field constraints

## Running the Tests

### Prerequisites
1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure the development server is running:
   ```bash
   npm run dev
   ```

### Run All Tests
```bash
npm test
```

### Run Tests in Headed Mode (with browser UI)
```bash
npm run test:headed
```

### Run Tests with Playwright UI
```bash
npm run test:ui
```

### View Test Report
```bash
npm run test:report
```

### Run Specific Test File
```bash
npx playwright test tests/login.spec.ts
```

### Run Tests in Debug Mode
```bash
npx playwright test --debug
```

## Test Structure

Each test file follows this structure:
- `test.describe()` - Groups related tests
- `test.beforeEach()` - Setup before each test
- `test()` - Individual test cases
- `expect()` - Assertions

## Configuration

Tests are configured in `playwright.config.ts`:
- Base URL: `http://localhost:3001`
- Browser: Chromium (Desktop Chrome)
- Timeout: 120 seconds for server startup
- Screenshots: Captured on failure
- Videos: Retained on failure
- Reports: HTML report and list format

## Test Results

Test results are stored in:
- `test-results/` - Test execution artifacts
- `playwright-report/` - HTML test report

These directories are gitignored to avoid committing test artifacts.

## Environment Setup

Tests use mock environment variables defined in `.env.local`:
```
VITE_SUPABASE_URL=https://test-project.supabase.co
VITE_SUPABASE_ANON_KEY=test_anon_key_for_playwright_testing
```

Note: These are test values only and do not connect to a real Supabase instance.

## Test Statistics

- **Total Test Files**: 7
- **Total Test Cases**: 80+
- **Coverage Areas**: 
  - Authentication (Login, Sign Up, Password Reset)
  - Navigation
  - UI/UX
  - Accessibility
  - Responsive Design
  - Form Validation

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:
```yaml
- name: Install dependencies
  run: npm ci
  
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
  
- name: Run Playwright tests
  run: npm test
  
- name: Upload test report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Best Practices

1. **Isolation**: Each test is independent and doesn't rely on others
2. **Cleanup**: Tests clean up after themselves
3. **Assertions**: Use explicit assertions for better error messages
4. **Selectors**: Use semantic selectors (role, text) over CSS selectors
5. **Waits**: Use Playwright's auto-waiting instead of manual timeouts
6. **Screenshots**: Captured automatically on test failures

## Troubleshooting

### Server Not Running
If tests fail with connection errors, ensure the dev server is running:
```bash
npm run dev
```

### Port Conflicts
If port 3001 is in use, update `playwright.config.ts` with a different port.

### Browser Installation
If Chromium is not installed:
```bash
npx playwright install chromium
```

## Future Enhancements

Potential areas for expanding test coverage:
- Dashboard page tests (requires authentication bypass)
- Inventory management tests
- Purchase order tests
- BOMs and production tests
- API integration tests
- Performance tests
- Visual regression tests

## Contributing

When adding new tests:
1. Create a descriptive test file name (e.g., `feature-name.spec.ts`)
2. Group related tests with `test.describe()`
3. Use descriptive test names
4. Add comments for complex test logic
5. Update this README with new test coverage
