import { expect, test } from '@playwright/test';
import { addRecipeToPlan, completeRecipeIds, enter, waitForCard } from './helpers';

const RECIPE_URL = 'https://recipes.example.com/sticky-chicken';
const PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Sticky Chicken',
  image: 'https://recipes.example.com/sticky.jpg',
  recipeYield: '4',
  totalTime: 'PT40M',
  recipeIngredient: ['1 lb chicken thighs', '1/2 cup soy sauce', '2 tbsp honey'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Heat the oven to 400°F.' }, { '@type': 'HowToStep', text: 'Roast for 25 minutes.' }],
})}</script></head><body></body></html>`;

test('Import tab brings in a recipe from a link, in metric, with its photo', async ({ page }) => {
  // The site blocks direct reads, so the reader service is used.
  await page.route(RECIPE_URL, (route) => route.abort());
  await page.route(`https://r.jina.ai/${RECIPE_URL}`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE, headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://recipes.example.com/sticky.jpg', (route) => route.fulfill({ status: 404 }));
  await enter(page);
  await page.getByRole('link', { name: 'Import' }).click();
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await page.getByTestId('import-link').click();
  await expect(page.getByTestId('recipe-title')).toHaveText('Sticky Chicken');
  await expect(page.getByText('Heat the oven to 200°C.')).toBeVisible();
  await expect(page.getByText(/°F|\blb\b|cup/)).toHaveCount(0);
  await page.goto('./#/cookbook');
  await expect(page.getByTestId('cookbook-item')).toContainText('Sticky Chicken');
  // The same link again opens the existing copy rather than duplicating it.
  await page.goto('./#/import');
  await page.getByTestId('import-url').fill(RECIPE_URL);
  await page.getByTestId('import-link').click();
  await expect(page.getByTestId('recipe-title')).toHaveText('Sticky Chicken');
});

test('when a site refuses, pasted text imports instead', async ({ page }) => {
  await page.route('https://blocked.example.com/**', (route) => route.abort());
  await page.route('https://r.jina.ai/**', (route) => route.fulfill({ status: 451, body: 'blocked', headers: { 'access-control-allow-origin': '*' } }));
  await enter(page, 'import');
  await page.getByTestId('import-url').fill('https://blocked.example.com/lamb');
  await page.getByTestId('import-link').click();
  await expect(page.getByTestId('import-failed')).toBeVisible();
  await page.getByTestId('import-paste').fill('Slow lamb shoulder\nIngredients\n2 lb lamb shoulder\n1 cup red wine\nMethod\n1. Roast at 300°F for 4 hours.');
  await page.getByTestId('import-paste-save').click();
  await expect(page.getByTestId('recipe-title')).toHaveText('Slow lamb shoulder');
  await expect(page.getByText('Roast at 150°C for 4 hours.')).toBeVisible();
});

test('list view has a meal type dropdown above search', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  await expect(page.getByTestId('list-meal-type')).toHaveCount(0);
  await page.getByTestId('view-toggle').click();
  const select = page.getByTestId('list-meal-type');
  const selectBox = (await select.boundingBox())!;
  const searchBox = (await page.getByLabel('Search recipes').boundingBox())!;
  expect(selectBox.y).toBeLessThan(searchBox.y);
  await select.selectOption('dessert');
  const first = page.getByTestId('discover-row').first();
  await first.getByRole('link').click();
  await expect(page.getByTestId('recipe-title')).toBeVisible();
});

test('bottom nav is a fixed bar flush with the bottom of the screen', async ({ page }) => {
  await enter(page, 'cookbook');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const box = (await nav.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(vp.width);
  expect(Math.round(box.y + box.height)).toBe(vp.height);
  await expect(nav.getByRole('link')).toHaveCount(6);
});

test('finishing a shop adds what was ticked to the pantry automatically', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await addRecipeToPlan(page, r.id);
  await page.goto('./#/shop');
  const row = page.getByTestId('shop-row').filter({ has: page.getByText('Onion', { exact: true }) });
  await row.getByRole('checkbox').click();
  await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('complete-shop').click();
  await expect(page).toHaveURL(/#\/pantry/);
  await expect(page.getByText(/added to your pantry/)).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Onion');
});

test('staples are labelled, can be added to the list, and show under Staples', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const id = await page.evaluate(async () => {
    const all = (await (await fetch('data/recipes-index.json')).json()) as { id: string; completeness: string; ingredientIds: string[]; valueCents: number | null }[];
    return all.find((r) => r.completeness === 'complete' && r.valueCents != null && r.ingredientIds.includes('salt') && r.ingredientIds.includes('onion'))!.id;
  });
  await page.goto(`./#/recipe/${id}`);
  const salt = page.getByTestId('ingredient').filter({ hasText: /salt/i }).first();
  await expect(salt).toContainText('Staple');
  await expect(page.getByText('At home', { exact: true })).toHaveCount(0);
  await page.getByTestId('add-to-list').click();
  await expect(page.getByText('Ingredients added to your list.')).toBeVisible();
  await page.goto('./#/shop');
  const staples = page.getByTestId('staples-section');
  await expect(staples).toContainText(/salt/i);
  await staples.getByRole('checkbox', { name: /Buy .*salt/i }).first().click();
  await expect(page.getByTestId('shop-row').filter({ hasText: /salt/i }).first()).toBeVisible();
  await page.goto(`./#/recipe/${id}`);
  await expect(salt).toContainText('On the list');
});

