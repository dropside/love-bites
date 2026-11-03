// Hand-maintained canonical ingredient database. Densities and item weights are common kitchen
// reference values; anything without one simply won't convert (and gets flagged) rather than guess.
import type { Allergen, CanonicalIngredient, ShopCategory } from './types';

const VEG = ['Fruit & Veg'];
const MEAT = ['Meat & Poultry', 'Fridge & Deli'];
const FISH = ['Fish & Seafood', 'Fridge & Deli', 'Frozen', 'Pantry'];
const DAIRY = ['Fridge & Deli'];
const PANTRY = ['Pantry'];
const BAKERY = ['Bakery', 'Pantry', 'Frozen'];
const FROZEN = ['Frozen'];

interface Opt {
  a?: string; // alias list separated by |
  q?: string; // product query alternatives separated by |
  x?: string; // product exclusions
  d?: string[];
  rho?: number;
  ea?: number;
  al?: Allergen[];
  season?: boolean;
  staple?: boolean;
  free?: boolean;
  sub?: string;
}

const out: CanonicalIngredient[] = [];
function add(id: string, name: string, category: ShopCategory, o: Opt = {}) {
  out.push({
    id,
    name,
    category,
    aliases: [name.toLowerCase(), ...(o.a ? o.a.split('|') : [])],
    query: (o.q ?? name.toLowerCase()).split('|'),
    exclude: o.x ? o.x.split(' ') : undefined,
    departments: o.d,
    density: o.rho,
    eachGrams: o.ea,
    allergens: o.al,
    seasoning: o.season,
    staple: o.staple,
    free: o.free,
    substitutes: o.sub ? o.sub.split('|') : undefined,
  });
}

const SNACKY = 'chips crackers snack seasoned sauce dip juice drink flavoured soup baby pie cake yoghurt';

