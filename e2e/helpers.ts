import { expect, type Page } from '@playwright/test';
import { TEST_HASH } from '../playwright.config';

/** Skip the splash and gate for tests about other features. */
export async function enter(page: Page, route = '') {
  await page.addInitScript((hash) => {
    localStorage.setItem('lb-unlocked', hash);
    sessionStorage.setItem('lb-splash-seen', '1');
  }, TEST_HASH);
  await page.goto(`./#/${route}`);
}

export async function waitForCard(page: Page) {
  await expect(page.getByTestId('swipe-card')).toBeVisible();
  return (await page.getByTestId('swipe-card').getByTestId('card-title').textContent())!.trim();
}

export async function dragCard(page: Page, dx: number) {
  const box = (await page.getByTestId('swipe-card').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x + (dx * i) / 8, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

/** Find recipes with real pricing from the catalogue directly. */
export async function completeRecipeIds(page: Page, n: number, need?: string) {
  return page.evaluate(async ({ n, need }) => {
    const res = await fetch('data/recipes-index.json');
    const all = (await res.json()) as { id: string; title: string; completeness: string; valueCents: number | null; ingredientIds: string[]; servings: number }[];
    return all.filter((r) => r.completeness === 'complete' && r.valueCents != null && (!need || r.ingredientIds.includes(need))).slice(0, n);
  }, { n, need });
}

export async function addRecipeToPlan(page: Page, id: string) {
  await page.goto(`./#/recipe/${id}`);
  await page.getByTestId('add-to-plan').click();
  await page.getByTestId('confirm-add-plan').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function addPantry(page: Page, name: string, qty: string, unit: 'g' | 'ml' | 'each') {
  await page.goto('./#/pantry');
  await page.getByTestId('add-pantry').click();
  await page.getByTestId('pantry-name').fill(name);
  await page.getByTestId('pantry-suggestion').first().click();
  await page.getByTestId('pantry-qty').fill(qty);
  await page.getByTestId('pantry-unit').selectOption(unit);
  await page.getByTestId('save-pantry').click();
  await expect(page.getByTestId('pantry-item').first()).toBeVisible();
}
