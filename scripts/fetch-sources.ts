// Downloads raw source data into data/raw. Run: npm run data:fetch [-- --only mealdb,wikibooks,thermomix,woolworths]
import { arg, path, robotsAllows, sleep, USER_AGENT, writeJson, writeText } from './lib/common';

const only = arg('only')?.split(',');
const want = (k: string) => !only || only.includes(k);
const headers = { 'User-Agent': USER_AGENT };

async function mealdb() {
  // TheMealDB terms permit copying content returned from the official API endpoints, with attribution.
  const meals = new Map<string, unknown>();
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`, { headers });
    const json = (await res.json()) as { meals: { idMeal: string }[] | null };
    for (const m of json.meals ?? []) meals.set(m.idMeal, m);
    await sleep(300);
  }
  writeJson(path('data/raw/mealdb.json'), { fetchedAt: new Date().toISOString(), meals: [...meals.values()] });
  console.log(`TheMealDB: ${meals.size} meals`);
}

async function wikibooks() {
  const res = await fetch('https://huggingface.co/datasets/gossminn/wikibooks-cookbook/resolve/main/recipes_parsed.json', { headers });
  if (!res.ok) throw new Error(`Wikibooks download failed: ${res.status}`);
  writeText(path('data/raw/wikibooks.json'), await res.text());
  console.log('Wikibooks Cookbook dataset downloaded (CC BY-SA 4.0)');
}

async function thermomix() {
  // Link-only: titles and URLs from public sitemaps, honouring robots.txt. No page content is copied.
  const out: { site: string; url: string }[] = [];
  const constraints: string[] = [];
  for (const site of ['thermobliss.com', 'thermofun.com']) {
    const url = `https://${site}/post-sitemap.xml`;
    const robots = await robotsAllows(url);
    if (!robots.allowed) {
      constraints.push(`${site}: sitemap disallowed by robots.txt`);
      continue;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      constraints.push(`${site}: sitemap returned ${res.status}`);
      continue;
    }
    const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const u of locs) out.push({ site, url: u });
    await sleep(robots.crawlDelayMs);
  }
  const rc = await robotsAllows('https://www.recipecommunity.com.au/');
  constraints.push(rc.allowed ? 'recipecommunity.com.au: reachable, not imported' : 'recipecommunity.com.au: automated access refused (HTTP 403); not imported and no bypass attempted');
  writeJson(path('data/raw/thermomix-links.json'), { fetchedAt: new Date().toISOString(), links: out, constraints }, true);
  console.log(`Thermomix link-only entries: ${out.length}`);
}

async function woolworths() {
  // neon-ninja/woolies (MIT) publishes a daily snapshot. We read that file, not Woolworths' servers.
  const res = await fetch('https://raw.githubusercontent.com/neon-ninja/woolies/main/products.csv', { headers });
  if (!res.ok) throw new Error(`Product feed failed: ${res.status}`);
  writeText(path('data/raw/woolworths-products.csv'), await res.text());
  const c = await fetch('https://api.github.com/repos/neon-ninja/woolies/commits?path=products.csv&per_page=1', { headers });
  const commits = (await c.json()) as { commit: { committer: { date: string } } }[];
  writeJson(path('data/raw/woolworths-meta.json'), { observedAt: commits[0]?.commit.committer.date ?? null, fetchedAt: new Date().toISOString() }, true);
  console.log(`Woolworths snapshot observed ${commits[0]?.commit.committer.date}`);
}

if (want('mealdb')) await mealdb();
if (want('wikibooks')) await wikibooks();
if (want('thermomix')) await thermomix();
if (want('woolworths')) await woolworths();
