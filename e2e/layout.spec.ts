import { expect, test } from '@playwright/test';
import { addRecipeToPlan, completeRecipeIds, enter, waitForCard } from './helpers';

test('no horizontal overflow on any screen', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await addRecipeToPlan(page, r.id);
  await page.goto('./#/');
  await page.getByTestId('view-toggle').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'overflow in list view').toBeLessThanOrEqual(0);
  await page.getByTestId('view-toggle').click();
  for (const route of ['', 'cookbook', 'plan', 'shop', 'shop/mode', 'pantry', 'import', 'settings', `recipe/${r.id}`, `recipe/${r.id}/cook`]) {
    await page.goto(`./#/${route}`);
    await page.waitForTimeout(500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `overflow on /${route}`).toBeLessThanOrEqual(0);
  }
});
