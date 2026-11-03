import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

// A small in-memory stand-in for Supabase: enough of auth and the REST API to run two family members.
const API = 'https://cloud.test';
const FAMILY: Record<string, string> = { 'ren@example.com': 'u-ren', 'katie@example.com': 'u-katie' };
type Row = Record<string, unknown>;
const store: Record<string, Row[]> = { profiles: [], user_state: [], family_shares: [], family_loves: [], contributors: [{ user_id: 'u-ren' }], community_recipes: [] };
const KEYS: Record<string, string[]> = { profiles: ['id'], user_state: ['user_id'], family_loves: ['user_id', 'recipe_id'], family_shares: ['id'], contributors: ['user_id'], community_recipes: ['id'] };

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

function filters(url: URL) {
  const out: ((r: Row) => boolean)[] = [];
  for (const [k, v] of url.searchParams) {
    if (v.startsWith('eq.')) out.push((r) => String(r[k]) === v.slice(3));
    else if (v.startsWith('in.(')) {
      const set = new Set(v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, '')));
      out.push((r) => set.has(String(r[k])));
    }
  }
  return (r: Row) => out.every((f) => f(r));
}

async function handle(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const { email, password } = req.postDataJSON() as { email: string; password: string };
    if (password !== 'tasty-secret' || !FAMILY[email]) return json(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
    const id = FAMILY[email];
    return json(200, { access_token: jwt(id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r-${id}`, user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
  }
  if (url.pathname.startsWith('/auth/v1/')) return json(200, {});
  const table = url.pathname.replace('/rest/v1/', '');
  const rows = store[table];
  if (!rows) return json(404, { message: 'no table' });
  const me = JSON.parse(Buffer.from((req.headers().authorization ?? '').split('.')[1] ?? '', 'base64url').toString() || '{}').sub as string | undefined;
  if (!me) return json(401, { message: 'not signed in' });
  if (req.method() === 'GET') return json(200, rows.filter(filters(url)).sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))));
  if (req.method() === 'DELETE') {
    const match = filters(url);
    store[table] = rows.filter((r) => !(match(r) && (r.user_id ?? r.id) === me));
    return json(204, null);
  }
  const body = req.postDataJSON() as Row | Row[];
  for (const raw of Array.isArray(body) ? body : [body]) {
    const r: Row = { created_at: new Date().toISOString(), ...raw };
    if (table === 'family_shares') r.id ??= `s-${rows.length + 1}`;
    if (table !== 'profiles') r.user_id ??= me;
    if ((r.user_id ?? r.id) !== me) return json(403, { message: 'row-level security' });
    if (table === 'community_recipes' && !store.contributors.some((c) => c.user_id === me)) return json(403, { message: 'row-level security' });
    const key = (x: Row) => KEYS[table].map((k) => x[k]).join('|');
    const i = rows.findIndex((x) => key(x) === key(r));
    if (i >= 0) rows[i] = { ...rows[i], ...r };
    else rows.push(r);
  }
  return json(201, null);
}

async function phone(context: BrowserContext): Promise<Page> {
  await context.addInitScript((url) => {
    window.__LB_SUPABASE__ = { url, key: 'sb_publishable_test' };
    sessionStorage.setItem('lb-splash-seen', '1');
  }, API);
  await context.route(`${API}/**`, handle);
  const page = await context.newPage();
  await page.goto('./');
  return page;
}

async function signIn(page: Page, email: string, name?: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('tasty-secret');
  await page.getByRole('button', { name: 'Let me in' }).click();
  // First sign-in asks for a name; later ones (the mock keeps profiles between tests) go straight in.
  await expect(page.getByTestId('swipe-card').or(page.getByLabel('Your name'))).toBeVisible();
  if (name && (await page.getByLabel('Your name').count())) {
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Done' }).click();
  }
  await expect(page.getByTestId('swipe-card')).toBeVisible();
}

test('family: invite-only password sign in, private sync across phones, shared recipes and loves', async ({ browser }) => {
  const ren = await phone(await browser.newContext());
  // Someone not on the list is turned away.
  await ren.getByLabel('Email').fill('stranger@example.com');
  await ren.getByLabel('Password', { exact: true }).fill('tasty-secret');
  await ren.getByRole('button', { name: 'Let me in' }).click();
  await expect(ren.getByRole('alert')).toContainText("don't match");
  await signIn(ren, 'ren@example.com', 'Ren');

  const loved = (await ren.getByTestId('swipe-card').getByTestId('card-title').textContent())!.trim();
  await ren.keyboard.press('ArrowRight');
  await expect(ren.getByTestId('saved-count')).toHaveText('1');
  await ren.goto('./#/cookbook');
  await ren.getByTestId('cookbook-item').first().getByRole('link').first().click();
  await ren.getByTestId('share-family').click();
  await ren.getByLabel('Add a note (optional)').fill('Make this one!');
  await ren.getByTestId('share-family-send').click();
  await expect(ren.getByText('Shared with the family.')).toBeVisible();
  await ren.goto('./#/settings');
  await expect(ren.getByTestId('account-email')).toHaveText('ren@example.com');
  await ren.getByRole('button', { name: 'Back up now' }).click();
  await expect(ren.getByText('All backed up.')).toBeVisible();
  expect(store.user_state).toHaveLength(1);
  expect(store.family_loves.map((r) => r.user_id)).toEqual(['u-ren']);

  // Katie sees what Ren shared and loves, but none of Ren's private data.
  const katie = await phone(await browser.newContext());
  await signIn(katie, 'katie@example.com', 'Katie');
  await expect(katie.getByTestId('saved-count')).toHaveText('0');
  await katie.goto('./#/cookbook');
  await katie.getByRole('button', { name: 'From family' }).click();
  const share = katie.getByTestId('family-share');
  await expect(share).toContainText(loved);
  await expect(share).toContainText('Ren');
  await expect(share).toContainText('Make this one!');
  await expect(katie.getByTestId('family-love')).toContainText('Loved by Ren');
  await share.getByRole('button').first().click();
  await expect(katie.getByTestId('recipe-title')).toHaveText(loved);
  await expect(katie.getByTestId('loved-by')).toContainText('Loved by Ren');

  // Ren on a new phone gets her cookbook back, and isn't asked for her name again.
  const renPhone2 = await phone(await browser.newContext());
  await signIn(renPhone2, 'ren@example.com');
  await expect(renPhone2.getByTestId('saved-count')).toHaveText('1');
  await renPhone2.goto('./#/cookbook');
  await expect(renPhone2.getByTestId('cookbook-item')).toContainText(loved);

  // Signing out returns to the sign-in screen.
  await renPhone2.goto('./#/settings');
  await renPhone2.getByTestId('sign-out').click();
  await renPhone2.getByTestId('confirm-yes').click();
  await expect(renPhone2.getByLabel('Email')).toBeVisible();
});

test('contributors add their imported recipes to Love Bites for everyone; others cannot', async ({ browser }) => {
  const recipe = ['Nana’s lemon slice', 'Ingredients', '1 cup flour', '100 g butter', '1 lemon', 'Method', '1. Mix it all.', '2. Bake at 350°F for 20 minutes.'].join('\n');
  const ren = await phone(await browser.newContext());
  await signIn(ren, 'ren@example.com', 'Ren');
  await ren.goto('./#/import');
  await ren.getByTestId('import-paste').fill(recipe);
  await ren.getByTestId('import-paste-save').click();
  await expect(ren.getByTestId('recipe-title')).toHaveText('Nana’s lemon slice');
  await ren.getByTestId('publish').click();
  await ren.getByTestId('confirm-yes').click();
  await expect(ren.getByText('Added to Love Bites')).toBeVisible();
  expect(store.community_recipes).toHaveLength(1);
  expect((store.community_recipes[0].recipe as { mealTypes: string[] }).mealTypes).not.toContain('dinner');

  const katie = await phone(await browser.newContext());
  await signIn(katie, 'katie@example.com', 'Katie');
  await katie.getByTestId('view-toggle').click();
  await katie.getByLabel('Search recipes').fill('lemon slice');
  const published = katie.getByTestId('discover-row').filter({ hasText: 'Nana’s lemon slice' });
  await expect(published).toBeVisible();
  await published.getByRole('link').click();
  await expect(katie.getByText('Bake at 180°C for 20 minutes.')).toBeVisible();
  await expect(katie.getByTestId('unpublish')).toHaveCount(0);
  // Katie isn't a contributor in this test, so her own imports can't be published.
  await katie.goto('./#/import');
  await katie.getByTestId('import-paste').fill(recipe.replace('Nana’s', 'Katie’s'));
  await katie.getByTestId('import-paste-save').click();
  await expect(katie.getByTestId('recipe-title')).toHaveText('Katie’s lemon slice');
  await expect(katie.getByTestId('publish')).toHaveCount(0);
});