// ---- Vegetables & fruit
add('onion', 'Onion', 'veg', { a: 'onions|brown onion|brown onions|yellow onion|yellow onions|white onion|white onions|cooking onion', q: 'onions brown|onions', x: 'spring red baby pickled '+SNACKY, d: VEG, ea: 150 , sub: 'red-onion|shallot' });
add('red-onion', 'Red onion', 'veg', { a: 'red onions|spanish onion', q: 'onions red|red onions|red onion', d: VEG, ea: 150, sub: 'onion' });
add('spring-onion', 'Spring onion', 'veg', { a: 'spring onions|scallion|scallions|green onion|green onions|salad onion', q: 'spring onion', d: VEG, ea: 15 });
add('shallot', 'Shallot', 'veg', { a: 'shallots|eschalot|eschalots|challots', q: 'shallots|shallot', d: VEG, ea: 30, sub: 'onion' });
add('leek', 'Leek', 'veg', { a: 'leeks', q: 'leek|leeks', d: VEG, ea: 250 });
add('garlic', 'Garlic', 'veg', { a: 'garlic clove|garlic cloves|clove garlic|cloves garlic|cloves of garlic|clove of garlic|fresh garlic|crushed garlic|minced garlic', q: 'garlic', x: 'bread butter salt aioli powder granulated paste peeled asian ginger crushed chive mushrooms croutons seeds marinated', d: VEG, ea: 5, staple: true });
add('ginger', 'Ginger', 'veg', { a: 'fresh ginger|root ginger|ginger root|gingerroot|grated ginger|minced ginger', q: 'ginger', x: 'beer biscuits crunch', d: VEG, ea: 30 });
add('potato', 'Potato', 'veg', { a: 'potatoes|new potatoes|baby potatoes|floury potatoes|waxy potatoes|maris piper potatoes|red potatoes|russet potatoes|yukon gold potatoes|agria potatoes|baking potatoes|medium potatoes|large potatoes', q: 'potatoes', x: 'sweet chips wedges mash', d: VEG, ea: 180 });
add('sweet-potato', 'Kumara / sweet potato', 'veg', { a: 'kumara|kumaras|sweet potato|sweet potatoes', q: 'kumara', x: 'chips', d: VEG, ea: 300 });
add('carrot', 'Carrot', 'veg', { a: 'carrots|baby carrots', q: 'carrots', d: VEG, ea: 100 });
add('celery', 'Celery', 'veg', { a: 'celery stalk|celery stalks|celery sticks|celery stick|sticks celery|stalks celery|stick celery|stalk celery|celery ribs|celery rib', q: 'celery', d: VEG, ea: 50 });
add('capsicum-red', 'Red capsicum', 'veg', { a: 'red pepper|red peppers|red bell pepper|red bell peppers|red capsicum|red capsicums', q: 'capsicum red|red capsicum', d: VEG, ea: 180, sub: 'capsicum' });
add('capsicum', 'Capsicum', 'veg', { a: 'capsicums|bell pepper|bell peppers|green pepper|green peppers|green bell pepper|green capsicum|yellow pepper|yellow peppers|yellow bell pepper|sweet pepper|sweet peppers|mixed peppers', q: 'capsicum', x: 'jar', d: VEG, ea: 180 });
add('tomato', 'Tomato', 'veg', { a: 'tomatoes|ripe tomatoes|fresh tomatoes|beef tomatoes|plum tomatoes|roma tomatoes|vine tomatoes|large tomatoes', q: 'tomatoes', x: 'cherry baby sun dried', d: VEG, ea: 120 });
add('cherry-tomato', 'Cherry tomatoes', 'veg', { a: 'cherry tomato|baby tomatoes|grape tomatoes', q: 'tomatoes cherry|cherry tomatoes|tomatoes baby', d: VEG, ea: 15 });
add('cucumber', 'Cucumber', 'veg', { a: 'cucumbers|telegraph cucumber|english cucumber', q: 'cucumber', d: VEG, ea: 350 });
add('courgette', 'Courgette', 'veg', { a: 'courgettes|zucchini|zucchinis', q: 'courgettes|zucchini|courgette', d: VEG, ea: 200 });
add('eggplant', 'Eggplant', 'veg', { a: 'eggplants|egg plants|egg plant|aubergine|aubergines', q: 'eggplant', d: VEG, ea: 400 });
add('broccoli', 'Broccoli', 'veg', { a: 'broccoli florets|head of broccoli|tenderstem broccoli', q: 'broccoli', x: 'frozen', d: VEG, ea: 350 });
add('cauliflower', 'Cauliflower', 'veg', { a: 'cauliflower florets|head of cauliflower', q: 'cauliflower', d: VEG, ea: 900 });
add('cabbage', 'Cabbage', 'veg', { a: 'green cabbage|white cabbage|savoy cabbage|red cabbage|napa cabbage|chinese cabbage', q: 'cabbage', d: VEG, ea: 1200 });
add('spinach', 'Spinach', 'veg', { a: 'baby spinach|fresh spinach|spinach leaves|baby spinach leaves', q: 'spinach', d: VEG });
add('lettuce', 'Lettuce', 'veg', { a: 'iceberg lettuce|cos lettuce|romaine lettuce|romaine|little gem lettuce|butter lettuce|salad leaves|mixed salad leaves|salad greens', q: 'lettuce', d: VEG, ea: 400 });
add('rocket', 'Rocket', 'veg', { a: 'arugula|wild rocket|baby rocket', q: 'rocket', d: VEG });
add('mushroom', 'Mushrooms', 'veg', { a: 'mushroom|button mushrooms|white mushrooms|brown mushrooms|chestnut mushrooms|cremini mushrooms|portobello mushrooms|sliced mushrooms|shiitake mushrooms', q: 'mushrooms', x: 'soup sauce', d: VEG });
add('pumpkin', 'Pumpkin', 'veg', { a: 'butternut squash|butternut pumpkin|butternut|squash|crown pumpkin', q: 'pumpkin|butternut', x: 'seeds soup', d: VEG, ea: 1500 });
add('corn', 'Corn', 'veg', { a: 'sweetcorn|sweet corn|corn on the cob|corn cobs|corn kernels|ears of corn|sweetcorn kernels', q: 'corn sweet|sweetcorn|corn', x: 'flour chips starch chicken popcorn tortilla', d: VEG, ea: 250 });
add('green-beans', 'Green beans', 'veg', { a: 'french beans|string beans|fine beans|runner beans', q: 'beans green|green beans', d: VEG });
add('peas', 'Peas', 'frozen', { a: 'green peas|frozen peas|garden peas|petit pois|fresh peas', q: 'peas', x: 'chick wasabi split snack', d: FROZEN, rho: 0.65 });
add('beetroot', 'Beetroot', 'veg', { a: 'beets|beet|fresh beetroot', q: 'beetroot', d: VEG, ea: 200 });
add('parsnip', 'Parsnip', 'veg', { a: 'parsnips', q: 'parsnip|parsnips', d: VEG, ea: 150 });
add('avocado', 'Avocado', 'veg', { a: 'avocados|ripe avocado|avocado pear', q: 'avocado|avocados', x: 'oil', d: VEG, ea: 200 });
add('chilli', 'Fresh chilli', 'veg', { a: 'chilli|chillies|chili|chilies|red chilli|red chillies|green chilli|green chillies|red chili|green chili|jalapeno|jalapenos|jalapeño|jalapeños|bird eye chilli|thai chilli|thai chillies|scotch bonnet|serrano|habanero|habanero pepper|habaneros|jalapeno pepper|chili pepper|chilli pepper|hot pepper|hot peppers|scotch bonnet pepper|serrano pepper|poblano|poblano pepper|fresh chillies|fresh red chilli', q: 'chilli|chillies', x: 'sauce powder flakes oil paste jam sweet lime', d: VEG, ea: 10 });
add('lemon', 'Lemon', 'veg', { a: 'lemons|juice of lemon|lemon juice|juice of 1 lemon|zest of lemon|lemon zest|fresh lemon juice|lemon wedges|lemon rind', q: 'lemons|lemon', x: 'lime curd drink cordial tea crushed chilli squeeze', d: VEG, ea: 120, rho: undefined });
add('lime', 'Lime', 'veg', { a: 'limes|juice of lime|lime juice|lime zest|zest of lime|lime wedges|fresh lime juice', q: 'limes|lime', x: 'lemon cordial crushed chilli squeeze leaves', d: VEG, ea: 70 });
add('orange', 'Orange', 'veg', { a: 'oranges|orange juice|orange zest|zest of orange|navel orange', q: 'oranges|orange', d: VEG, ea: 200 });
add('apple', 'Apple', 'veg', { a: 'apples|cooking apples|bramley apples|granny smith apples|granny smith|green apple|green apples|red apple|red apples|eating apples', q: 'apples|apple', x: 'juice sauce', d: VEG, ea: 180 });
add('pear', 'Pear', 'veg', { a: 'pears', q: 'pears|pear', d: VEG, ea: 180 });
add('banana', 'Banana', 'veg', { a: 'bananas|ripe bananas|ripe banana', q: 'bananas|banana', d: VEG, ea: 120 });
add('strawberry', 'Strawberries', 'veg', { a: 'strawberry|fresh strawberries', q: 'strawberries', d: VEG });
add('blueberry', 'Blueberries', 'frozen', { a: 'blueberry|fresh blueberries|frozen blueberries', q: 'blueberries', d: ['Frozen', 'Fruit & Veg'] });
add('raspberry', 'Raspberries', 'frozen', { a: 'raspberry|fresh raspberries|frozen raspberries', q: 'raspberries', d: ['Frozen', 'Fruit & Veg'] });
add('mixed-berries', 'Mixed berries', 'frozen', { a: 'frozen mixed berries|berries|frozen berries', q: 'berries mixed|mixed berries|berry mix', d: FROZEN });
add('pineapple', 'Pineapple', 'veg', { a: 'pineapples|fresh pineapple|pineapple chunks|pineapple rings|canned pineapple', q: 'pineapple', x: 'juice lumps', d: ['Fruit & Veg', 'Pantry'], ea: 1500 });
add('mango', 'Mango', 'veg', { a: 'mangoes|mangos|ripe mango', q: 'mango|mangoes', x: 'juice chutney', d: ['Fruit & Veg', 'Frozen'], ea: 300 });
add('coriander', 'Fresh coriander', 'veg', { a: 'coriander|cilantro|coriander leaves|fresh cilantro|chopped coriander|cilantro leaves|chopped cilantro', q: 'coriander', x: 'ground seed', d: VEG });
add('parsley', 'Fresh parsley', 'veg', { a: 'parsley|flat-leaf parsley|flat leaf parsley|italian parsley|chopped parsley|curly parsley|parsley leaves', q: 'parsley', x: 'dried', d: VEG });
add('basil', 'Fresh basil', 'veg', { a: 'basil|basil leaves|sweet basil|thai basil', q: 'basil', x: 'dried pesto', d: VEG });
add('mint', 'Fresh mint', 'veg', { a: 'mint|mint leaves|chopped mint', q: 'mint', x: 'sauce chocolate tea', d: VEG });
add('thyme', 'Thyme', 'pantry', { a: 'fresh thyme|dried thyme|thyme leaves|thyme sprigs', q: 'thyme', d: ['Fruit & Veg', 'Pantry'], staple: true, season: true });
add('rosemary', 'Rosemary', 'pantry', { a: 'fresh rosemary|dried rosemary|rosemary sprigs', q: 'rosemary', d: ['Fruit & Veg', 'Pantry'], season: true });
add('dill', 'Dill', 'veg', { a: 'fresh dill|dill weed', q: 'dill', x: 'pickle pickles', d: ['Fruit & Veg', 'Pantry'], season: true });
add('sage', 'Sage', 'pantry', { a: 'fresh sage|dried sage|sage leaves', q: 'sage', x: 'sausage', d: ['Fruit & Veg', 'Pantry'], season: true });
add('chives', 'Chives', 'veg', { a: 'chive|fresh chives|chopped chives', q: 'chives', d: ['Fruit & Veg', 'Pantry'], season: true });
add('lemongrass', 'Lemongrass', 'veg', { a: 'lemon grass|lemongrass stalk|lemongrass stalks', q: 'lemongrass', d: ['Fruit & Veg', 'Pantry'] });

