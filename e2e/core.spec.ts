import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { TEST_CODE } from '../playwright.config';
import { addPantry, addRecipeToPlan, completeRecipeIds, dragCard, enter, waitForCard } from './helpers';

test('loads from the /love-bites/ subdirectory with assets resolving', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('localhost')) failed.push(r.url()); });
  await page.goto('./');
  await expect(page).toHaveTitle('Love Bites');
  await expect(page.getByLabel('Kitchen code')).toBeVisible({ timeout: 15000 });
  expect(page.url()).toContain('/love-bites/');
  expect(failed).toEqual([]);
});

test('deep links work', async ({ page }) => {
  await enter(page, 'pantry');
  await expect(page.getByRole('heading', { name: 'Pantry' })).toBeVisible();
});

test('splash shows the logo then leaves', async ({ page }) => {
  await page.goto('./');
  const splash = page.getByTestId('splash');
  await expect(splash).toBeVisible();
  await expect(splash.getByRole('img', { name: 'Love Bites' })).toBeVisible();
  await expect(splash).toHaveCount(0, { timeout: 5000 });
});

test('kitchen code gate: wrong code errors, right code unlocks and is remembered, lock works', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('lb-splash-seen', '1'));
  await page.goto('./');
  await page.getByLabel('Kitchen code').fill('wrong');
  await page.getByRole('button', { name: 'Let me in' }).click();
  await expect(page.getByRole('alert')).toContainText('kitchen code');
  await page.getByLabel('Show code').click();
  await expect(page.getByLabel('Kitchen code')).toHaveAttribute('type', 'text');
  await page.getByLabel('Kitchen code').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Let me in' }).click();
  await waitForCard(page);
  await page.reload();
  await waitForCard(page);
  await page.goto('./#/settings');
  await page.getByTestId('lock-app').click();
  await expect(page.getByLabel('Kitchen code')).toBeVisible();
});

test('Discover shows real recipes; swipes save, reject, undo, and persist', async ({ page }) => {
  await enter(page);
  const first = await waitForCard(page);
  expect(first.length).toBeGreaterThan(2);

  await dragCard(page, 260);
  await expect(page.getByTestId('saved-count')).toHaveText('1');
  const second = await waitForCard(page);
  expect(second).not.toBe(first);

  await dragCard(page, -260);
  await expect.poll(async () => waitForCard(page)).not.toBe(second);
  const third = await waitForCard(page);

  await page.getByRole('button', { name: 'Undo last swipe' }).click();
  await expect.poll(async () => waitForCard(page)).toBe(second);
  await page.getByRole('button', { name: 'Pass' }).click();
  await expect.poll(async () => waitForCard(page)).toBe(third);

  // Taste learning can reorder the deck, but swiped cards never come back.
  await page.reload();
  const afterReload = await waitForCard(page);
  expect([first, second]).not.toContain(afterReload);
  await expect(page.getByTestId('saved-count')).toHaveText('1');

  await page.goto('./#/cookbook');
  await expect(page.getByTestId('cookbook-item')).toHaveCount(1);
  await expect(page.getByTestId('cookbook-item')).toContainText(first);
});

test('the top card stays on top of the next card while dragging', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const box = (await page.getByTestId('swipe-card').boundingBox())!;
  const cx = box.x + box.width / 2;
  await page.mouse.move(cx, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(cx + 60, box.y + 60, { steps: 4 });
  await page.mouse.move(cx + 130, box.y + 60, { steps: 4 });
  // Sample across the card, where the back card's title would show through.
  const points = [0.25, 0.5, 0.75].flatMap((fx) => [100, 140, 180].map((dy) => [box.x + 130 + box.width * fx, box.y + dy]));
  const onTop = await page.evaluate((pts) => pts.every(([x, y]) => {
    const front = document.querySelector('[data-testid="swipe-card"]')!;
    const rect = front.getBoundingClientRect();
    const hit = document.elementFromPoint(x, y)!;
    const inside = x > rect.left + 40 && x < rect.right - 40;
    return !inside || front.contains(hit);
  }), points);
  await page.mouse.move(cx, box.y + 60, { steps: 4 });
  await page.mouse.up();
  expect(onTop).toBe(true);
});

