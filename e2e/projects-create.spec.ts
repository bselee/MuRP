import { test, expect, Locator } from '@playwright/test';

const withE2EParam = (path: string) => {
  const hasQuery = path.includes('?');
  return `${path}${hasQuery ? '&' : '?'}e2e=1`;
};

const selectFirstAvailableOption = async (select: Locator): Promise<string> => {
  const options = select.locator('option');
  const count = await options.count();
  for (let idx = 0; idx < count; idx += 1) {
    const value = await options.nth(idx).getAttribute('value');
    if (value) {
      await select.selectOption(value);
      return value;
    }
  }
  throw new Error('No selectable options found for required field');
};

test.describe('Project creation guardrails', () => {
  test('requires explicit delegate and schedule before enabling submission', async ({ page }) => {
    await page.goto(withE2EParam('/projects'));
    await page.getByRole('button', { name: /New Project/i }).click();
    const modalHeading = page.getByRole('heading', { name: /Create Project/i });
    await expect(modalHeading).toBeVisible();
    const modal = modalHeading.locator('..');

    await page.getByLabel('Project Name').fill('Playwright Validation Project');

    const ownerSelect = page.getByLabel('Project Owner');
    await selectFirstAvailableOption(ownerSelect);

    const delegateSelect = page.getByLabel('Delegate / Delivery Lead');
    const delegateValue = await selectFirstAvailableOption(delegateSelect);

    const createButton = modal.getByRole('button', { name: /^Create Project$/ });
    await expect(createButton).toBeEnabled();

    await delegateSelect.selectOption('');
    await expect(createButton).toBeDisabled();

    await delegateSelect.selectOption(delegateValue);
    await expect(createButton).toBeEnabled();
  });
});
