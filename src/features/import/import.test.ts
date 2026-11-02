import { describe, expect, it } from 'vitest';
import { metricise } from '../../domain/metric';
import { findJsonLdRecipe, fromJsonLd, parsePastedRecipe, toRecipe } from './importRecipes';

describe('metricise', () => {
  it('converts oven temperatures to rounded Celsius', () => {
    expect(metricise('Preheat oven to 350°F.')).toBe('Preheat oven to 180°C.');
    expect(metricise('Bake at 425 degrees F')).toBe('Bake at 220°C');
    expect(metricise('Cook 2 F minutes')).toBe('Cook 2 F minutes');
  });
  it('converts weights, volumes and pan sizes', () => {
    expect(metricise('8 oz cheddar, grated')).toBe('225 g cheddar, grated');
    expect(metricise('2 lbs chicken thighs')).toBe('905 g chicken thighs');
    expect(metricise('1 1/2 cups water')).toBe('375 ml water');
    expect(metricise('½ cup milk')).toMatch(/^125 (ml|g) milk$/);
    expect(metricise('Grease a 9x13-inch dish')).toBe('Grease a 23 x 33 cm dish');
    expect(metricise('1 stick butter')).toBe('115 g butter');
  });
  it('leaves metric amounts and teaspoons alone', () => {
    expect(metricise('500 g beef mince')).toBe('500 g beef mince');
    expect(metricise('2 tbsp olive oil')).toBe('2 tbsp olive oil');
    expect(metricise('1 cupcake tin')).toBe('1 cupcake tin');
  });
  it('turns cups of a known dry ingredient into grams', () => {
    expect(metricise('1 cup plain flour')).toMatch(/^\d+ g plain flour$/);
  });
});

const PAGE = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],"name":"Mac &amp; Cheese","image":[{"url":"https://example.com/mac.jpg"}],"recipeYield":["4 servings"],"totalTime":"PT45M","recipeIngredient":["8 oz macaroni","2 cups milk","1 cup grated cheddar"],"recipeInstructions":[{"@type":"HowToStep","text":"Heat oven to 375°F."},{"@type":"HowToStep","text":"Bake for 20 minutes."}]}]}</script></head></html>`;

describe('link import', () => {
  it('finds a Recipe inside a JSON-LD graph and makes it metric', () => {
    const found = findJsonLdRecipe(PAGE);
    expect(found).not.toBeNull();
    const input = { ...fromJsonLd(found!), sourceUrl: 'https://www.example.com/mac' };
    expect(input).toMatchObject({ title: 'Mac & Cheese', servings: 4, minutes: 45, image: 'https://example.com/mac.jpg' });
    const r = toRecipe(input);
    expect(r.ingredients[0].original).toBe('225 g macaroni');
    expect(r.ingredients[1]).toMatchObject({ quantity: 500, unit: 'ml' });
    expect(r.steps[0].text).toBe('Heat oven to 190°C.');
    expect(r.steps[1].timerSeconds).toEqual([1200]);
    expect(r.image?.url).toBe('https://example.com/mac.jpg');
    expect(r.source).toMatchObject({ name: 'example.com', url: 'https://www.example.com/mac', rights: 'user-owned' });
  });
  it('returns null when a page has no recipe data', () => {
    expect(findJsonLdRecipe('<html><script type="application/ld+json">{"@type":"Article"}</script></html>')).toBeNull();
  });
});

describe('pasted recipes', () => {
  const text = `Skip to content
Easy beef tacos
Serves 4
Ingredients
500g beef mince
1 lb tomatoes, chopped
8 taco shells
Method
1. Brown the mince in a pan.
Step 2 Add tomatoes and simmer for 10 minutes.
Notes
Great with guacamole.`;
  it('reads the title, ingredients and method from copied page text', () => {
    const input = parsePastedRecipe(text, null)!;
    expect(input.title).toBe('Easy beef tacos');
    expect(input.servings).toBe(4);
    expect(input.ingredients).toEqual(['500g beef mince', '1 lb tomatoes, chopped', '8 taco shells']);
    expect(input.steps).toEqual(['Brown the mince in a pan.', 'Add tomatoes and simmer for 10 minutes.']);
    expect(toRecipe(input).ingredients[1].original).toBe('455 g tomatoes, chopped');
  });
  it('gives up without both headings', () => {
    expect(parsePastedRecipe('Just some words\nand more', null)).toBeNull();
  });
});