test('list view browses recipes, saves from the list, and is remembered', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  await page.getByTestId('view-toggle').click();
  const rows = page.getByTestId('discover-row');
  await expect(rows).toHaveCount(30);
  await page.getByTestId('show-more').click();
  await expect(rows).toHaveCount(60);
  const title = (await rows.first().locator('p').first().textContent())!.trim();
  await rows.first().getByRole('button', { name: /^Love / }).click();
  await expect(page.getByTestId('saved-count')).toHaveText('1');
  await expect(rows.first()).not.toContainText(title);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('saved-count')).toHaveText('0');
  await expect(rows.first()).toContainText(title);
  await page.getByLabel('Search recipes').fill('chicken');
  await expect(rows.first()).toBeVisible();
  await page.reload();
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole('link').click();
  await expect(page.getByTestId('recipe-title')).toBeVisible();
});

test('keyboard swipes and tapping opens detail without changing swipe status', async ({ page }) => {
  await enter(page);
  const first = await waitForCard(page);
  await page.getByTestId('swipe-card').click();
  await expect(page.getByTestId('recipe-title')).toContainText(first);
  await page.goBack();
  expect(await waitForCard(page)).toBe(first);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('saved-count')).toHaveText('1');
});

test('filters narrow the deck and clear', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  await page.getByLabel('Search recipes').fill('zzzqqq');
  await expect(page.getByText('Nothing matches that.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await waitForCard(page);
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('Main ingredient').selectOption('chicken');
  await page.getByRole('button', { name: 'Full recipes only' }).click();
  await page.getByTestId('apply-filters').click();
  await page.getByTestId('swipe-card').click();
  await expect(page.getByTestId('ingredient').filter({ hasText: /chicken/i }).first()).toBeVisible();
});

test('recipe detail: servings scale, nothing stored changes, product matches show real prices', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await page.goto(`./#/recipe/${r.id}`);
  await expect(page.getByTestId('recipe-title')).toHaveText(r.title);
  await expect(page.getByTestId('ingredient').filter({ hasText: /\$\d+\.\d\d/ }).first()).toBeVisible();
  const before = await page.getByTestId('ingredient-amount').allTextContents();
  await page.getByRole('button', { name: 'More servings' }).click();
  await expect(page.getByTestId('stepper-servings')).toHaveText(String(r.servings + 1));
  await expect.poll(() => page.getByTestId('ingredient-amount').allTextContents()).not.toEqual(before);
  await page.reload();
  await expect(page.getByTestId('stepper-servings')).toHaveText(String(r.servings));
  expect(await page.getByTestId('ingredient-amount').allTextContents()).toEqual(before);
});

test('plan merges ingredients, pantry deducts, checks survive reload, plus manual items', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const recipes = await completeRecipeIds(page, 2, 'onion');
  for (const r of recipes) await addRecipeToPlan(page, r.id);

  await page.goto('./#/plan');
  await expect(page.getByTestId('plan-meal')).toHaveCount(2);
  await expect(page.getByTestId('plan-total')).toContainText('$');
  await page.getByTestId('shop-this-week').click();

  const onionRow = page.getByTestId('shop-row').filter({ has: page.getByText('Onion', { exact: true }) });
  await expect(onionRow).toHaveCount(1); // merged into one line
  await expect(onionRow).toContainText('2 meals');
  const needBefore = await onionRow.getByTestId('row-need').textContent();
  const totalBefore = await page.getByTestId('basket-total').textContent();

  await addPantry(page, 'Onion', '100', 'g');
  await page.goto('./#/shop');
  const after = page.getByTestId('shop-row').filter({ has: page.getByText('Onion', { exact: true }) });
  await expect(after.getByTestId('row-need')).toContainText('100 g from pantry');
  expect(needBefore).not.toContain('from pantry');
  expect(totalBefore).toMatch(/\$\d/);

  await after.getByRole('checkbox').click();
  await expect(after.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  const row = page.getByTestId('shop-row').filter({ has: page.getByText('Onion', { exact: true }) });
  await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await row.getByRole('checkbox').click();
  await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');

  await page.getByLabel('Add an item').fill('Dishwash tablets');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('Dishwash tablets')).toBeVisible();

  // Product matching gives a valid catalogue product with a working link.
  await row.getByRole('button').first().click();
  await expect(page.getByRole('link', { name: /Open on Woolworths/ })).toHaveAttribute('href', /woolworths\.co\.nz\/shop\/productdetails\?stockcode=/);
});