add('kale', 'Kale', 'veg', { q: 'kale', d: VEG });
add('asparagus', 'Asparagus', 'veg', { q: 'asparagus', d: VEG });
add('bean-sprouts', 'Bean sprouts', 'veg', { a: 'beansprouts|bean sprout', q: 'bean sprouts|beansprouts|sprouts', d: VEG });
add('fennel', 'Fennel', 'veg', { a: 'fennel bulb', q: 'fennel', d: ['Fruit & Veg'] });
add('swede', 'Swede', 'veg', { a: 'swedes|turnip|turnips', q: 'swede|swedes|turnips', d: VEG, ea: 500 });

// ---- Meat
add('chicken-breast', 'Chicken breast', 'meat', { a: 'chicken breasts|boneless chicken breast|boneless chicken breasts|chicken breast fillets|chicken breast fillet|skinless chicken breast|skinless chicken breasts|boneless skinless chicken breasts|chicken fillets|cooked chicken breast|chicken breast halves', q: 'chicken breast', x: 'crumbed kiev tender smoked sliced shaved roast stuffed', d: MEAT, ea: 200, al: ['meat'], sub: 'chicken-thigh' });
add('chicken-thigh', 'Chicken thighs', 'meat', { a: 'chicken thigh|boneless chicken thighs|chicken thigh fillets|skinless chicken thighs|chicken thigh fillet|bone-in chicken thighs|boneless skinless chicken thighs', q: 'chicken thigh', x: 'crumbed', d: MEAT, ea: 120, al: ['meat'], sub: 'chicken-breast' });
add('chicken-drumstick', 'Chicken drumsticks', 'meat', { a: 'chicken drumstick|chicken legs|chicken leg|drumsticks', q: 'chicken drumsticks', d: MEAT, ea: 130, al: ['meat'] });
add('chicken-wings', 'Chicken wings', 'meat', { a: 'chicken wing', q: 'chicken wings', d: MEAT, ea: 90, al: ['meat'] });
add('chicken-whole', 'Whole chicken', 'meat', { a: 'chicken|whole chicken|roasting chicken|broiler|chickens|cooked chicken|chicken pieces|shredded chicken', q: 'chicken whole|whole chicken|chicken size', x: 'stock crumbed', d: MEAT, ea: 1600, al: ['meat'] });
add('chicken-mince', 'Chicken mince', 'meat', { a: 'minced chicken|ground chicken', q: 'chicken mince', d: MEAT, al: ['meat'] });
add('beef-mince', 'Beef mince', 'meat', { a: 'minced beef|ground beef|lean minced beef|lean ground beef|mince|beef mince lean|hamburger meat', q: 'beef mince', x: 'pie', d: MEAT, al: ['meat'], sub: 'lamb-mince|pork-mince' });
add('beef-steak', 'Beef steak', 'meat', { a: 'steak|steaks|sirloin steak|sirloin|rump steak|ribeye steak|rib eye steak|ribeye|fillet steak|beef fillet|sirloin steaks|flank steak|skirt steak|beef flank steak|porterhouse steak|t-bone', q: 'beef steak|beef rump|beef sirloin|beef scotch|beef porterhouse', d: MEAT, ea: 250, al: ['meat'] });
add('beef-stewing', 'Stewing beef', 'meat', { a: 'stewing beef|braising steak|chuck steak|beef chuck|beef stew meat|stew beef|diced beef|beef brisket|brisket|beef shin|beef|gravy beef|beef short ribs|beef cubes|beef stew', q: 'beef diced|beef casserole|beef stir fry|beef chuck|beef schnitzel', d: MEAT, al: ['meat'] });
add('lamb-mince', 'Lamb mince', 'meat', { a: 'minced lamb|ground lamb', q: 'lamb mince', d: MEAT, al: ['meat'] });
add('lamb', 'Lamb', 'meat', { a: 'lamb leg|leg of lamb|lamb shoulder|lamb chops|lamb shanks|lamb shank|lamb loin chops|diced lamb|lamb neck|lamb cutlets|rack of lamb|lamb chop', q: 'lamb leg|lamb chops|lamb shoulder|lamb diced|lamb shanks|lamb forequarter|lamb', x: 'mince sauce stock pet', d: MEAT, al: ['meat'] });
add('pork-mince', 'Pork mince', 'meat', { a: 'minced pork|ground pork', q: 'pork mince', d: MEAT, al: ['meat', 'pork'] });
add('pork', 'Pork', 'meat', { a: 'pork chops|pork chop|pork shoulder|pork loin|pork tenderloin|pork belly|pork steaks|pork fillet|pork leg|pork ribs|pork butt|spare ribs|ribs|diced pork|pork steak|pork medallions', q: 'pork chops|pork loin|pork shoulder|pork belly|pork steak|pork', x: 'mince sausages bacon crackle', d: MEAT, al: ['meat', 'pork'] });
add('bacon', 'Bacon', 'meat', { a: 'streaky bacon|back bacon|bacon rashers|rashers of bacon|smoked bacon|pancetta|lardons|bacon bits|bacon rasher|bacon slices|slices bacon', q: 'bacon', x: 'chips snack flavour', d: MEAT, ea: 30, al: ['meat', 'pork'] });
add('ham', 'Ham', 'meat', { a: 'cooked ham|sliced ham|ham hock|prosciutto|parma ham|gammon|smoked ham', q: 'ham', x: 'hamburger hamburgers champagne graham', d: MEAT, ea: 25, al: ['meat', 'pork'] });
add('sausage', 'Sausages', 'meat', { a: 'sausage|pork sausages|beef sausages|italian sausage|italian sausages|chorizo|chorizo sausage|smoked sausage|cumberland sausage', q: 'sausages|chorizo', x: 'roll', d: MEAT, ea: 80, al: ['meat'] });

// ---- Seafood
add('salmon', 'Salmon', 'meat', { a: 'salmon fillet|salmon fillets|fresh salmon|smoked salmon', q: 'salmon fillet|salmon', x: 'pet cat pink red sensations tin smoked', d: FISH, ea: 180, al: ['fish'] });
add('white-fish', 'White fish fillets', 'meat', { a: 'white fish|fish fillets|fish fillet|cod|cod fillets|cod fillet|haddock|haddock fillets|hake|tilapia|snapper|red snapper|sea bass|bass|monkfish|halibut|hoki|tarakihi|fish|sole|mackerel|mackerel fillets|sea bream|trout|fresh fish', q: 'fish fillets|hoki|tarakihi|fish fresh', x: 'crumbed battered oil pet', d: FISH, ea: 150, al: ['fish'] });
add('prawn', 'Prawns', 'meat', { a: 'prawns|shrimp|shrimps|king prawns|raw prawns|tiger prawns|jumbo shrimp', q: 'prawns', d: FISH, ea: 15, al: ['shellfish'] });
add('tuna-can', 'Canned tuna', 'pantry', { a: 'tuna|tinned tuna|tuna in water|tuna in brine|canned tuna|can tuna', q: 'tuna', x: 'pet cat fancy', d: PANTRY, al: ['fish'] });
add('mussel', 'Mussels', 'meat', { a: 'mussels|greenshell mussels', q: 'mussels', d: FISH, ea: 30, al: ['shellfish'] });
add('anchovy', 'Anchovies', 'pantry', { a: 'anchovy|anchovy fillets|anchovies', q: 'anchovies|anchovy', d: PANTRY, ea: 4, al: ['fish'] });