test('product picker shows photos and sorts by price', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await page.goto(`./#/recipe/${r.id}`);
  await page.getByTestId('ingredient').filter({ hasText: /onion/i }).first().getByRole('button').first().click();
  await expect(page.getByTestId('product-option').first()).toBeVisible();
  await expect(page.getByTestId('product-thumb').first()).toHaveAttribute('src', /assets\.woolworths\.com\.au\/images/);
  await page.getByLabel('Search all products').fill('pasta');
  await page.getByTestId('product-sort').selectOption('cheapest');
  const prices = await page.getByTestId('product-option').evaluateAll((els) => els.map((e) => parseFloat((e.textContent ?? '').match(/\$(\d+\.\d\d)/)?.[1] ?? 'NaN')));
  const clean = prices.filter((n) => !Number.isNaN(n));
  expect(clean.length).toBeGreaterThan(3);
  expect(clean).toEqual([...clean].sort((a, b) => a - b));
});

test('tortellini in a recipe matches tortellini, not spirals', async ({ page }) => {
  await enter(page);
  await page.goto('./#/recipe/new/edit');
  await page.getByLabel('Name').fill('Tortellini bake');
  await page.getByLabel('Ingredients, one per line').fill('600 g cheese tortellini\n500 g pasta spirals');
  await page.getByLabel('Step 1').fill('Cook.');
  await page.getByTestId('save-recipe-edit').click();
  const rows = page.getByTestId('ingredient');
  await expect(rows.filter({ hasText: 'Tortellini' })).toContainText(/tortellini/i);
  await expect(rows.filter({ hasText: 'Tortellini' })).not.toContainText(/spirals/i);
  await expect(rows.filter({ hasText: 'Spirals' })).toContainText(/spirals/i);
});

test('adding to the list, the plan and the cookbook can all be undone', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await page.goto(`./#/recipe/${r.id}`);
  await page.getByTestId('add-to-list').click();
  await expect(page.getByRole('button', { name: 'See list' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Taken back off the list.')).toBeVisible();
  expect(await page.evaluate(() => new Promise((res) => { const req = indexedDB.open('love-bites'); req.onsuccess = () => { const t = req.result.transaction('shopExtras').objectStore('shopExtras').count(); t.onsuccess = () => res(t.result); }; }))).toBe(0);

  await page.getByTestId('add-to-plan').click();
  await page.getByTestId('confirm-add-plan').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.goto('./#/plan');
  await expect(page.getByTestId('plan-meal')).toHaveCount(0);

  await page.goto(`./#/recipe/${r.id}`);
  await page.getByTestId('save-recipe').click();
  await expect(page.getByTestId('save-recipe')).toHaveText('In cookbook');
  await expect(page.getByTestId('cookbook-heart')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('save-recipe')).toHaveText('Save to cookbook');
  // Removing from the cookbook list is one tap on the heart, with undo.
  await page.getByTestId('cookbook-heart').click();
  await page.goto('./#/cookbook');
  await expect(page.getByTestId('cookbook-item')).toHaveCount(1);
  await page.getByTestId('cookbook-item').getByRole('button', { name: /^Remove .* from cookbook$/ }).click();
  await expect(page.getByTestId('cookbook-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('cookbook-item')).toHaveCount(1);
});

test('Back on a recipe opened directly goes to the cookbook', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  const fresh = await page.context().newPage();
  await fresh.goto(`./#/recipe/${r.id}`);
  await fresh.getByRole('button', { name: 'Back' }).click();
  await expect(fresh).toHaveURL(/#\/cookbook$/);
});