test('smart plan proposes a week that can be approved', async ({ page }) => {
  await enter(page, 'plan');
  await page.getByRole('button', { name: 'Smart plan' }).click();
  await page.getByRole('button', { name: /Budget week/ }).click();
  await page.getByTestId('approve-plan').click({ timeout: 40000 });
  await expect(page.getByTestId('plan-meal')).toHaveCount(5);
});

test('shop mode ticks off and undoes, then works offline after first load', async ({ page, context }) => {
  await enter(page);
  await waitForCard(page);
  // Let the service worker take control so offline is real.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await addRecipeToPlan(page, r.id);
  await page.goto('./#/shop/mode');
  const rows = page.getByTestId('mode-row');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();

  await context.setOffline(true);
  await page.reload();
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId('remaining-count')).toHaveText(`${total} to go`);
  await rows.first().getByRole('checkbox').click();
  await expect(page.getByTestId('remaining-count')).toHaveText(`${total - 1} to go`);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('remaining-count')).toHaveText(`${total} to go`);
  await rows.first().getByRole('checkbox').click();
  await expect(page.getByTestId('remaining-count')).toHaveText(`${total - 1} to go`);
  await page.reload();
  await expect(page.getByTestId('remaining-count')).toHaveText(`${total - 1} to go`);
  await context.setOffline(false);
});

test('saved data survives a catalogue update', async ({ page }) => {
  await enter(page);
  const first = await waitForCard(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('saved-count')).toHaveText('1');
  // Simulate a deployment with a changed catalogue: new data, same stable IDs.
  await page.route('**/data/recipes-index.json', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({ response: res, json: [{ ...json[0], id: 'brand-new-recipe', title: 'Brand New Recipe' }, ...json] });
  });
  await page.reload();
  await waitForCard(page);
  await expect(page.getByTestId('saved-count')).toHaveText('1');
  await page.goto('./#/cookbook');
  await expect(page.getByTestId('cookbook-item')).toContainText(first);
});