// ---- Dairy & eggs
add('egg', 'Eggs', 'dairy', { a: 'egg|eggs|large eggs|large egg|free-range egg|free range eggs|egg yolk|egg yolks|egg white|egg whites|beaten egg|medium eggs|hard-boiled eggs|egg yolks|yolk|yolks|whole egg', q: 'eggs', x: 'chocolate easter mayonnaise pasta spaghetti tagliatelle fettuccine', d: ['Fridge & Deli', 'Pantry'], ea: 55, al: ['egg'] });
add('butter', 'Butter', 'dairy', { a: 'butter or margarine|unsalted butter|salted butter|melted butter|softened butter|cold butter|butter softened', q: 'butter', x: 'peanut nut garlic chicken cookie cookies almond spreadable shortbread', d: DAIRY, rho: 0.96, al: ['dairy'], staple: true });
add('milk', 'Milk', 'dairy', { a: 'whole milk|full cream milk|semi-skimmed milk|skim milk|skimmed milk|2% milk|full-fat milk|warm milk|cold milk', q: 'milk standard|milk fresh|milk', x: 'coconut almond soy oat chocolate condensed evaporated powder flavoured biscuit chocolate caramel', d: DAIRY, rho: 1.03, al: ['dairy'], staple: true });
add('cream', 'Cream', 'dairy', { a: 'double cream|heavy cream|whipping cream|thickened cream|single cream|heavy whipping cream|fresh cream|pouring cream|light cream', q: 'cream fresh|cream', x: 'sour ice cheese coconut sweet biscuit biscuits milk whip whipped', d: DAIRY, rho: 1.0, al: ['dairy'] });
add('sour-cream', 'Sour cream', 'dairy', { a: 'soured cream|creme fraiche|crème fraîche|creme fraîche', q: 'sour cream', d: DAIRY, rho: 1.0, al: ['dairy'] });
add('yoghurt', 'Yoghurt', 'dairy', { a: 'yogurt|plain yogurt|natural yogurt|greek yogurt|greek yoghurt|natural yoghurt|plain yoghurt', q: 'yoghurt greek|yoghurt natural|yoghurt plain|yoghurt', x: 'kids squeezy berry strawberry vanilla', d: DAIRY, rho: 1.03, al: ['dairy'] });
add('cheddar', 'Cheddar cheese', 'dairy', { a: 'cheddar|tasty cheese|grated cheese|cheese|mature cheddar|sharp cheddar|shredded cheese|grated cheddar|cheddar cheese|shredded cheddar|colby|edam|cheese slices|american cheese|monterey jack|monterey jack cheese', q: 'cheese tasty|cheese colby|cheese edam|cheddar', x: 'cream sauce snack crackers', d: DAIRY, al: ['dairy'], staple: false });
add('parmesan', 'Parmesan', 'dairy', { a: 'parmesan cheese|parmigiano reggiano|parmigiano-reggiano|grana padano|grated parmesan|pecorino|pecorino romano|pecorino cheese|parmesan shavings', q: 'parmesan', d: DAIRY, al: ['dairy'] });
add('mozzarella', 'Mozzarella', 'dairy', { a: 'mozzarella cheese|fresh mozzarella|mozzarella balls|buffalo mozzarella|grated mozzarella', q: 'mozzarella', d: DAIRY, al: ['dairy'] });
add('feta', 'Feta', 'dairy', { a: 'feta cheese|crumbled feta', q: 'feta', d: DAIRY, al: ['dairy'] });
add('cream-cheese', 'Cream cheese', 'dairy', { a: 'soft cheese|philadelphia|full-fat soft cheese|mascarpone|ricotta|ricotta cheese|cottage cheese|mascarpone cheese', q: 'cream cheese|ricotta|cottage cheese', x: 'dip crackers', d: DAIRY, al: ['dairy'], rho: 1.0 });
add('coconut-milk', 'Coconut milk', 'pantry', { a: 'coconut cream|can coconut milk|tin coconut milk|canned coconut milk|tinned coconut milk', q: 'coconut milk|coconut cream', x: 'drink almond chocolate', d: PANTRY, rho: 1.0 });

add('buttermilk', 'Buttermilk', 'dairy', { q: 'buttermilk', d: DAIRY, rho: 1.03, al: ['dairy'] });
add('margarine', 'Margarine', 'dairy', { a: 'shortening|vegetable shortening|lard|ghee|dripping', q: 'margarine|table spread|kremelta|lard|ghee', d: DAIRY, rho: 0.95 });

