import { expect, test, type Page } from '@playwright/test';
import { addRecipeToPlan, completeRecipeIds, enter, waitForCard } from './helpers';

/** Every visible control on the page must receive a tap at its centre, not something drawn over it. */
async function blockedControls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    // With a sheet or dialog open, only its own controls should be reachable.
    const scope: ParentNode = [...document.querySelectorAll('[role=dialog]')].at(-1) ?? document;
    const controls = [...scope.querySelectorAll<HTMLElement>('button, a[href], input:not([type=file]):not([type=hidden]), select, textarea, [role=checkbox], [role=switch]')];
    for (const el of controls) {
      if (el.closest('[aria-hidden=true]') || (el as HTMLButtonElement).disabled) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      let r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      // Controls inside horizontal scrollers or offscreen sheets are checked where they sit.
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      const ok = el === hit || el.contains(hit) || (hit instanceof HTMLLabelElement && hit.control === el) || hit.closest('label')?.contains(el);
      if (!ok) {
        const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName;
        const over = hit.getAttribute('aria-label') || hit.className.toString().slice(0, 60) || hit.tagName;
        out.push(`"${name}" is covered by ${hit.tagName.toLowerCase()} (${over})`);
      }
    }
    return out;
  });
}

test('every control on every screen can be tapped', async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page);
  await waitForCard(page);
  const [r] = await completeRecipeIds(page, 1, 'onion');
  await addRecipeToPlan(page, r.id);
  // A recipe with no photo uses the poster placeholder, which once covered the header buttons.
  await page.goto('./#/recipe/new/edit');
  await page.getByLabel('Name').fill('Simple Italian Sausage Spaghetti');
  await page.getByLabel('Ingredients, one per line').fill('400 g spaghetti\n4 sausages\n1 onion');
  await page.getByLabel('Step 1').fill('Cook it all.');
  await page.getByTestId('save-recipe-edit').click();
  await expect(page.getByTestId('recipe-title')).toBeVisible();
  const ownId = page.url().split('/recipe/')[1];

  const problems: string[] = [];
  const check = async (label: string) => {
    await page.waitForTimeout(400);
    for (const p of await blockedControls(page)) problems.push(`${label}: ${p}`);
  };
  for (const route of ['', 'cookbook', 'plan', 'shop', 'shop/mode', 'pantry', 'import', 'settings', `recipe/${r.id}`, `recipe/${ownId}`, `recipe/${r.id}/cook`]) {
    await page.goto(`./#/${route}`);
    await check(`/${route}`);
  }
  await page.goto('./#/');
  await page.getByTestId('view-toggle').click();
  await check('discover list');
  await page.getByRole('button', { name: 'Filters' }).click();
  await check('filter sheet');
  await page.keyboard.press('Escape');
  await page.goto(`./#/recipe/${r.id}`);
  await page.getByTestId('add-to-plan').click();
  await check('add to plan sheet');
  expect(problems).toEqual([]);
});