test('backup export and restore round trip', async ({ page }, info) => {
  await enter(page);
  const first = await waitForCard(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('saved-count')).toHaveText('1');
  await page.goto('./#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()]);
  const file = info.outputPath('backup.json');
  await dl.saveAs(file);
  expect(JSON.parse(readFileSync(file, 'utf8')).data.cookbook).toHaveLength(1);

  await page.getByTestId('reset-discovery').click();
  await page.getByTestId('confirm-yes').click();
  await page.goto('./#/settings');
  await page.getByTestId('restore-input').setInputFiles({ name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
  await expect(page.getByText(/doesn't look like a Love Bites backup/)).toBeVisible();
  await page.getByTestId('restore-input').setInputFiles(file);
  await page.getByTestId('restore-merge').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('./');
  await expect.poll(() => waitForCard(page)).not.toBe(first); // swipe restored
  await page.goto('./#/cookbook');
  await expect(page.getByTestId('cookbook-item')).toContainText(first);
});

test('cooking mode: steps, timers, resume, finish with notes and reversible pantry use', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await addPantry(page, 'Onion', '2000', 'g');
  await page.goto(`./#/recipe/${r.id}`);
  await page.getByTestId('start-cooking').click();
  await expect(page.getByTestId('step-label')).toContainText('Step 1');
  await page.getByRole('button', { name: '5 min timer' }).click();
  await page.getByRole('button', { name: '5 min timer' }).click();
  await expect(page.getByTestId('timer')).toHaveCount(2);
  await page.getByRole('button', { name: 'Pause Timer' }).first().click();
  await page.getByRole('button', { name: 'Ingredients' }).click();
  await expect(page.getByRole('dialog')).toContainText(/onion/i);
  await page.getByRole('button', { name: 'Close' }).click();
  const steps = parseInt((await page.getByTestId('step-label').textContent())!.match(/of (\d+)/)![1], 10);
  if (steps > 1) {
    await page.getByTestId('step-done').click();
    await expect(page.getByTestId('step-label')).toContainText('Step 2');
  }
  await page.getByRole('button', { name: 'Leave cooking mode' }).click();
  await expect(page.getByTestId('start-cooking')).toHaveText('Resume cooking');
  await page.getByTestId('start-cooking').click();
  if (steps > 1) await expect(page.getByTestId('step-label')).toContainText('Step 2');
  await expect(page.getByTestId('timer')).toHaveCount(2);
  for (let i = 0; i < steps; i++) {
    if (await page.getByTestId('finish-cooking').count()) break;
    await page.getByRole('button', { name: 'Next step' }).click();
  }
  await page.getByTestId('finish-cooking').click();
  await page.getByRole('button', { name: '5 stars' }).click();
  await page.getByLabel('Notes for next time').fill('Kids loved it.');
  await page.getByTestId('save-cooked').click();
  await expect(page.getByTestId('start-cooking')).toHaveText('Start cooking');
  await expect(page.getByText('Kids loved it.')).toBeVisible();
  await page.goto('./#/pantry');
  await expect(page.getByLabel('Undo deduction')).toBeVisible();
  await expect(page.getByTestId('pantry-item').first()).not.toContainText('2 kg');
  await page.getByLabel('Undo deduction').click();
  await expect(page.getByTestId('pantry-item').first()).toContainText('2 kg');
});

test('broken images and missing recipes use graceful fallbacks', async ({ page }) => {
  await page.route(/themealdb\.com/, (r) => r.abort());
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1);
  await page.goto(`./#/recipe/${r.id}`);
  await expect(page.getByTestId('recipe-title')).toBeVisible();
  await expect(page.locator('img[src*="themealdb"]')).toHaveCount(0);
  await page.goto('./#/recipe/does-not-exist');
  await expect(page.getByText("Can't find that recipe.")).toBeVisible();
});

test('link-only recipes are honest about what they contain', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const id = await page.evaluate(async () => {
    const all = (await (await fetch('data/recipes-index.json')).json()) as { id: string; completeness: string }[];
    return all.find((r) => r.completeness === 'discovery-only')!.id;
  });
  await page.goto(`./#/recipe/${id}`);
  await expect(page.getByRole('button', { name: 'Open the full recipe' })).toBeVisible();
  await expect(page.getByTestId('start-cooking')).toHaveCount(0);
  await expect(page.getByTestId('add-to-plan')).toHaveCount(0);
});

test('PWA assets load with correct scope', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(`/love-bites/${href!.replace(/^\/love-bites\//, '')}`)).json();
  expect(manifest.scope).toBe('/love-bites/');
  expect(manifest.start_url).toBe('/love-bites/');
  for (const i of manifest.icons) expect((await request.get(`/love-bites/${i.src}`)).ok()).toBe(true);
  expect((await request.get('/love-bites/sw.js')).ok()).toBe(true);
});

test('no serious accessibility problems on key screens', async ({ page }) => {
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await addRecipeToPlan(page, r.id);
  for (const route of ['', 'cookbook', 'plan', 'shop', 'shop/mode', 'pantry', 'settings', `recipe/${r.id}`]) {
    await page.goto(`./#/${route}`);
    await page.waitForTimeout(700);
    // The fixed nav floats over scrolling content, which axe reads as low contrast on what's beneath it.
    await page.addStyleTag({ content: 'nav, .fixed { position: static !important; }' });
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${route}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(bad, bad.join('\n')).toEqual([]);
  }
});