// ---- Bakery & grains
add('bread', 'Bread', 'bakery', { a: 'white bread|wholemeal bread|sliced bread|bread slices|slices of bread|slice of bread|bread rolls|baguette|french bread|crusty bread|sourdough|ciabatta|buns|burger buns|hamburger buns|hot dog buns|rolls|bread loaf|sandwich bread|toast', q: 'bread white|bread toast|bread|baguette', x: 'crumbs mix garlic flour rolls', d: BAKERY, ea: 35, al: ['gluten'] });
add('breadcrumbs', 'Breadcrumbs', 'pantry', { a: 'bread crumbs|panko|panko breadcrumbs|dried breadcrumbs|fresh breadcrumbs|dry breadcrumbs', q: 'breadcrumbs|bread crumbs|panko', d: ['Pantry'], al: ['gluten'], rho: 0.4 });
add('tortilla', 'Tortillas', 'bakery', { a: 'tortilla|flour tortillas|corn tortillas|wraps|tortilla wraps|flour tortilla|taco shells', q: 'tortillas|wraps', x: 'chips', d: ['Pantry', 'Bakery', 'Fridge & Deli'], ea: 40, al: ['gluten'] });
add('pita', 'Pita bread', 'bakery', { a: 'pitta bread|pitas|pita|pittas|naan|naan bread|flatbread|flatbreads', q: 'pita|naan|flatbread', d: BAKERY, ea: 70, al: ['gluten'] });
add('puff-pastry', 'Puff pastry', 'frozen', { a: 'pastry|shortcrust pastry|short crust pastry|ready-rolled puff pastry|filo pastry|filo|phyllo|puff pastry sheets|pie crust|pie shell|ready rolled puff pastry|all-butter puff pastry', q: 'pastry puff|puff pastry|pastry', d: ['Frozen', 'Fridge & Deli'], al: ['gluten'] });
add('flour', 'Plain flour', 'pantry', { a: 'flour|plain flour|all-purpose flour|all purpose flour|white flour|bread flour|strong white bread flour|high grade flour|strong flour|strong white flour|00 flour|wholemeal flour|whole wheat flour', q: 'flour plain|plain flour|flour', x: 'corn rice almond self coconut', d: PANTRY, rho: 0.53, al: ['gluten'], staple: true });
add('self-raising-flour', 'Self-raising flour', 'pantry', { a: 'self raising flour|self-rising flour|self rising flour', q: 'flour self raising|self raising flour', d: PANTRY, rho: 0.53, al: ['gluten'] });
add('cornflour', 'Cornflour', 'pantry', { a: 'cornstarch|corn starch|corn flour', q: 'cornflour|corn flour', d: PANTRY, rho: 0.54 });
add('rice', 'White rice', 'pantry', { a: 'rice|long grain rice|long-grain rice|basmati rice|jasmine rice|white rice|cooked rice|brown rice|sushi rice|sticky rice|long grain white rice|long grain rice', q: 'rice long grain|rice basmati|rice jasmine|rice', x: 'crackers noodles flour bran paper wine vinegar milk pudding creamed', d: PANTRY, rho: 0.85 });
add('arborio', 'Arborio rice', 'pantry', { a: 'arborio|risotto rice|carnaroli rice', q: 'arborio rice|rice arborio|risotto rice|arborio', d: PANTRY, rho: 0.85 });
add('pasta', 'Pasta', 'pantry', { a: 'farfalle|bow-tie pasta|small pasta|dried pasta|paccheri pasta|lasagna|lasagne|egg noodle pasta', q: 'pasta|penne|fusilli|macaroni', x: 'sauce instant cup tortellini ravioli gnocchi fresh', d: PANTRY, al: ['gluten'], staple: false });
// Shapes and filled pastas get their own entries: tortellini is not a bag of spirals.
const FRESH_PASTA = ['Fridge & Deli', 'Pantry', 'Dinner'];
add('tortellini', 'Tortellini', 'dairy', { a: 'tortellini|fresh tortellini|cheese tortellini|tortelloni', q: 'tortellini|tortelloni|pasta tortellini|pasta tortelloni', x: 'sauce', d: FRESH_PASTA, al: ['gluten', 'egg', 'dairy'] });
add('ravioli', 'Ravioli', 'dairy', { a: 'ravioli|fresh ravioli', q: 'ravioli|pasta ravioli', x: 'sauce', d: FRESH_PASTA, al: ['gluten', 'egg', 'dairy'] });
add('gnocchi', 'Gnocchi', 'pantry', { a: 'gnocchi|potato gnocchi', q: 'gnocchi|pasta gnocchi', x: 'sauce', d: FRESH_PASTA, al: ['gluten'] });
add('macaroni', 'Macaroni', 'pantry', { a: 'macaroni|elbow macaroni|elbow pasta|elbows|macaroni pasta', q: 'macaroni|pasta elbows|pasta macaroni', x: 'cheese sauce cup instant hoops', d: PANTRY, al: ['gluten'] });
add('penne', 'Penne', 'pantry', { a: 'penne|penne pasta|penne rigate|ziti', q: 'penne|pasta penne', x: 'sauce instant cup', d: PANTRY, al: ['gluten'] });
add('fusilli', 'Spirals (fusilli)', 'pantry', { a: 'fusilli|spirals|pasta spirals|spiral pasta|rotini', q: 'spirals|fusilli|pasta spirals|pasta fusilli', x: 'sauce instant cup', d: PANTRY, al: ['gluten'] });
add('fettuccine', 'Fettuccine or linguine', 'pantry', { a: 'fettuccine|fettucine|tagliatelle|linguine|linguine pasta|pappardelle', q: 'fettuccine|linguine|tagliatelle|fettucine|pasta fettuccine|pasta linguine|pasta tagliatelle|pasta fettucine', x: 'sauce instant cup alfredo', d: FRESH_PASTA, al: ['gluten'] });
add('pasta-shells', 'Pasta shells', 'pantry', { a: 'conchiglie|pasta shells|shells|shell pasta|small shells', q: 'pasta shells|shells', x: 'sauce instant cup taco chocolate guylian', d: PANTRY, al: ['gluten'] });
add('rigatoni', 'Rigatoni', 'pantry', { a: 'rigatoni', q: 'rigatoni|pasta rigatoni', x: 'sauce', d: PANTRY, al: ['gluten'] });
add('orzo', 'Orzo (risoni)', 'pantry', { a: 'orzo|risoni', q: 'risoni|orzo|pasta risoni|pasta orzo', x: 'sauce', d: PANTRY, al: ['gluten'] });
add('spaghetti', 'Spaghetti', 'pantry', { a: 'dried spaghetti|spaghetti pasta|bucatini|angel hair pasta', q: 'pasta spaghetti|spaghetti', x: 'sauce canned tin hoops watties wattie cheesy', d: PANTRY, al: ['gluten'] });
add('lasagne-sheets', 'Lasagne sheets', 'pantry', { a: 'lasagne sheet|lasagna sheets|lasagna noodles|lasagne noodles|lasagne pasta|lasagna sheet', q: 'pasta lasagne|lasagne sheets|lasagne|lasagna', d: PANTRY, al: ['gluten'] });
add('noodles', 'Noodles', 'pantry', { a: 'egg noodles|rice noodles|udon noodles|soba noodles|vermicelli|rice vermicelli|vermicelli noodles|noodle|ramen noodles|ramen|chow mein noodles|thin rice noodles|flat rice noodles', q: 'noodles', x: 'instant cup snack', d: PANTRY, al: ['gluten'] });
add('couscous', 'Couscous', 'pantry', { a: 'cous cous', q: 'couscous|cous cous', d: PANTRY, al: ['gluten'], rho: 0.7 });
add('oats', 'Rolled oats', 'pantry', { a: 'oats|porridge oats|oatmeal|quick oats|rolled oat', q: 'oats', x: 'milk bar', d: PANTRY, rho: 0.4, al: ['gluten'] });
add('quinoa', 'Quinoa', 'pantry', { a: 'white quinoa', q: 'quinoa', d: PANTRY, rho: 0.75 });
add('polenta', 'Polenta', 'pantry', { a: 'cornmeal|corn meal|maize meal|semolina|fine semolina', q: 'polenta|semolina|cornmeal', d: PANTRY, rho: 0.65 });

// ---- Tins & legumes
add('tomato-can', 'Canned tomatoes', 'pantry', { a: 'tomato sauce|chopped tomatoes|tinned tomatoes|canned tomatoes|can tomatoes|tin tomatoes|tin chopped tomatoes|can chopped tomatoes|diced tomatoes|plum tomatoes canned|crushed tomatoes|can diced tomatoes|canned chopped tomatoes|tinned chopped tomatoes|tomato passata|passata|tomato sauce can|chopped tomatoes tin|san marzano tomatoes|tomato puree can', q: 'tomatoes chopped|tomatoes diced|tomatoes crushed|tomatoes peeled|passata', x: 'sun fresh', d: PANTRY, ea: 400, rho: 1.03 });
add('tomato-paste', 'Tomato paste', 'pantry', { a: 'tomato puree|tomato purée|concentrated tomato paste|tomato concentrate', q: 'tomato paste', d: PANTRY, rho: 1.1, staple: true });
add('tomato-sauce', 'Tomato sauce (ketchup)', 'pantry', { a: 'ketchup|tomato ketchup|catsup', q: 'tomato sauce', x: 'pasta', d: PANTRY, rho: 1.1 });
add('kidney-beans', 'Kidney beans', 'pantry', { a: 'kidney bean|red kidney beans|can kidney beans|tin kidney beans|tinned kidney beans', q: 'kidney beans|beans kidney', d: PANTRY, ea: 400 });
add('black-beans', 'Black beans', 'pantry', { a: 'black bean|can black beans|black turtle beans', q: 'black beans|beans black', d: PANTRY, ea: 400 });
add('white-beans', 'White beans', 'pantry', { a: 'cannellini beans|butter beans|haricot beans|navy beans|white beans|great northern beans|lima beans|mixed beans|cannellini bean|baked beans', q: 'cannellini|butter beans|beans mixed|mixed beans|baked beans', d: PANTRY, ea: 400 });
add('chickpeas', 'Chickpeas', 'pantry', { a: 'chickpea|garbanzo beans|chick peas|can chickpeas|tin chickpeas|canned chickpeas', q: 'chickpeas|chick peas', x: 'snack crisps', d: PANTRY, ea: 400 });
add('lentils', 'Lentils', 'pantry', { a: 'lentil|red lentils|green lentils|brown lentils|puy lentils|dried lentils|split peas|yellow split peas', q: 'lentils', x: 'chips snack', d: PANTRY, rho: 0.8 });
add('stock-chicken', 'Chicken stock', 'pantry', { a: 'chicken stock|chicken broth|chicken stock cube|chicken stock cubes|chicken bouillon|low-sodium chicken broth|hot chicken stock|chicken stock cube', q: 'chicken stock|stock chicken', d: PANTRY, rho: 1, al: ['meat'] });
add('stock-beef', 'Beef stock', 'pantry', { a: 'beef stock|beef broth|beef stock cube|beef stock cubes|beef bouillon|hot beef stock|beef consomme', q: 'beef stock|stock beef', d: PANTRY, rho: 1, al: ['meat'] });
add('stock-veg', 'Vegetable stock', 'pantry', { a: 'vegetable stock|vegetable broth|vegetable stock cube|vegetable stock cubes|stock|stock cube|stock cubes|hot vegetable stock|veg stock|veggie stock|broth', q: 'vegetable stock|stock vegetable', d: PANTRY, rho: 1 });
add('olives', 'Olives', 'pantry', { a: 'black olives|green olives|kalamata olives|olive', q: 'olives', d: PANTRY });
add('capers', 'Capers', 'pantry', { a: 'caper', q: 'capers', d: PANTRY });
add('pickles', 'Gherkins', 'pantry', { a: 'gherkin|gherkins|pickle|pickles|dill pickles|dill pickle|sweet pickle relish|cornichons', q: 'gherkins|pickles', d: PANTRY });

// ---- Oils, sauces, condiments
add('olive-oil', 'Olive oil', 'pantry', { a: 'extra virgin olive oil|extra-virgin olive oil|light olive oil|good olive oil|virgin olive oil', q: 'olive oil|oil olive', x: 'spray', d: PANTRY, rho: 0.92, staple: true });
add('veg-oil', 'Vegetable oil', 'pantry', { a: 'oil|vegetable oil|sunflower oil|canola oil|rapeseed oil|cooking oil|groundnut oil|peanut oil|neutral oil|corn oil|oil for frying|oil for deep frying|rice bran oil', q: 'canola oil|vegetable oil|sunflower oil|oil canola|oil vegetable|oil sunflower', x: 'spray', d: PANTRY, rho: 0.92, staple: true });
add('sesame-oil', 'Sesame oil', 'pantry', { a: 'toasted sesame oil', q: 'sesame oil', d: PANTRY, rho: 0.92, al: ['sesame'] });
add('soy-sauce', 'Soy sauce', 'pantry', { a: 'soya sauce|dark soy sauce|light soy sauce|low-sodium soy sauce|dark soy|light soy|soy|tamari|kecap manis', q: 'soy sauce', d: PANTRY, rho: 1.1, al: ['soy', 'gluten'], staple: true });
add('fish-sauce', 'Fish sauce', 'pantry', { a: 'nam pla|thai fish sauce', q: 'fish sauce', d: PANTRY, rho: 1.2, al: ['fish'] });
add('oyster-sauce', 'Oyster sauce', 'pantry', { a: 'hoisin sauce|hoisin', q: 'oyster sauce|hoisin', d: PANTRY, rho: 1.2, al: ['shellfish'] });
add('worcestershire', 'Worcestershire sauce', 'pantry', { a: 'worcester sauce|worcestershire', q: 'worcestershire sauce|worcester sauce|worcestershire', d: PANTRY, rho: 1.1, al: ['fish'] });
add('mustard', 'Mustard', 'pantry', { a: 'dijon mustard|wholegrain mustard|english mustard|yellow mustard|whole grain mustard|dijon|mustard powder|dry mustard|mustard seeds|mustard seed|american mustard', q: 'mustard', d: PANTRY, rho: 1.05 });
add('mayonnaise', 'Mayonnaise', 'pantry', { a: 'mayo', q: 'mayonnaise', d: PANTRY, rho: 0.95, al: ['egg'] });
add('vinegar-white', 'White vinegar', 'pantry', { a: 'vinegar|white vinegar|malt vinegar|distilled vinegar|cider vinegar|apple cider vinegar|rice vinegar|rice wine vinegar', q: 'vinegar', x: 'balsamic wine', d: PANTRY, rho: 1, staple: true });
add('vinegar-wine', 'Wine vinegar', 'pantry', { a: 'red wine vinegar|white wine vinegar|sherry vinegar|wine vinegar', q: 'wine vinegar|vinegar wine', d: PANTRY, rho: 1 });
add('balsamic', 'Balsamic vinegar', 'pantry', { a: 'balsamic|balsamic glaze', q: 'balsamic', d: PANTRY, rho: 1.1 });
add('sweet-chilli', 'Sweet chilli sauce', 'pantry', { a: 'chilli sauce|hot sauce|sriracha|tabasco|tabasco sauce|hot chili sauce|chili sauce|peri peri sauce|sweet chili sauce|buffalo sauce', q: 'chilli sauce|sriracha', d: PANTRY, rho: 1.15 });
add('curry-paste', 'Curry paste', 'pantry', { a: 'red curry paste|thai red curry paste|green curry paste|thai green curry paste|tikka paste|tikka masala paste|korma paste|massaman curry paste', q: 'curry paste', d: PANTRY, rho: 1.1 });
add('pesto', 'Pesto', 'pantry', { a: 'basil pesto|green pesto|red pesto', q: 'pesto', d: ['Pantry', 'Fridge & Deli'], rho: 1, al: ['dairy', 'nuts'] });
add('honey', 'Honey', 'pantry', { a: 'runny honey|clear honey', q: 'honey', x: 'mustard snack bee cereal soy', d: PANTRY, rho: 1.42 });
add('maple-syrup', 'Maple syrup', 'pantry', { a: 'golden syrup|treacle|molasses|black treacle|pure maple syrup|corn syrup', q: 'maple syrup|golden syrup|syrup', d: PANTRY, rho: 1.35 });
add('peanut-butter', 'Peanut butter', 'pantry', { a: 'smooth peanut butter|crunchy peanut butter', q: 'peanut butter', x: 'bar slice chocolate', d: PANTRY, rho: 1.05, al: ['nuts'] });
add('jam', 'Jam', 'pantry', { a: 'strawberry jam|raspberry jam|apricot jam|apricot preserves|marmalade|seedless raspberry jam', q: 'jam', d: PANTRY, rho: 1.3 });

// ---- Baking
add('sugar', 'Sugar', 'pantry', { a: 'white sugar|granulated sugar|caster sugar|superfine sugar|golden caster sugar|castor sugar|raw sugar|demerara sugar', q: 'sugar white|sugar caster|sugar', x: 'brown icing free snap cane soft syrup', d: PANTRY, rho: 0.85, staple: true });
add('brown-sugar', 'Brown sugar', 'pantry', { a: 'soft brown sugar|light brown sugar|dark brown sugar|dark soft brown sugar|light brown soft sugar|muscovado sugar|muscovado|palm sugar|packed brown sugar|dark muscovado sugar', q: 'sugar brown|brown sugar', d: PANTRY, rho: 0.83 });
add('icing-sugar', 'Icing sugar', 'pantry', { a: 'confectioners sugar|powdered sugar|confectioners\' sugar|icing sugar', q: 'icing sugar|sugar icing', d: PANTRY, rho: 0.56 });
add('baking-powder', 'Baking powder', 'pantry', { q: 'baking powder', d: PANTRY, rho: 0.9, staple: true, season: true });
add('baking-soda', 'Baking soda', 'pantry', { a: 'bicarbonate of soda|bicarb soda|bicarb|baking soda|soda bicarbonate', q: 'baking soda', d: PANTRY, rho: 0.9, staple: true, season: true });
add('yeast', 'Yeast', 'pantry', { a: 'dried yeast|active dry yeast|fast action yeast|instant yeast|dry yeast|fast-action dried yeast', q: 'yeast', d: PANTRY, rho: 0.6, season: true });
add('vanilla', 'Vanilla essence', 'pantry', { a: 'vanilla extract|vanilla essence|vanilla|vanilla bean|vanilla pod|vanilla bean paste', q: 'vanilla essence|vanilla extract', d: PANTRY, rho: 1, staple: true, season: true });
add('cocoa', 'Cocoa powder', 'pantry', { a: 'cocoa|unsweetened cocoa powder|cocoa powder|dark cocoa powder', q: 'cocoa', d: PANTRY, rho: 0.45 });
add('chocolate', 'Chocolate', 'pantry', { a: 'dark chocolate|milk chocolate|white chocolate|chocolate chips|dark chocolate chips|plain chocolate|cooking chocolate|semisweet chocolate|bittersweet chocolate', q: 'chocolate dark|chocolate chips|chocolate baking|chocolate', d: PANTRY, al: ['dairy'], x: 'biscuits drink milk nougat' });
add('condensed-milk', 'Condensed milk', 'pantry', { a: 'sweetened condensed milk|evaporated milk|can condensed milk', q: 'condensed milk|evaporated milk|milk condensed', d: PANTRY, rho: 1.3, al: ['dairy'] });
add('gelatine', 'Gelatine', 'pantry', { a: 'gelatin|gelatine leaves|gelatine', q: 'gelatine', d: PANTRY, season: true });
add('desiccated-coconut', 'Desiccated coconut', 'pantry', { a: 'shredded coconut|coconut|flaked coconut|coconut flakes', q: 'coconut desiccated|desiccated coconut|coconut shredded|coconut thread', d: PANTRY, rho: 0.35 });
add('raisins', 'Raisins', 'pantry', { a: 'sultanas|raisin|currants|dried fruit|mixed dried fruit|dried apricots|dates|medjool dates|dried cranberries|mixed peel', q: 'raisins|sultanas|dates|apricots dried', d: PANTRY, rho: 0.6 });
add('almonds', 'Almonds', 'pantry', { a: 'almond|flaked almonds|ground almonds|slivered almonds|almond meal|blanched almonds|almond flour', q: 'almonds', x: 'milk chocolate', d: PANTRY, rho: 0.5, al: ['nuts'] });
add('walnuts', 'Walnuts', 'pantry', { a: 'walnut|pecans|pecan|pecan nuts|walnut halves|hazelnuts|hazelnut|mixed nuts|pistachios|macadamia nuts', q: 'walnuts|pecans|hazelnuts|mixed nuts', d: PANTRY, rho: 0.5, al: ['nuts'] });
add('cashews', 'Cashews', 'pantry', { a: 'cashew|cashew nuts|peanuts|roasted peanuts|peanut|unsalted peanuts|pine nuts|pine nut', q: 'cashews|peanuts|pine nuts', x: 'butter chocolate', d: PANTRY, rho: 0.55, al: ['nuts'] });
add('sesame-seeds', 'Sesame seeds', 'pantry', { a: 'sesame seed|toasted sesame seeds|poppy seeds|tahini|sunflower seeds|pumpkin seeds', q: 'sesame seeds|tahini|seeds sesame', d: PANTRY, rho: 0.6, al: ['sesame'], season: true });
add('tofu', 'Tofu', 'dairy', { a: 'firm tofu|silken tofu|extra firm tofu|tempeh', q: 'tofu', d: ['Fridge & Deli', 'Pantry'], al: ['soy'] });

// ---- Spices & seasoning
const sp = (id: string, name: string, a?: string, q?: string, staple = false) =>
  add(id, name, 'pantry', { a, q: q ?? name.toLowerCase(), d: PANTRY, season: true, staple, rho: 0.5 });
add('salt', 'Salt', 'pantry', { a: 'sea salt|table salt|kosher salt|flaky sea salt|rock salt|coarse salt|fine sea salt|sea salt flakes|flaky salt|himalayan salt|salt to taste', q: 'salt', x: 'garlic celery chips', d: PANTRY, season: true, staple: true, rho: 1.2 });
add('pepper', 'Black pepper', 'pantry', { a: 'pepper|black pepper|ground black pepper|freshly ground black pepper|cracked black pepper|white pepper|peppercorns|black peppercorns|salt and pepper|salt & pepper|freshly ground pepper|sichuan peppercorns', q: 'pepper black|black pepper|pepper', x: 'capsicum chilli steak', d: PANTRY, season: true, staple: true, rho: 0.5 });
sp('cumin', 'Ground cumin', 'cumin|cumin seeds|cumin powder|cumin seed', 'cumin', false);
sp('ground-coriander', 'Ground coriander', 'coriander seeds|coriander powder|coriander seed', 'coriander ground|ground coriander');
sp('turmeric', 'Turmeric', 'ground turmeric|turmeric powder', 'turmeric');
sp('paprika', 'Paprika', 'smoked paprika|sweet paprika|hot paprika|ground paprika', 'paprika');
sp('chilli-powder', 'Chilli powder', 'chili powder|cayenne pepper|cayenne|chilli flakes|red pepper flakes|chili flakes|crushed red pepper|red chilli powder|kashmiri chilli powder|red chili flakes|dried chilli|dried chillies', 'chilli powder|chilli flakes|cayenne');
sp('curry-powder', 'Curry powder', 'mild curry powder|medium curry powder', 'curry powder');
sp('garam-masala', 'Garam masala', 'garam masala powder', 'garam masala');
sp('cinnamon', 'Cinnamon', 'ground cinnamon|cinnamon stick|cinnamon sticks', 'cinnamon');
sp('nutmeg', 'Nutmeg', 'ground nutmeg|freshly grated nutmeg|grated nutmeg', 'nutmeg');
sp('ginger-ground', 'Ground ginger', 'ginger powder|dried ginger', 'ginger ground|ground ginger');
sp('mixed-spice', 'Mixed spice', 'allspice|ground allspice|cloves ground|ground cloves|mixed spice|cardamom|cardamom pods|green cardamom|ground cardamom|star anise|fennel seeds|fennel seed|fenugreek|whole cloves', 'mixed spice|allspice|cloves|cardamom');
sp('oregano', 'Dried oregano', 'oregano|dried oregano|fresh oregano|marjoram|italian seasoning|dried basil|dried herbs|mixed herbs|dried mixed herbs|dried parsley', 'oregano|mixed herbs', false);
sp('saffron', 'Saffron', 'saffron threads', 'saffron');
sp('cream-of-tartar', 'Cream of tartar', undefined, 'cream of tartar');
sp('caraway', 'Caraway seeds', 'caraway seed|caraway', 'caraway');
sp('bay-leaf', 'Bay leaves', 'bay leaf|bay leaves|dried bay leaves', 'bay leaves');
sp('garlic-powder', 'Garlic powder', 'granulated garlic|garlic granules', 'garlic powder|garlic granules');
sp('onion-powder', 'Onion powder', 'onion flakes|dried onion', 'onion powder|onion flakes');

// ---- Drinks used for cooking, freebies
add('water', 'Water', 'other', { a: 'cold water|warm water|hot water|boiling water|ice|ice cubes|ice water|lukewarm water|tepid water|iced water', free: true, staple: true, q: 'water__none', rho: 1, season: true });
add('wine-white', 'White wine', 'other', { a: 'dry white wine|white wine|cooking wine|vermouth|shaoxing wine|sake|mirin|rice wine', q: 'sauvignon blanc|chardonnay', d: ['Beer & Wine'], rho: 1, al: ['alcohol'] });
add('wine-red', 'Red wine', 'other', { a: 'dry red wine|red wine|port|madeira|sherry|dry sherry', q: 'merlot|pinot noir', d: ['Beer & Wine'], rho: 1, al: ['alcohol'] });
add('beer', 'Beer', 'other', { a: 'lager|ale|stout|dark beer|guinness|brandy|rum|dark rum|whisky|whiskey|vodka|tequila|cognac', q: 'beer lager|lager', d: ['Beer & Wine'], rho: 1, al: ['alcohol'] });

// Kitchen conversions for chopped or volume-measured ingredients (g per ml), item weights,
// and what one "each" means on the shelf where it differs from the recipe's (garlic: clove vs bulb).
// Citrus density is a juice yield: about 40 ml from a 120 g lemon.
const EXTRA: Record<string, { rho?: number; ea?: number; shelfEa?: number }> = {
  lemon: { rho: 3 }, lime: { rho: 2.3 }, orange: { rho: 2.5 },
  parsley: { rho: 0.16 }, coriander: { rho: 0.16 }, basil: { rho: 0.1 }, mint: { rho: 0.1 }, dill: { rho: 0.1 }, chives: { rho: 0.2 },
  rosemary: { rho: 0.3 }, thyme: { rho: 0.3 }, sage: { rho: 0.2 }, capsicum: { rho: 0.6 }, 'capsicum-red': { rho: 0.6 }, onion: { rho: 0.6 }, 'red-onion': { rho: 0.6 },
  shallot: { rho: 0.6 }, ginger: { rho: 0.5 }, garlic: { rho: 0.6, shelfEa: 50 }, 'spring-onion': { rho: 0.4, shelfEa: 150 }, celery: { rho: 0.5, shelfEa: 600 },
  carrot: { rho: 0.5 }, tomato: { rho: 0.7 }, 'cherry-tomato': { rho: 0.6 }, mushroom: { rho: 0.3, ea: 20 }, potato: { rho: 0.6 }, 'sweet-potato': { rho: 0.6 }, corn: { rho: 0.65 },
  parmesan: { rho: 0.4 }, cheddar: { rho: 0.45 }, mozzarella: { rho: 0.45 }, feta: { rho: 0.6 }, chocolate: { rho: 0.7 }, pasta: { rho: 0.4 }, spaghetti: { rho: 0.4 }, chilli: { rho: 0.4 },
  spinach: { rho: 0.15 }, lettuce: { rho: 0.2 }, cabbage: { rho: 0.35 }, cucumber: { rho: 0.55 }, courgette: { rho: 0.55 }, broccoli: { rho: 0.4 }, cauliflower: { rho: 0.45 }, pumpkin: { rho: 0.55 },
  'green-beans': { rho: 0.5 }, leek: { rho: 0.4 }, apple: { rho: 0.55 }, banana: { rho: 0.65 }, strawberry: { rho: 0.6 }, blueberry: { rho: 0.6 }, raspberry: { rho: 0.5 }, 'mixed-berries': { rho: 0.6 },
  'bay-leaf': { ea: 0.2 }, cinnamon: { ea: 3 }, 'mixed-spice': { ea: 1 }, pork: { ea: 200 }, lamb: { ea: 200 }, 'puff-pastry': { ea: 200 }, 'stock-chicken': { ea: 250 }, 'stock-beef': { ea: 250 }, 'stock-veg': { ea: 250 },
  lemongrass: { ea: 30 }, 'beef-stewing': { ea: 200 }, 'white-beans': { rho: 0.7 }, 'kidney-beans': { rho: 0.7 }, 'black-beans': { rho: 0.7 }, chickpeas: { rho: 0.7 }, 'chicken-breast': { rho: 0.6 }, 'chicken-whole': { rho: 0.6 }, ham: { rho: 0.5 }, bacon: { rho: 0.5 },
};
for (const c of out) {
  const e = EXTRA[c.id];
  if (!e) continue;
  c.density = e.rho ?? c.density;
  c.eachGrams = e.ea ?? c.eachGrams;
  c.shelfEachGrams = e.shelfEa;
}

export const CANONICAL_INGREDIENTS: CanonicalIngredient[] = out;
