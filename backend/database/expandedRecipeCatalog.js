const PANTRY = {
  slowSoup: [['water or unsalted stock', '2.5 L'], ['fine salt', '1 tsp, then to taste']],
  quickSoup: [['low-sodium stock', '1.5 L'], ['neutral oil', '1 tbsp']],
  wok: [['neutral oil', '2 tbsp'], ['garlic', '3 cloves, minced']],
  riceBowl: [['neutral oil', '1 tbsp'], ['fine salt', '1/2 tsp']],
  braise: [['neutral oil', '2 tbsp'], ['water or stock', '500 ml']],
  noodle: [['water for boiling', '3 L'], ['fine salt', '1 tsp']],
  sandwich: [['neutral oil or butter', '1 tbsp'], ['fine salt', '1/4 tsp']],
  curry: [['neutral oil', '2 tbsp'], ['water or stock', '400 ml']],
  salad: [['extra-virgin olive oil', '2 tbsp'], ['fine salt', '1/2 tsp']],
  bake: [['neutral oil', '1 tbsp for the pan'], ['fine salt', '1/2 tsp']],
  grill: [['neutral oil', '1 tbsp'], ['fine salt', '1/2 tsp']],
  skillet: [['neutral oil', '1 tbsp'], ['fine salt', '1/2 tsp']],
  steamed: [['water for steaming', '1.5 L'], ['fine salt', '1/2 tsp']],
  fried: [['neutral frying oil', '750 ml'], ['fine salt', '1/2 tsp']],
  roast: [['neutral oil', '2 tbsp'], ['fine salt', '1/2 tsp']],
  stew: [['water or stock', '750 ml'], ['neutral oil', '1 tbsp']],
  dessertBake: [['unsalted butter', '30 g for the pan'], ['fine salt', '1/4 tsp']],
  dessertChill: [['fine salt', '1 pinch'], ['cold water', '2 tbsp']],
  dessertCook: [['fine salt', '1 pinch'], ['water', '250 ml']],
  drink: [['ice cubes', '2 cups'], ['cold water', '250 ml']],
}

const PROFILE = {
  slowSoup: { prep: 30, cook: 150, difficulty: 'Hard', nutrition: [510, 31, 58, 17] },
  quickSoup: { prep: 20, cook: 30, difficulty: 'Medium', nutrition: [360, 24, 38, 12] },
  wok: { prep: 20, cook: 12, difficulty: 'Medium', nutrition: [520, 29, 59, 18] },
  riceBowl: { prep: 20, cook: 25, difficulty: 'Easy', nutrition: [550, 28, 67, 18] },
  braise: { prep: 25, cook: 75, difficulty: 'Medium', nutrition: [560, 34, 39, 25] },
  noodle: { prep: 20, cook: 25, difficulty: 'Medium', nutrition: [570, 27, 76, 17] },
  sandwich: { prep: 20, cook: 15, difficulty: 'Easy', nutrition: [500, 24, 54, 20] },
  curry: { prep: 25, cook: 40, difficulty: 'Medium', nutrition: [590, 27, 57, 24] },
  salad: { prep: 20, cook: 10, difficulty: 'Easy', nutrition: [390, 18, 35, 19] },
  bake: { prep: 25, cook: 40, difficulty: 'Medium', nutrition: [490, 25, 47, 20] },
  grill: { prep: 25, cook: 18, difficulty: 'Medium', nutrition: [470, 33, 39, 17] },
  skillet: { prep: 15, cook: 25, difficulty: 'Easy', nutrition: [480, 25, 49, 19] },
  steamed: { prep: 25, cook: 20, difficulty: 'Medium', nutrition: [410, 27, 45, 12] },
  fried: { prep: 30, cook: 20, difficulty: 'Hard', nutrition: [610, 25, 65, 27] },
  roast: { prep: 20, cook: 50, difficulty: 'Medium', nutrition: [510, 31, 42, 23] },
  stew: { prep: 25, cook: 70, difficulty: 'Medium', nutrition: [530, 31, 46, 22] },
  dessertBake: { prep: 25, cook: 45, difficulty: 'Medium', nutrition: [380, 7, 52, 16] },
  dessertChill: { prep: 25, cook: 0, difficulty: 'Easy', nutrition: [310, 6, 45, 12] },
  dessertCook: { prep: 20, cook: 30, difficulty: 'Medium', nutrition: [330, 6, 50, 12] },
  drink: { prep: 10, cook: 5, difficulty: 'Easy', nutrition: [150, 3, 31, 2] },
}

function numbered(steps) {
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
}

const SPECIAL_STEPS = {
  'Bun Bo Hue': [
    'Blanch the beef shank and pork hock for 5 minutes, discard the water, then scrub both clean. Bruise the lemongrass; dissolve fermented shrimp paste in 250 ml warm water and let the sediment settle.',
    'Cover the cleaned meats with 2.5 L fresh water. Add bruised lemongrass and onion, bring to a boil, skim thoroughly, then simmer very gently. Remove the pork hock when tender after about 60 to 75 minutes; continue cooking the shank until tender, about 2 hours total.',
    'Strain the clear part of the shrimp-paste liquid into the broth, leaving grit behind. Bloom annatto in oil, add it to the pot, then balance the broth with fish sauce, salt, and a small amount of sugar.',
    'Cook the round rice noodles until tender, rinse briefly, and drain. Slice the rested beef across the grain and portion the pork hock.',
    'Put noodles and meats in warmed bowls, cover with boiling broth, and add banana blossom, herbs, lime, and chili to taste. Refrigerate broth and noodles separately for up to 3 days.',
  ],
  'Chicken Pho Ga': [
    'Char the onion and ginger until fragrant and lightly blackened. Toast coriander seed, star anise, and cinnamon for 2 minutes, then tie the spices in cheesecloth.',
    'Place the chicken in 2.5 L cold water, bring slowly to a simmer, and skim. Add charred aromatics and spices; poach at a bare simmer until the breast reaches 74 C / 165 F, about 35 to 45 minutes.',
    'Lift out the chicken and cool just enough to handle. Remove the meat, return the bones to the broth, and simmer 45 minutes more before straining and seasoning with fish sauce and a little rock sugar.',
    'Soak and cook the flat rice noodles according to thickness. Shred the chicken into moist bite-size pieces and keep covered.',
    'Divide noodles and chicken among bowls, pour over vigorously hot broth, and finish with scallion, cilantro, lime, and sliced chili. Store all components separately for up to 3 days.',
  ],
  'Tonkotsu Style Ramen': [
    'Soak pork neck bones in cold water for 1 hour, then boil hard for 10 minutes. Drain, scrub away all dark blood and scum, and wash the pot before returning the bones.',
    'Cover the cleaned bones with fresh water and boil vigorously, not gently, for 8 to 10 hours. Refill with boiling water whenever bones emerge; add ginger and garlic for the final hour.',
    'Strain the opaque broth and keep it hot. Prepare soy tare separately and warm the chashu; cook soft eggs to a 6 1/2-minute centre, chill, and peel.',
    'Boil fresh ramen noodles in unsalted water to the maker’s exact timing, usually 60 to 120 seconds, and shake off water thoroughly.',
    'Put tare in each hot bowl, whisk in boiling tonkotsu broth, then add noodles, chashu, halved egg, scallion, and nori. Keep broth refrigerated up to 3 days or freeze; never store cooked noodles in broth.',
  ],
  'Samgyetang Ginseng Chicken Soup': [
    'Soak glutinous rice for 1 hour and drain. Rinse the Cornish hens, remove excess internal fat, and stuff each cavity loosely with rice, ginseng, jujube, and garlic.',
    'Cross the legs to hold the filling inside and place the hens snugly in a pot. Add 2.5 L water, ginger, and remaining aromatics.',
    'Bring to a boil, skim, then simmer partly covered for 60 to 75 minutes until the leg joints move easily and the thickest meat reaches 74 C / 165 F.',
    'Check that the rice inside is completely tender. Season the broth lightly because diners traditionally adjust salt and pepper in their own bowls.',
    'Serve one half or whole small hen per bowl with hot broth and scallion. Remove leftover rice from the cavity before cooling; refrigerate within 2 hours and use within 3 days.',
  ],
  'Penang Assam Laksa': [
    'Poach the mackerel gently until just cooked, then lift it out. Remove every bone, flake the flesh, and return the skin and bones to the poaching liquid for 20 minutes before straining.',
    'Pound lemongrass, dried and fresh chili, shallot, galangal, and shrimp paste to a fine paste. Simmer it in the strained fish broth with tamarind for 35 minutes.',
    'Add the flaked fish and simmer 10 minutes more. The broth should be distinctly sour, spicy, and savoury; adjust tamarind, sugar, and salt without masking the fish.',
    'Cook thick rice noodles until fully tender, rinse, and drain. Keep pineapple, cucumber, onion, mint, and torch ginger raw and finely sliced.',
    'Divide noodles among bowls, ladle over hot fish broth, and pile on the raw garnishes. Add diluted shrimp paste at the table. Store broth separately for up to 2 days.',
  ],
  'Hainanese Chicken Rice': [
    'Rub the chicken skin with salt, rinse, and stuff the cavity with ginger, scallion, and pandan. Lower it into enough barely simmering water to cover completely.',
    'Poach at 80 to 85 C / 176 to 185 F for 40 to 50 minutes, until the thigh reaches 74 C / 165 F. Transfer immediately to ice water for 10 minutes, then drain and brush with sesame oil.',
    'Render chicken fat with garlic and ginger. Fry the rinsed rice in the aromatic fat for 2 minutes, then cook it with measured poaching broth and pandan; rest covered 10 minutes.',
    'Blend separate ginger-scallion and red chili sauces, using clean poaching broth for consistency. Chop the rested chicken cleanly through the joints and arrange with cucumber.',
    'Serve chicken over fragrant rice with both sauces and a cup of strained broth. Debone leftovers before chilling and refrigerate chicken and rice separately for up to 3 days.',
  ],
  'Focaccia Genovese': [
    'Mix bread flour, warm water, yeast, and salt until no dry flour remains. Rest 20 minutes, then fold the dough four times at 10-minute intervals until elastic.',
    'Cover and ferment until doubled, about 60 to 90 minutes. Coat a 33 x 23 cm tray generously with olive oil and stretch the dough gently to the corners without tearing.',
    'Proof 45 to 60 minutes until visibly bubbly. Press deep dimples with oiled fingertips, then pour over the salt brine and remaining olive oil; add rosemary without deflating the dough.',
    'Bake at 230 C / 445 F for 20 to 25 minutes until the top and underside are deep golden and the centre reaches about 96 C / 205 F.',
    'Move immediately to a rack so the base stays crisp and cool at least 20 minutes before cutting. Store airtight for 1 day or freeze sliced; reheat at 200 C / 390 F.',
  ],
}

const META_OVERRIDES = {
  'Bun Bo Hue': { prepTime: 35, cookTime: 180, difficulty: 'Hard' },
  'Chicken Pho Ga': { prepTime: 30, cookTime: 105, difficulty: 'Hard' },
  'Tonkotsu Style Ramen': { prepTime: 60, cookTime: 600, difficulty: 'Hard' },
  'Samgyetang Ginseng Chicken Soup': { prepTime: 75, cookTime: 75, difficulty: 'Medium' },
  'Penang Assam Laksa': { prepTime: 35, cookTime: 70, difficulty: 'Hard' },
  'Hainanese Chicken Rice': { prepTime: 30, cookTime: 70, difficulty: 'Hard' },
  'Focaccia Genovese': { prepTime: 35, cookTime: 25, difficulty: 'Medium' },
}

const SPECIAL_EXTRAS = {
  'Bun Bo Hue': [
    ['yellow onion', '1 large'],
    ['fish sauce', '3 tbsp'],
    ['rock sugar', '20 g'],
    ['lime and fresh chili', '2 limes and 2 chilies'],
  ],
  'Chicken Pho Ga': [
    ['star anise and cinnamon', '3 stars and 1 stick'],
    ['fish sauce and rock sugar', '3 tbsp and 20 g'],
    ['lime and fresh chili', '2 limes and 2 chilies'],
  ],
  'Penang Assam Laksa': [
    ['shallot and galangal', '5 shallots and 40 g'],
    ['palm sugar', '2 tbsp'],
  ],
  'Hainanese Chicken Rice': [
    ['chicken fat and sesame oil', '80 g and 1 tbsp'],
    ['scallion', '1 bunch'],
  ],
}

function instructionsFor(recipe) {
  if (SPECIAL_STEPS[recipe.title]) {
    return `Preparation and cooking:\n${numbered(SPECIAL_STEPS[recipe.title])}\n\nFood safety and storage notes are included in the final step.`
  }
  const [primary, base, produce, sauce, seasoning, garnish] = recipe.ingredients
  const n = (ingredient) => ingredient.name
  const steps = {
    slowSoup: [
      `Rinse and prepare ${n(primary)} and ${n(base)} separately. Char or toast ${n(seasoning)} in a dry heavy pot for 2 to 3 minutes until fragrant, never blackened.`,
      `Add the measured water or stock and ${n(sauce)}. Bring just to a boil, skim thoroughly, then reduce to the gentlest simmer for 90 minutes so the broth stays clear.`,
      `Add ${n(primary)} and continue simmering until fork-tender; add ${n(produce)} only for the final 15 to 25 minutes so it retains its shape.`,
      `Cook ${n(base)} according to its package or grain requirement, drain well, and divide among warmed bowls. Taste the broth and balance salt, sweetness, acidity, and spice before serving.`,
      `Slice the rested main ingredient across the grain where applicable. Ladle boiling-hot broth over each bowl and finish with ${n(garnish)}. Cool broth and solids separately within 2 hours; refrigerate up to 3 days.`,
    ],
    quickSoup: [
      `Prepare ${n(primary)}, ${n(base)}, and ${n(produce)} in even bite-size pieces. Keep ${n(garnish)} raw and chilled for the finish.`,
      `Heat a soup pot over medium heat, add the measured oil, and bloom ${n(seasoning)} for 45 seconds. Stir in ${n(sauce)} without letting it scorch.`,
      `Add stock, bring to a steady simmer, then cook ${n(primary)} until nearly done. Add ${n(produce)} and ${n(base)} in the order needed for both to finish together.`,
      `Simmer 5 to 10 minutes more. The protein must be opaque and the vegetables tender but intact; taste and correct salt, acidity, or heat.`,
      `Serve immediately with ${n(garnish)}. Refrigerate the cooled soup in a shallow container for up to 3 days and reheat once to a full simmer.`,
    ],
    wok: [
      `Cut ${n(primary)} into thin, even pieces and pat dry. Prepare ${n(base)} fully before heating the wok; slice ${n(produce)} so it cooks in under 4 minutes.`,
      `Whisk ${n(sauce)} with ${n(seasoning)}. Heat a carbon-steel wok or wide skillet until a drop of water evaporates immediately, then add half the oil.`,
      `Sear ${n(primary)} in one uncrowded layer until about 80 percent cooked, 2 to 4 minutes, then remove it to prevent overcooking.`,
      `Add remaining oil and ${n(produce)}; toss over high heat until crisp-tender. Add ${n(base)}, return the main ingredient, and pour sauce around the hot edge of the wok.`,
      `Toss 60 to 90 seconds until glossy and steaming, then finish with ${n(garnish)}. Serve at once; cool leftovers uncovered before refrigerating up to 3 days.`,
    ],
    riceBowl: [
      `Rinse ${n(base)} until the water is mostly clear, then cook and rest it covered for 10 minutes. Fluff without crushing the grains.`,
      `Season ${n(primary)} with ${n(seasoning)} and let stand 10 minutes. Cut ${n(produce)} into uniform pieces and whisk ${n(sauce)} until smooth.`,
      `Heat a skillet over medium-high, add oil, and cook ${n(primary)} until browned and safely cooked through. Rest it for 5 minutes before slicing.`,
      `Cook ${n(produce)} in the same pan until tender-crisp, adding one spoonful of water if the fond begins to burn.`,
      `Divide ${n(base)} among four bowls, arrange the main ingredient and vegetables separately, spoon over ${n(sauce)}, and add ${n(garnish)}. Store sauce separately for up to 3 days.`,
    ],
    braise: [
      `Cut ${n(primary)} into 4 to 5 cm pieces, pat very dry, and season with ${n(seasoning)}. Prepare ${n(base)} and ${n(produce)} before the pot is heated.`,
      `Heat oil in a heavy lidded pot. Brown ${n(primary)} deeply in batches, 3 to 4 minutes per side, then set aside.`,
      `Lower heat to medium, cook ${n(produce)} until aromatic, then add ${n(sauce)} and scrape every browned bit from the base of the pot.`,
      `Return the main ingredient, add the measured liquid, cover, and maintain a bare simmer until tender, usually 45 to 90 minutes. The sauce should coat a spoon, not look watery.`,
      `Rest 10 minutes, skim excess fat, and serve with ${n(base)} and ${n(garnish)}. Braises keep 3 days chilled and often taste better the next day.`,
    ],
    noodle: [
      `Prepare ${n(primary)} and thinly slice ${n(produce)}. Mix ${n(sauce)} with ${n(seasoning)} before boiling the noodles.`,
      `Cook ${n(base)} in 3 litres of water until one minute short of tender. Reserve 250 ml cooking water, then drain; rinse only if the noodle type calls for it.`,
      `Cook ${n(primary)} in a wide pan until browned and safely done, then add ${n(produce)} and cook until just tender.`,
      `Add the noodles and ${n(sauce)}. Toss vigorously, adding reserved water 1 tablespoon at a time until the sauce clings to every strand.`,
      `Taste, finish with ${n(garnish)}, and serve immediately. If storing, keep noodles slightly firm and refrigerate no longer than 3 days.`,
    ],
    sandwich: [
      `Prepare and season ${n(primary)} with ${n(seasoning)}. Slice ${n(produce)} thinly and pat it dry so the finished sandwich does not become soggy.`,
      `Cook ${n(primary)} in a skillet over medium-high until browned and done, then rest briefly. Warm or toast ${n(base)} until the cut surface is crisp.`,
      `Spread ${n(sauce)} edge to edge on the bread, creating a moisture barrier. Add ${n(produce)} in an even layer.`,
      `Slice or portion the warm filling and distribute it evenly; do not overfill the centre.`,
      `Add ${n(garnish)}, close, press gently, and serve immediately. For packed lunches, carry the sauce separately and assemble within 4 hours; refrigerate cooked filling up to 3 days.`,
    ],
    curry: [
      `Cut ${n(primary)} and ${n(produce)} into equal-size pieces. Rinse or prepare ${n(base)} so it can finish while the curry simmers.`,
      `Heat oil in a deep pan over medium. Bloom ${n(seasoning)} for 30 to 45 seconds, stirring constantly; add a splash of water immediately if it catches.`,
      `Add ${n(primary)} and brown lightly, then stir in ${n(produce)} and ${n(sauce)} until every piece is coated.`,
      `Add the measured liquid and simmer uncovered 20 to 35 minutes, stirring occasionally, until the main ingredient is cooked and the sauce leaves a clean trail behind the spoon.`,
      `Rest 5 minutes, adjust salt and acidity, then serve over ${n(base)} with ${n(garnish)}. Cool promptly and refrigerate up to 3 days.`,
    ],
    salad: [
      `Wash and thoroughly dry ${n(produce)}. Cook or rinse ${n(base)} as required, then cool it to room temperature before mixing.`,
      `Prepare ${n(primary)} with ${n(seasoning)}; if it requires cooking, cook it through and rest before slicing.`,
      `Whisk ${n(sauce)} with the measured olive oil until emulsified. Taste it on one piece of the vegetable rather than from the spoon.`,
      `Toss ${n(base)} and ${n(produce)} with two-thirds of the dressing, then fold in ${n(primary)} gently so the components remain distinct.`,
      `Add ${n(garnish)} and remaining dressing just before serving. For meal prep, keep dressing and crisp garnish separate for up to 3 days.`,
    ],
    bake: [
      `Heat the oven to 190 C / 375 F and oil the specified baking dish. Prepare ${n(primary)}, ${n(base)}, and ${n(produce)} in even pieces.`,
      `Combine ${n(sauce)} and ${n(seasoning)}, then coat the main ingredients thoroughly. Spread in a level layer so the centre cooks at the same rate as the edges.`,
      `Bake on the middle rack for 25 minutes, rotate the dish, and continue until the centre is bubbling and the thickest piece is safely cooked.`,
      `If the surface is pale, finish uncovered at 220 C / 425 F for 3 to 5 minutes; if it browns early, cover loosely with foil.`,
      `Rest 10 minutes before adding ${n(garnish)} and portioning. Refrigerate covered for up to 3 days; reheat uncovered at 180 C / 350 F.`,
    ],
    grill: [
      `Cut ${n(primary)} and ${n(produce)} into grill-safe pieces. Mix ${n(sauce)} with ${n(seasoning)}, coat the food, and marinate 20 minutes in the refrigerator.`,
      `Prepare ${n(base)} and ${n(garnish)} before lighting the grill. Heat a clean, oiled grate to medium-high, about 220 C / 425 F.`,
      `Grill ${n(primary)} without moving until it releases naturally, then turn and cook to a safe internal temperature.`,
      `Grill ${n(produce)} over a slightly cooler area until marked and tender; brush on fresh, uncontaminated sauce only during the last minute.`,
      `Rest the main ingredient 5 minutes, then serve with ${n(base)} and ${n(garnish)}. Refrigerate leftovers within 2 hours.`,
    ],
    skillet: [
      `Prepare ${n(primary)}, ${n(base)}, and ${n(produce)} before heating the pan. Mix ${n(sauce)} with ${n(seasoning)}.`,
      `Heat oil in a 30 cm skillet over medium-high and cook ${n(primary)} until browned, then move it to the edge or a clean plate.`,
      `Add ${n(produce)} and cook until softened but not collapsed. Stir in ${n(base)} and scrape up the browned fond.`,
      `Return the main ingredient, lower heat, add ${n(sauce)}, and cook until the sauce coats the food and the centre is piping hot.`,
      `Finish with ${n(garnish)} and serve from the skillet. Cool leftovers in a shallow container and refrigerate up to 3 days.`,
    ],
    steamed: [
      `Soak or prepare ${n(base)} as required. Cut ${n(primary)} and ${n(produce)} evenly so steam reaches every piece.`,
      `Mix ${n(sauce)} with ${n(seasoning)} and coat the main ingredient. Arrange it in a shallow heatproof dish without stacking.`,
      `Bring 1.5 litres of water to a full boil before setting the dish in the steamer; cover tightly and keep steam steady.`,
      `Steam 12 to 20 minutes, checking the thickest piece for doneness. Do not repeatedly lift the lid, which drops the temperature.`,
      `Carefully drain condensed water, spoon over hot juices, and add ${n(garnish)}. Serve with ${n(base)} immediately; refrigerate cooled leftovers within 2 hours and use within 2 days.`,
    ],
    fried: [
      `Prepare ${n(primary)}, ${n(base)}, and ${n(produce)}; dry every surface thoroughly. Season with ${n(seasoning)} and set a rack over a tray.`,
      `Heat frying oil in a deep heavy pot to 175 C / 350 F, using a thermometer. Keep the pot no more than half full.`,
      `Coat or shape the food with ${n(base)} as specified, then fry in small batches so the oil stays above 165 C / 330 F.`,
      `Cook until evenly golden and the centre is done, then drain on the rack rather than paper so the crust remains crisp.`,
      `Season while hot and serve with ${n(sauce)} and ${n(garnish)}. Never cover hot fried food; refrigerate cooled leftovers up to 2 days.`,
    ],
    roast: [
      `Heat the oven to 210 C / 410 F. Pat ${n(primary)} dry, season with ${n(seasoning)}, and cut ${n(produce)} into equal pieces.`,
      `Toss ${n(produce)} with oil and spread it around ${n(primary)} in a shallow roasting pan. Keep the pan uncrowded.`,
      `Roast until the exterior is deeply browned, turning the vegetables halfway through. Check the thickest part of the main ingredient for safe doneness.`,
      `Rest ${n(primary)} for 10 minutes. Meanwhile, loosen the pan juices with ${n(sauce)} and reduce briefly if thin.`,
      `Serve with ${n(base)}, pan sauce, and ${n(garnish)}. Chill carved leftovers within 2 hours and use within 3 days.`,
    ],
    stew: [
      `Cut ${n(primary)} and ${n(produce)} into sturdy, similar-size pieces. Season the main ingredient with ${n(seasoning)}.`,
      `Brown ${n(primary)} in oil in a heavy pot, working in batches. Add ${n(produce)} and cook 5 minutes to develop sweetness.`,
      `Stir in ${n(sauce)}, scrape the pot clean, then add the measured stock and ${n(base)}. Bring only to a gentle simmer.`,
      `Cook partly covered 45 to 75 minutes until tender and naturally thickened. Stir from the bottom every 15 minutes and add water only if needed.`,
      `Adjust seasoning, add ${n(garnish)}, and rest 10 minutes before serving. Cool in shallow containers; refrigerate up to 3 days.`,
    ],
    dessertBake: [
      `Heat the oven to 175 C / 350 F and prepare the pan with butter and parchment. Bring ${n(primary)} and ${n(base)} to the temperature specified by the ingredient.`,
      `Measure by weight. Combine ${n(primary)} with ${n(sauce)} until smooth, then incorporate ${n(base)} without overmixing.`,
      `Fold in ${n(produce)} and ${n(seasoning)} gently. Transfer to the pan and level the surface so it bakes evenly.`,
      `Bake until the edges are set and the centre shows the correct doneness for this dessert, then cool in the pan for 15 minutes before unmoulding.`,
      `Finish with ${n(garnish)} only after cooling. Store airtight at room temperature for 1 day or refrigerated for up to 4 days.`,
    ],
    dessertChill: [
      `Chill the serving vessels. Prepare ${n(primary)}, ${n(base)}, and ${n(produce)} separately so each component keeps its intended texture.`,
      `Combine ${n(primary)} with ${n(sauce)} until completely smooth; dissolve ${n(seasoning)} before adding so no grains remain.`,
      `Fold in ${n(base)} gently, then layer or distribute ${n(produce)} evenly among four portions.`,
      `Cover without touching the surface and chill at least 4 hours, or until the centre is fully set and cold.`,
      `Add ${n(garnish)} immediately before serving. Keep refrigerated and consume within 3 days.`,
    ],
    dessertCook: [
      `Measure ${n(primary)}, ${n(base)}, and ${n(sauce)} before heating. Prepare ${n(produce)} and ${n(garnish)} separately.`,
      `Cook ${n(primary)} with ${n(base)} over medium-low heat, stirring from the bottom so starch, dairy, or sugar does not scorch.`,
      `Add ${n(sauce)} and ${n(seasoning)} gradually. Maintain a gentle simmer, never a hard boil, until the mixture reaches the recipe's set texture.`,
      `Fold in ${n(produce)}, remove from heat, and cool 10 minutes before portioning; the dessert will continue to thicken as it cools.`,
      `Serve warm or chilled with ${n(garnish)}. Cover the surface directly if a skin is undesirable and refrigerate up to 3 days.`,
    ],
    drink: [
      `Prepare ${n(primary)} and ${n(produce)} completely, removing seeds, tough peel, or tea solids. Chill ${n(base)} and four glasses.`,
      `Combine ${n(primary)}, ${n(base)}, and ${n(sauce)}. Blend, shake, or stir until uniform, then strain only if the drink should be smooth.`,
      `Add ${n(seasoning)} a little at a time and taste over ice; cold suppresses sweetness, so balance the drink at serving temperature.`,
      `Dilute with the measured cold water if needed and stir for 20 seconds to chill without excessive melting.`,
      `Pour over fresh ice and add ${n(garnish)}. Serve immediately; refrigerate the undiluted, ice-free base up to 24 hours.`,
    ],
  }[recipe.technique]

  return `Preparation and cooking:\n${numbered(steps)}\n\nFood safety and storage notes are included in the final step.`
}

function parseIngredient(token) {
  const [name, quantity] = token.split('~')
  return { name: name.trim(), quantity: quantity.trim() }
}

function parseLine(line) {
  const [title, category, technique, ingredientText, tagText] = line.split('|')
  const ingredients = ingredientText.split(';').map(parseIngredient)
  if (ingredients.length !== 6) {
    throw new Error(`${title} must define exactly six recipe-specific ingredients`)
  }
  const profile = PROFILE[technique]
  if (!profile) throw new Error(`Unknown recipe technique: ${technique}`)
  const pantry = PANTRY[technique].map(([name, quantity]) => ({ name, quantity }))
  const specialExtras = (SPECIAL_EXTRAS[title] || []).map(([name, quantity]) => ({
    name,
    quantity,
  }))
  const [calories, protein, carbs, fat] = profile.nutrition
  const recipe = {
    title,
    category,
    technique,
    ingredients,
    allIngredients: [...ingredients, ...pantry, ...specialExtras],
    tags: tagText.split(',').map((tag) => tag.trim()),
    prepTime: profile.prep,
    cookTime: profile.cook,
    servings: 4,
    difficulty: profile.difficulty,
    calories,
    protein,
    carbs,
    fat,
    imageUrl: `/images/${encodeURIComponent(title)}.webp`,
  }
  Object.assign(recipe, META_OVERRIDES[title])
  recipe.description = `${title} is a ${category} recipe built around ${ingredients[0].name}, ${ingredients[1].name}, and ${ingredients[2].name}. Quantities serve four; nutrition is an estimate per serving.`
  recipe.instructions = instructionsFor(recipe)
  return recipe
}

const recipeLines = `
Bun Bo Hue|Vietnamese|slowSoup|beef shank~600 g;round rice noodles~400 g;pork hock~500 g;fermented shrimp paste~2 tbsp;lemongrass and annatto~4 stalks and 1 tsp;banana blossom and herbs~3 cups|Vietnamese,Noodles,Spicy
Chicken Pho Ga|Vietnamese|slowSoup|whole chicken~1.4 kg;flat rice noodles~400 g;yellow onion~2 large;fish sauce~3 tbsp;ginger and coriander seed~60 g and 1 tbsp;scallion and cilantro~1 cup|Vietnamese,Noodles,High Protein
Broken Rice Pork Chop Plate|Vietnamese|grill|bone-in pork chops~800 g;broken jasmine rice~320 g dry;pickled carrot and daikon~2 cups;fish sauce caramel~4 tbsp;lemongrass and garlic~3 stalks and 4 cloves;scallion oil~4 tbsp|Vietnamese,Grilled,Rice
Crab Tapioca Noodle Soup|Vietnamese|quickSoup|lump crab meat~350 g;thick tapioca noodles~400 g;straw mushrooms~200 g;annatto fish sauce broth~1.5 L;shallot and white pepper~3 and 1 tsp;cilantro and lime~1 cup|Vietnamese,Seafood,Noodles
Quang Style Turmeric Noodles|Vietnamese|noodle|chicken thighs~600 g;wide rice noodles~400 g;shrimp~250 g;turmeric fish sauce broth~500 ml;shallot and chili~3 and 1;peanuts and rice crackers~100 g|Vietnamese,Noodles,Chicken
Steamed Rice Rolls with Pork|Vietnamese|steamed|ground pork~350 g;rice flour batter~600 ml;wood ear mushrooms~40 g dried;lime fish sauce~150 ml;shallot and black pepper~4 and 1 tsp;fried shallots and herbs~1 cup|Vietnamese,Steamed,Breakfast
Southern Crispy Savory Pancakes|Vietnamese|fried|pork belly and shrimp~450 g total;rice flour coconut batter~700 ml;bean sprouts~300 g;lime fish sauce~180 ml;turmeric and scallion~1 tsp and 4 stalks;lettuce and herbs~4 cups|Vietnamese,Crispy,Street Food
Caramelized Fish Clay Pot|Vietnamese|braise|catfish steaks~800 g;steamed jasmine rice~320 g dry;young coconut strips~150 g;coconut caramel fish sauce~180 ml;black pepper and chili~2 tsp and 2;scallion greens~1/2 cup|Vietnamese,Seafood,Rice
Vietnamese Beef Stew with Baguette|Vietnamese|stew|beef chuck~800 g;Vietnamese baguettes~4 small;carrot~400 g;tomato coconut broth~750 ml;five-spice and lemongrass~2 tsp and 3 stalks;Thai basil~1 cup|Vietnamese,Stew,Comfort Food
Lotus Stem Shrimp Salad|Vietnamese|salad|poached shrimp~400 g;lotus stems~350 g;carrot and cucumber~300 g;lime fish sauce dressing~150 ml;chili and garlic~2 and 2 cloves;roasted peanuts and herbs~1 cup|Vietnamese,Seafood,Salad
Khao Soi Chicken|Thai|curry|chicken drumsticks~800 g;fresh egg noodles~400 g;pickled mustard greens~150 g;coconut curry broth~800 ml;khao soi curry paste~4 tbsp;crispy noodles and lime~2 cups|Thai,Noodles,Spicy
Massaman Beef Curry|Thai|curry|beef chuck~700 g;jasmine rice~320 g dry;potatoes and onion~600 g;coconut milk and tamarind~600 ml and 2 tbsp;massaman paste~4 tbsp;roasted peanuts~80 g|Thai,Curry,Beef
Pad See Ew Chicken|Thai|wok|chicken thigh strips~500 g;wide fresh rice noodles~500 g;Chinese broccoli~350 g;dark soy oyster sauce~100 ml;white pepper and garlic~1 tsp and 3 cloves;lime wedges~1 lime|Thai,Noodles,Chicken
Thai Basil Pork Rice|Thai|wok|ground pork~500 g;jasmine rice~320 g dry;long beans~200 g;fish sauce oyster sauce~90 ml;bird's eye chili and garlic~6 and 4 cloves;holy basil~2 cups|Thai,Spicy,Rice
Som Tam Green Papaya Salad|Thai|salad|dried shrimp~40 g;shredded green papaya~500 g;long beans and tomato~250 g;lime fish sauce dressing~120 ml;palm sugar and chili~2 tbsp and 4;roasted peanuts~80 g|Thai,Salad,Gluten Free
Thai Red Curry Duck|Thai|curry|roast duck meat~600 g;jasmine rice~320 g dry;pineapple and tomato~400 g;coconut red curry sauce~700 ml;red curry paste and lime leaf~4 tbsp and 6 leaves;Thai basil~1 cup|Thai,Curry,Duck
Larb Gai Lettuce Cups|Thai|skillet|ground chicken~500 g;butter lettuce leaves~16;shallot and scallion~200 g;lime fish sauce~100 ml;toasted rice powder and chili~3 tbsp and 1 tsp;mint and cilantro~1 cup|Thai,Chicken,Salad
Thai Steamed Lime Fish|Thai|steamed|whole sea bass~1 kg;jasmine rice~320 g dry;celery and cabbage~300 g;lime fish sauce broth~180 ml;garlic and chili~6 cloves and 5;cilantro~1 cup|Thai,Seafood,Steamed
Tom Kha Gai|Thai|quickSoup|chicken breast~500 g;jasmine rice~240 g dry;oyster mushrooms~250 g;coconut chicken broth~1.2 L;galangal lime leaf lemongrass~80 g total;cilantro and lime~1 cup|Thai,Soup,Chicken
Thai Pumpkin Custard|Thai|dessertBake|eggs~5 large;kabocha pumpkin~1 small;coconut cream~400 ml;palm sugar syrup~140 g;pandan and vanilla~2 leaves and 1 tsp;toasted sesame~2 tbsp|Thai,Dessert,Gluten Free
Galbi Jjim Short Ribs|Korean|braise|beef short ribs~1.2 kg;steamed short-grain rice~320 g dry;daikon carrot chestnut~600 g;pear soy braising sauce~500 ml;garlic ginger sesame~5 cloves 30 g 1 tbsp;scallion threads~1/2 cup|Korean,Beef,Braise
Dakgalbi Spicy Chicken|Korean|skillet|boneless chicken thighs~700 g;rice cakes~300 g;cabbage and sweet potato~600 g;gochujang soy sauce~150 ml;gochugaru garlic curry powder~3 tbsp 4 cloves 1 tsp;perilla leaves~12|Korean,Chicken,Spicy
Sundubu Jjigae|Korean|quickSoup|soft tofu~600 g;steamed rice~320 g dry;clams and zucchini~400 g;anchovy gochugaru broth~1.2 L;garlic and sesame oil~3 cloves and 1 tbsp;egg and scallion~4 eggs and 1/2 cup|Korean,Soup,Spicy
Bossam Pork Lettuce Wraps|Korean|braise|pork belly~1 kg;lettuce and perilla leaves~24;spicy radish salad~300 g;ssamjang~120 g;doenjang ginger coffee~2 tbsp 40 g 1 tsp;sliced garlic and chili~1/2 cup|Korean,Pork,Sharing
Haemul Pajeon|Korean|fried|mixed shrimp squid mussels~450 g;flour rice flour batter~500 ml;scallions~3 bunches;soy vinegar dip~120 ml;gochugaru and sesame oil~1 tsp each;toasted sesame~2 tbsp|Korean,Seafood,Crispy
Jajangmyeon Black Bean Noodles|Korean|noodle|diced pork shoulder~400 g;fresh wheat noodles~500 g;onion zucchini cabbage~600 g;chunjang black bean sauce~180 g;ginger and sugar~20 g and 1 tbsp;cucumber matchsticks~1 cup|Korean,Noodles,Pork
Korean Braised Mackerel|Korean|braise|mackerel fillets~800 g;steamed rice~320 g dry;daikon and onion~500 g;gochugaru soy braising sauce~350 ml;garlic ginger chili~4 cloves 20 g 2;scallion~1 cup|Korean,Seafood,Spicy
Tteokbokki with Fish Cake|Korean|skillet|cylinder rice cakes~600 g;fish cake sheets~250 g;cabbage~250 g;gochujang anchovy sauce~600 ml;gochugaru and sugar~2 tbsp each;boiled eggs and scallion~4 eggs and 1/2 cup|Korean,Street Food,Spicy
Samgyetang Ginseng Chicken Soup|Korean|slowSoup|Cornish hens~2 whole;glutinous rice~160 g;fresh ginseng and jujube~80 g;clear chicken broth~2.5 L;garlic and ginger~10 cloves and 30 g;scallion and salt~1 cup|Korean,Soup,Chicken
Hotteok Brown Sugar Pancakes|Korean|fried|yeast dough~600 g;brown sugar~160 g;walnuts and sunflower seeds~100 g;cinnamon syrup~80 ml;ground cinnamon~2 tsp;toasted sesame~2 tbsp|Korean,Dessert,Street Food
Tonkotsu Style Ramen|Japanese|slowSoup|pork neck bones~2 kg;fresh ramen noodles~500 g;chashu pork~400 g;soy tare~120 ml;ginger garlic kombu~100 g total;soft eggs scallion nori~4 eggs and 2 cups|Japanese,Noodles,Pork
Oyakodon Chicken Egg Bowl|Japanese|riceBowl|chicken thighs~500 g;Japanese short-grain rice~320 g dry;onion~250 g;dashi soy mirin sauce~400 ml;eggs and shichimi~6 eggs and 1 tsp;mitsuba or scallion~1 cup|Japanese,Rice,Chicken
Okonomiyaki Osaka Style|Japanese|skillet|pork belly slices~300 g;dashi flour batter~500 ml;shredded cabbage~600 g;okonomiyaki sauce~120 ml;eggs and yam~4 and 100 g;bonito flakes and aonori~1 cup|Japanese,Street Food,Cabbage
Unagi Don Grilled Eel Bowl|Japanese|riceBowl|grilled eel fillets~500 g;Japanese short-grain rice~320 g dry;pickled cucumber~200 g;unagi tare~120 ml;sansho pepper~1 tsp;nori and scallion~1 cup|Japanese,Seafood,Rice
Japanese Curry Beef Rice|Japanese|curry|beef chuck~650 g;Japanese short-grain rice~320 g dry;potato carrot onion~700 g;Japanese curry roux sauce~800 ml;ginger and apple~30 g and 1/2 apple;fukujinzuke pickles~120 g|Japanese,Curry,Beef
Chawanmushi Savory Egg Custard|Japanese|steamed|eggs~4 large;dashi~600 ml;shrimp chicken shiitake~350 g;light soy mirin~3 tbsp;fine salt and yuzu zest~1/2 tsp and 1 tsp;mizuna leaves~1/2 cup|Japanese,Steamed,High Protein
Nasu Dengaku Miso Eggplant|Japanese|roast|Japanese eggplants~6 small;steamed rice~320 g dry;shishito peppers~200 g;sweet miso glaze~150 g;sesame oil and ginger~1 tbsp and 15 g;sesame and scallion~1/2 cup|Japanese,Vegetarian,Roasted
Beef Sukiyaki Hot Pot|Japanese|quickSoup|thin-sliced beef~600 g;udon noodles~400 g;napa cabbage tofu mushrooms~800 g;warishita soy mirin broth~1.2 L;sugar and sake~3 tbsp and 80 ml;raw pasteurized eggs and scallion~4 and 1 cup|Japanese,Hot Pot,Beef
Chicken Karaage|Japanese|fried|boneless chicken thighs~700 g;potato starch~180 g;shredded cabbage~300 g;Japanese mayonnaise~100 g;soy ginger garlic marinade~120 ml;lemon wedges~2 lemons|Japanese,Fried,Chicken
Dorayaki Red Bean Pancakes|Japanese|dessertCook|eggs~4 large;cake flour~220 g;sweet red bean paste~400 g;honey syrup~80 ml;baking soda and mirin~1 tsp and 1 tbsp;fresh berries~1 cup|Japanese,Dessert,Snack
Dan Dan Noodles|Chinese|noodle|ground pork~400 g;fresh wheat noodles~500 g;bok choy~300 g;sesame chili sauce~180 ml;Sichuan pepper and preserved mustard~2 tsp and 60 g;scallion and peanuts~1 cup|Chinese,Noodles,Spicy
Red Braised Pork Belly|Chinese|braise|pork belly~900 g;steamed jasmine rice~320 g dry;Shanghai bok choy~400 g;Shaoxing soy caramel~400 ml;star anise ginger cinnamon~4 40 g 1 stick;scallion~1 cup|Chinese,Pork,Braise
Kung Pao Chicken|Chinese|wok|chicken thigh cubes~600 g;steamed jasmine rice~320 g dry;bell pepper and celery~400 g;black vinegar soy sauce~120 ml;dried chili and Sichuan pepper~12 and 2 tsp;roasted peanuts~100 g|Chinese,Chicken,Spicy
Steamed Ginger Scallion Fish|Chinese|steamed|whole snapper~1 kg;steamed jasmine rice~320 g dry;ginger strips~50 g;light soy hot oil sauce~120 ml;Shaoxing wine and white pepper~2 tbsp and 1 tsp;scallion and cilantro~2 cups|Chinese,Seafood,Steamed
Char Siu Barbecue Pork|Chinese|roast|pork shoulder strips~900 g;steamed jasmine rice~320 g dry;baby bok choy~400 g;honey hoisin glaze~180 ml;five-spice red fermented tofu~2 tsp and 40 g;scallion~1 cup|Chinese,Pork,Roasted
Xiao Long Bao Soup Dumplings|Chinese|steamed|pork and aspic filling~650 g;wheat dumpling wrappers~40;ginger~40 g;black vinegar dip~120 ml;soy white pepper sesame oil~3 tbsp 1 tsp 1 tbsp;ginger julienne~1/2 cup|Chinese,Dumplings,Steamed
Dry Fried Green Beans|Chinese|wok|ground pork~250 g;steamed jasmine rice~320 g dry;green beans~700 g;soy Shaoxing sauce~100 ml;dried chili garlic preserved greens~8 4 cloves 60 g;sesame oil~1 tbsp|Chinese,Vegetables,Spicy
Cantonese Wonton Noodle Soup|Chinese|quickSoup|pork shrimp wontons~24;thin egg noodles~400 g;gai lan~300 g;dried flounder chicken broth~1.5 L;white pepper and sesame oil~1 tsp each;scallion and chives~1 cup|Chinese,Noodles,Soup
Beijing Zhajiangmian|Chinese|noodle|ground pork~400 g;fresh wheat noodles~500 g;cucumber bean sprouts carrot~500 g;sweet bean soybean paste~180 g;ginger garlic sugar~20 g 3 cloves 1 tbsp;scallion~1 cup|Chinese,Noodles,Pork
Mango Pomelo Sago|Chinese|dessertChill|ripe mango~600 g;small tapioca pearls~120 g;pomelo segments~250 g;coconut evaporated milk~500 ml;sugar and lime~80 g and 1 tbsp;mint leaves~1/2 cup|Chinese,Dessert,Fruit
Chicken Biryani Hyderabadi Style|Indian|riceBowl|bone-in chicken~800 g;aged basmati rice~400 g;fried onion and mint~250 g;saffron yogurt marinade~350 g;biryani masala and ginger garlic~3 tbsp and 50 g;cilantro and lemon~1 cup|Indian,Rice,Chicken
Rogan Josh Lamb Curry|Indian|curry|lamb shoulder~750 g;basmati rice~320 g dry;onion and tomato~500 g;yogurt lamb gravy~700 ml;Kashmiri chili fennel ginger~2 tbsp 2 tsp 30 g;cilantro~1 cup|Indian,Curry,Lamb
South Indian Sambar|Indian|stew|toor dal~300 g;steamed rice~320 g dry;drumstick pumpkin eggplant~700 g;tamarind broth~750 ml;sambar powder mustard curry leaf~3 tbsp 1 tsp 12 leaves;cilantro~1 cup|Indian,Vegetarian,Lentils
Paneer Tikka Skewers|Indian|grill|paneer cubes~600 g;naan breads~4;bell pepper and onion~500 g;mint yogurt chutney~200 g;tandoori spice and lemon~3 tbsp and 2 tbsp;cilantro~1 cup|Indian,Vegetarian,Grilled
Goan Fish Curry|Indian|curry|firm white fish~700 g;steamed rice~320 g dry;tomato and green chili~350 g;coconut tamarind sauce~700 ml;coriander cumin turmeric~2 tsp each;cilantro~1 cup|Indian,Seafood,Curry
Rajma Masala Kidney Beans|Indian|stew|cooked kidney beans~800 g;basmati rice~320 g dry;onion and tomato~600 g;spiced tomato gravy~650 ml;cumin garam masala ginger~2 tsp 2 tsp 25 g;cilantro and lemon~1 cup|Indian,Vegetarian,Beans
Kerala Appam with Vegetable Stew|Indian|stew|mixed vegetables~700 g;fermented rice appam batter~700 ml;potato carrot peas~600 g;coconut milk broth~750 ml;cinnamon clove curry leaf~1 stick 4 and 10 leaves;cilantro~1 cup|Indian,Vegetarian,Coconut
Keema Matar Ground Lamb Curry|Indian|skillet|ground lamb~650 g;basmati rice~320 g dry;green peas and tomato~500 g;onion tomato gravy~500 ml;garam masala cumin chili~2 tsp each;cilantro~1 cup|Indian,Lamb,Rice
Masala Idli with Coconut Chutney|Indian|steamed|fermented idli batter~800 ml;split urad dal~160 g;mustard curry leaves~2 tsp and 10;coconut chutney~250 ml;fenugreek and ginger~1 tsp and 20 g;cilantro~1/2 cup|Indian,Breakfast,Steamed
Gulab Jamun|Indian|dessertCook|milk powder~250 g;all-purpose flour~50 g;whole milk~120 ml;cardamom rose syrup~600 ml;baking powder and cardamom~1 tsp and 1 tsp;pistachios~50 g|Indian,Dessert,Sweet
Osso Buco Milanese|Italian|braise|veal shanks~1.2 kg;creamy polenta~320 g dry;carrot celery onion~500 g;white wine tomato stock~700 ml;bay leaf and black pepper~2 and 1 tsp;lemon parsley gremolata~1 cup|Italian,Braise,Beef
Eggplant Parmigiana|Italian|bake|eggplant slices~1 kg;mozzarella and parmesan~450 g;tomato basil sauce~700 ml;olive oil breadcrumbs~150 ml;oregano and garlic~2 tsp and 3 cloves;fresh basil~1 cup|Italian,Vegetarian,Baked
Pasta alla Norma|Italian|noodle|fried eggplant~600 g;rigatoni~400 g;crushed tomato~600 g;tomato garlic sauce~650 ml;chili flakes and oregano~1 tsp each;ricotta salata and basil~150 g|Italian,Pasta,Vegetarian
Risotto alla Milanese|Italian|skillet|arborio rice~360 g;hot chicken stock~1.2 L;shallot~120 g;saffron white wine sauce~250 ml;butter and saffron~80 g and 1 pinch;parmesan~120 g|Italian,Rice,Vegetarian
Chicken Saltimbocca|Italian|skillet|chicken cutlets~700 g;soft polenta~320 g dry;prosciutto and sage~150 g;white wine butter sauce~250 ml;black pepper and lemon~1 tsp and 1;parsley~1/2 cup|Italian,Chicken,Skillet
Seafood Cioppino|Italian|quickSoup|mussels shrimp white fish~900 g;sourdough bread~8 slices;fennel and tomato~500 g;white wine tomato broth~1.5 L;garlic chili bay leaf~4 cloves 1 tsp 2;parsley and lemon~1 cup|Italian,Seafood,Soup
Porchetta Herb Roast|Italian|roast|rolled pork belly loin~1.5 kg;rosemary potatoes~800 g;fennel bulb~400 g;white wine pan sauce~250 ml;fennel seed rosemary garlic~2 tbsp 3 sprigs 5 cloves;parsley~1 cup|Italian,Pork,Roasted
Gnocchi with Brown Butter Sage|Italian|skillet|potato gnocchi~800 g;parmesan~120 g;butternut squash~500 g;brown butter sauce~160 g;fresh sage and nutmeg~20 leaves and 1/4 tsp;toasted hazelnuts~80 g|Italian,Pasta,Vegetarian
Focaccia Genovese|Italian|dessertBake|bread flour~500 g;warm water~380 ml;extra virgin olive oil~100 ml;sea salt brine~100 ml;instant yeast and rosemary~7 g and 2 sprigs;flaky salt~2 tsp|Italian,Bread,Baked
Panna Cotta with Berry Compote|Italian|dessertChill|heavy cream~600 ml;gelatin~8 g;mixed berries~350 g;vanilla sugar syrup~120 ml;vanilla bean and lemon zest~1 and 1 tsp;fresh mint~1/2 cup|Italian,Dessert,Chilled
Birria Beef Tacos|Mexican|braise|beef chuck and short rib~1.2 kg;corn tortillas~16;white onion~200 g;guajillo ancho chile consomme~900 ml;cumin oregano cinnamon~2 tsp 2 tsp 1/2 tsp;cilantro lime cheese~2 cups|Mexican,Tacos,Beef
Chicken Mole Poblano|Mexican|braise|chicken thighs~800 g;Mexican rice~320 g dry;roasted tomato and onion~450 g;mole poblano sauce~700 ml;ancho sesame cocoa spices~120 g total;sesame and cilantro~1/2 cup|Mexican,Chicken,Sauce
Carnitas Pork Tacos|Mexican|braise|pork shoulder~1 kg;corn tortillas~16;orange and onion~300 g;citrus pork juices~500 ml;cumin oregano garlic~2 tsp 2 tsp 5 cloves;onion cilantro lime~2 cups|Mexican,Tacos,Pork
Chiles Rellenos|Mexican|fried|poblano peppers and cheese~8 and 500 g;egg batter~6 eggs;tomato onion~500 g;roasted tomato sauce~600 ml;cumin garlic oregano~1 tsp 3 cloves 1 tsp;cilantro~1 cup|Mexican,Vegetarian,Fried
Sopa de Tortilla|Mexican|quickSoup|shredded chicken~500 g;corn tortilla strips~12 tortillas;tomato avocado~500 g;ancho tomato broth~1.5 L;epazote cumin garlic~2 tbsp 1 tsp 3 cloves;queso fresco lime~200 g|Mexican,Soup,Chicken
Pork Tamales Rojos|Mexican|steamed|red chile pork filling~800 g;masa harina dough~1 kg;corn husks~30;guajillo chile sauce~400 ml;cumin garlic lard~2 tsp 4 cloves 250 g;pickled onion~1 cup|Mexican,Steamed,Pork
Pescado Veracruzana|Mexican|skillet|white fish fillets~800 g;steamed rice~320 g dry;tomato olive caper~600 g;white wine tomato sauce~500 ml;oregano garlic jalapeno~2 tsp 3 cloves 1;cilantro lime~1 cup|Mexican,Seafood,Skillet
Enfrijoladas Black Bean Tortillas|Mexican|skillet|refried black beans~700 g;corn tortillas~16;crumbled cheese and onion~300 g;black bean chile sauce~600 ml;epazote cumin garlic~1 tbsp 1 tsp 2 cloves;crema and cilantro~1 cup|Mexican,Vegetarian,Beans
Yucatan Cochinita Pibil|Mexican|braise|pork shoulder~1.2 kg;corn tortillas~16;banana leaves and onion~8 leaves and 200 g;achiote sour orange marinade~500 ml;oregano cumin garlic~2 tsp 1 tsp 5 cloves;pickled red onion~2 cups|Mexican,Pork,Tacos
Tres Leches Cake|Mexican|dessertBake|eggs~6 large;cake flour~200 g;three-milk mixture~900 ml;vanilla condensed milk sauce~250 ml;baking powder and vanilla~2 tsp and 2 tsp;whipped cream and berries~3 cups|Mexican,Dessert,Cake
Chicken Shawarma Plate|Mediterranean|grill|chicken thighs~800 g;turmeric rice~320 g dry;tomato cucumber salad~500 g;garlic yogurt sauce~250 g;shawarma spice and lemon~3 tbsp and 2;parsley and pickles~2 cups|Mediterranean,Chicken,Grilled
Moussaka Eggplant Lamb Bake|Mediterranean|bake|ground lamb~650 g;sliced eggplant~900 g;potato and onion~600 g;tomato bechamel sauce~900 ml;cinnamon oregano nutmeg~1 tsp each;parsley~1 cup|Mediterranean,Lamb,Baked
Stuffed Grape Leaves|Mediterranean|braise|grape leaves~40 leaves;herbed rice~350 g;onion and currants~300 g;lemon olive oil broth~500 ml;allspice mint dill~1 tsp 2 tbsp 2 tbsp;yogurt and lemon~2 cups|Mediterranean,Vegetarian,Rice
Grilled Octopus with Lemon Potatoes|Mediterranean|grill|cooked octopus~900 g;lemon potatoes~800 g;arugula tomato~350 g;lemon olive oil sauce~150 ml;oregano garlic pepper~2 tsp 3 cloves 1 tsp;parsley and capers~1 cup|Mediterranean,Seafood,Grilled
Spanakopita Spinach Pie|Mediterranean|bake|spinach feta filling~900 g;phyllo pastry~16 sheets;scallion and dill~180 g;butter olive oil mixture~180 ml;nutmeg pepper lemon zest~1/4 tsp 1 tsp 1 tsp;sesame seeds~2 tbsp|Mediterranean,Vegetarian,Baked
Lamb Youvetsi Orzo Bake|Mediterranean|bake|lamb shoulder~800 g;orzo pasta~400 g;tomato and onion~500 g;red wine tomato sauce~800 ml;cinnamon bay oregano~1 stick 2 leaves 2 tsp;kefalotyri and parsley~150 g|Mediterranean,Lamb,Pasta
White Bean Tuna Salad|Mediterranean|salad|olive oil tuna~400 g;cannellini beans~600 g cooked;tomato celery red onion~500 g;lemon caper vinaigrette~150 ml;oregano black pepper~2 tsp and 1 tsp;parsley and olives~1 cup|Mediterranean,Seafood,Salad
Saganaki Shrimp and Feta|Mediterranean|skillet|large shrimp~700 g;crusty bread~8 slices;tomato and fennel~500 g;ouzo tomato sauce~550 ml;chili oregano garlic~1 tsp 2 tsp 3 cloves;feta and parsley~200 g|Mediterranean,Seafood,Skillet
Avgolemono Chicken Rice Soup|Mediterranean|quickSoup|shredded chicken~500 g;short-grain rice~180 g;carrot and celery~300 g;lemon egg chicken broth~1.5 L;white pepper and bay leaf~1 tsp and 2;dill and lemon~1 cup|Mediterranean,Soup,Chicken
Orange Semolina Cake|Mediterranean|dessertBake|fine semolina~250 g;Greek yogurt~250 g;orange zest and juice~180 ml;honey orange syrup~300 ml;baking powder and cardamom~2 tsp and 1/2 tsp;pistachios~70 g|Mediterranean,Dessert,Cake
Buttermilk Fried Chicken|American|fried|bone-in chicken pieces~1.2 kg;seasoned flour~350 g;cabbage slaw~500 g;buttermilk hot sauce marinade~700 ml;paprika garlic cayenne~2 tsp each;pickles and honey~1 cup|American,Chicken,Fried
New England Clam Chowder|American|quickSoup|chopped clams~600 g;diced potatoes~600 g;celery and onion~300 g;clam cream broth~1.5 L;thyme bay white pepper~2 tsp 2 leaves 1 tsp;chives and oyster crackers~1 cup|American,Seafood,Soup
Texas Beef Chili|American|stew|beef chuck cubes~900 g;pinto beans~500 g cooked;onion and poblano~500 g;dried chile beef broth~900 ml;cumin oregano smoked paprika~2 tbsp 2 tsp 2 tsp;cheddar scallion sour cream~2 cups|American,Beef,Stew
Louisiana Shrimp Gumbo|American|stew|shrimp and andouille~900 g;steamed long-grain rice~320 g dry;okra onion celery pepper~700 g;dark roux seafood stock~1.2 L;Cajun spice bay thyme~2 tbsp 2 leaves 2 tsp;scallion and parsley~1 cup|American,Seafood,Stew
Nashville Hot Chicken Sandwich|American|fried|chicken breast cutlets~700 g;brioche buns~4;shredded slaw~300 g;cayenne oil and mayonnaise~180 ml;paprika brown sugar garlic~2 tbsp 1 tbsp 1 tsp;pickles~1 cup|American,Sandwich,Spicy
Pulled Pork Barbecue Plate|American|roast|pork shoulder~1.5 kg;cornbread~8 pieces;cabbage slaw~500 g;apple cider barbecue sauce~500 ml;smoked paprika mustard pepper~2 tbsp 1 tbsp 1 tsp;pickles and scallion~1 cup|American,Pork,Barbecue
Chicken Pot Pie|American|bake|cooked chicken~700 g;butter pastry~500 g;peas carrot celery~600 g;chicken cream gravy~700 ml;thyme sage black pepper~2 tsp 1 tsp 1 tsp;parsley~1 cup|American,Chicken,Baked
Crab Cake Plate|American|fried|lump crab meat~600 g;panko cracker binder~150 g;celery and bell pepper~250 g;lemon remoulade~200 ml;Old Bay mustard Worcestershire~2 tsp 1 tbsp 1 tbsp;chives and lemon~1 cup|American,Seafood,Fried
Mushroom Swiss Patty Melt|American|sandwich|beef patties~600 g;rye bread slices~8;mushrooms and onion~500 g;Dijon burger sauce~150 ml;black pepper Worcestershire~1 tsp and 1 tbsp;Swiss cheese and pickles~300 g|American,Sandwich,Beef
Key Lime Pie|American|dessertChill|key lime juice~180 ml;graham cracker crust~1 23-cm crust;sweetened condensed milk~600 g;lime cream filling~700 ml;egg yolks and lime zest~5 and 2 tsp;whipped cream~2 cups|American,Dessert,Pie
Beef Bourguignon|French|braise|beef chuck~900 g;buttered potatoes~800 g;mushroom pearl onion carrot~700 g;Burgundy wine beef stock~900 ml;thyme bay garlic~4 sprigs 2 leaves 4 cloves;parsley~1 cup|French,Beef,Braise
Coq au Vin|French|braise|bone-in chicken~1.2 kg;buttered egg noodles~400 g;mushroom pearl onion~600 g;red wine chicken stock~850 ml;thyme bay garlic~4 sprigs 2 leaves 3 cloves;parsley and bacon lardons~1 cup|French,Chicken,Braise
Bouillabaisse Seafood Stew|French|quickSoup|firm fish mussels shrimp~1 kg;toasted baguette~8 slices;fennel tomato leek~600 g;saffron seafood broth~1.5 L;orange peel garlic saffron~2 strips 4 cloves 1 pinch;rouille and parsley~1 cup|French,Seafood,Soup
Duck Confit with Lentils|French|roast|duck legs~4;green lentils~320 g;carrot celery onion~450 g;duck stock mustard sauce~450 ml;thyme juniper garlic~4 sprigs 6 berries 4 cloves;parsley~1 cup|French,Duck,Roasted
Ratatouille Provençal|French|stew|eggplant zucchini pepper~1.2 kg;crusty bread~8 slices;tomato and onion~600 g;olive oil tomato juices~500 ml;thyme basil garlic~3 sprigs 1 cup 4 cloves;fresh basil~1 cup|French,Vegetarian,Stew
Croque Monsieur|French|sandwich|sliced ham~400 g;brioche or pain de mie~8 slices;Gruyere cheese~300 g;Dijon bechamel~400 ml;nutmeg black pepper~1/4 tsp and 1 tsp;cornichons and chives~1 cup|French,Sandwich,Cheese
Quiche Lorraine|French|bake|eggs~6;butter pastry shell~1 24-cm shell;bacon and leek~400 g;cream custard~500 ml;nutmeg pepper thyme~1/4 tsp 1 tsp 1 tsp;Gruyere and chives~250 g|French,Breakfast,Baked
Sole Meunière|French|skillet|sole fillets~700 g;boiled baby potatoes~700 g;green beans~400 g;brown butter lemon sauce~180 ml;flour white pepper salt~100 g 1 tsp 1 tsp;parsley and capers~1 cup|French,Seafood,Skillet
Nicoise Salad with Tuna|French|salad|seared tuna~600 g;baby potatoes~600 g;green beans tomato olives~700 g;anchovy Dijon vinaigrette~180 ml;black pepper and thyme~1 tsp each;eggs and basil~4 and 1 cup|French,Seafood,Salad
Crème Brûlée|French|dessertBake|egg yolks~6;heavy cream~600 ml;caster sugar~140 g;vanilla custard base~700 ml;vanilla bean and fine salt~1 and 1 pinch;demerara sugar~80 g|French,Dessert,Custard
Paella Valenciana|Spanish|skillet|chicken rabbit and snails~900 g;bomba rice~400 g;green beans and tomato~500 g;saffron paprika stock~1.2 L;rosemary saffron smoked paprika~2 sprigs 1 pinch 2 tsp;lemon wedges~2 lemons|Spanish,Rice,Chicken
Seafood Paella|Spanish|skillet|shrimp mussels squid~1 kg;bomba rice~400 g;red pepper and tomato~500 g;saffron seafood stock~1.2 L;smoked paprika garlic saffron~2 tsp 4 cloves 1 pinch;parsley and lemon~1 cup|Spanish,Seafood,Rice
Patatas Bravas|Spanish|fried|waxy potatoes~1 kg;cornstarch coating~80 g;roasted tomato~400 g;bravas sauce and aioli~300 ml;smoked paprika cayenne garlic~2 tsp 1/2 tsp 2 cloves;parsley~1 cup|Spanish,Vegetarian,Tapas
Gambas al Ajillo|Spanish|skillet|peeled shrimp~700 g;crusty bread~8 slices;garlic~10 cloves;olive oil sherry sauce~250 ml;dried chili smoked paprika~3 and 1 tsp;parsley and lemon~1 cup|Spanish,Seafood,Tapas
Spanish Tortilla|Spanish|skillet|eggs~8;waxy potatoes~800 g;yellow onion~300 g;olive oil egg mixture~350 ml;fine salt and black pepper~1 tsp each;parsley and aioli~1 cup|Spanish,Breakfast,Vegetarian
Chicken and Chorizo Stew|Spanish|stew|chicken thighs and chorizo~900 g;crusty bread~8 slices;chickpeas tomato pepper~700 g;sherry tomato stock~800 ml;smoked paprika bay garlic~2 tsp 2 leaves 4 cloves;parsley~1 cup|Spanish,Chicken,Stew
Basque Piperade with Eggs|Spanish|skillet|eggs~8;rustic bread~8 slices;red green peppers onion~700 g;tomato olive oil sauce~500 ml;Espelette pepper garlic~2 tsp and 3 cloves;parsley~1 cup|Spanish,Breakfast,Vegetarian
Albondigas in Tomato Sauce|Spanish|braise|beef pork meatballs~800 g;steamed rice~320 g dry;onion and tomato~600 g;sherry tomato sauce~700 ml;smoked paprika parsley garlic~2 tsp 1/2 cup 3 cloves;toasted almonds~60 g|Spanish,Meatballs,Braise
Pulpo a la Gallega|Spanish|quickSoup|cooked octopus~900 g;boiled potatoes~800 g;yellow onion~200 g;olive oil cooking broth~250 ml;smoked paprika and sea salt~2 tsp and 1 tsp;parsley~1 cup|Spanish,Seafood,Tapas
Crema Catalana|Spanish|dessertCook|egg yolks~6;whole milk~700 ml;caster sugar~150 g;citrus cinnamon custard~750 ml;lemon peel cinnamon cornstarch~2 strips 1 stick 35 g;demerara sugar~80 g|Spanish,Dessert,Custard
Lamb Mansaf|Middle Eastern|stew|lamb shoulder~900 g;basmati rice~400 g;onion and almonds~300 g;jameed yogurt broth~850 ml;cardamom bay cinnamon~6 pods 2 leaves 1 stick;parsley and toasted almonds~1 cup|Middle Eastern,Lamb,Rice
Chicken Maqluba|Middle Eastern|riceBowl|chicken thighs~800 g;basmati rice~400 g;eggplant cauliflower potato~900 g;spiced chicken stock~800 ml;allspice cinnamon cardamom~2 tsp 1 stick 5 pods;toasted nuts and parsley~1 cup|Middle Eastern,Chicken,Rice
Beef Kofta with Tahini|Middle Eastern|grill|ground beef lamb kofta~800 g;warm pita~4;tomato onion cucumber~500 g;lemon tahini sauce~250 ml;cumin coriander allspice~2 tsp each;parsley and sumac~1 cup|Middle Eastern,Beef,Grilled
Mujadara Lentils and Rice|Middle Eastern|riceBowl|brown lentils~300 g;long-grain rice~300 g;caramelized onions~600 g;cumin yogurt sauce~250 ml;cumin coriander black pepper~2 tsp each;parsley and fried onion~1 cup|Middle Eastern,Vegetarian,Lentils
Fattoush Bread Salad|Middle Eastern|salad|toasted pita chips~200 g;romaine lettuce~2 heads;tomato cucumber radish~700 g;pomegranate sumac dressing~180 ml;sumac mint garlic~2 tbsp 1/2 cup 2 cloves;pomegranate seeds~1 cup|Middle Eastern,Salad,Vegetarian
Lebanese Stuffed Zucchini|Middle Eastern|braise|zucchini~12 small;beef rice filling~700 g;tomato and onion~500 g;tomato mint broth~750 ml;allspice cinnamon garlic~2 tsp 1/2 tsp 3 cloves;mint yogurt~1 cup|Middle Eastern,Beef,Braise
Persian Chicken Fesenjan|Middle Eastern|stew|chicken thighs~800 g;steamed basmati rice~320 g dry;ground walnuts~350 g;pomegranate molasses sauce~700 ml;cinnamon turmeric pepper~1 tsp each;pomegranate and parsley~1 cup|Middle Eastern,Chicken,Stew
Shish Tawook Chicken Skewers|Middle Eastern|grill|chicken breast cubes~800 g;vermicelli rice~320 g dry;bell pepper and onion~500 g;garlic lemon yogurt marinade~350 g;paprika oregano tomato paste~2 tsp 2 tsp 2 tbsp;parsley and pickles~1 cup|Middle Eastern,Chicken,Grilled
Turkish Manti Dumplings|Middle Eastern|steamed|beef dumplings~800 g;wheat dumpling dough~500 g;tomato pepper butter~250 g;garlic yogurt sauce~350 g;Aleppo pepper mint sumac~2 tsp each;dill and parsley~1 cup|Middle Eastern,Dumplings,Beef
Kunafa Cheese Pastry|Middle Eastern|dessertBake|kataifi pastry~500 g;unsalted cheese~500 g;pistachios~100 g;orange blossom syrup~400 ml;clarified butter and orange blossom~220 g and 2 tbsp;ground pistachio~80 g|Middle Eastern,Dessert,Pastry
Beef Rendang|Indonesian|stew|beef chuck~900 g;steamed jasmine rice~320 g dry;toasted coconut~120 g;coconut milk spice paste~1 L;galangal lemongrass lime leaf~80 g 3 stalks 8 leaves;fried shallots~1 cup|Indonesian,Beef,Spicy
Nasi Goreng Kampung|Indonesian|wok|shredded chicken~400 g;cold jasmine rice~800 g cooked;green beans cabbage~400 g;kecap manis shrimp paste sauce~120 ml;chili garlic shallot~3 3 cloves 4;fried eggs and cucumber~4 and 1 cup|Indonesian,Rice,Street Food
Chicken Satay with Peanut Sauce|Indonesian|grill|chicken thigh strips~800 g;compressed rice cakes~500 g;cucumber shallot pickle~300 g;spiced peanut sauce~350 ml;coriander turmeric kecap manis~2 tsp 1 tsp 3 tbsp;fried shallots~1 cup|Indonesian,Chicken,Grilled
Soto Ayam Chicken Soup|Indonesian|quickSoup|shredded chicken~600 g;rice vermicelli~300 g;cabbage bean sprouts~500 g;turmeric chicken broth~1.5 L;lemongrass ginger lime leaf~3 stalks 40 g 6 leaves;egg lime celery leaf~4 and 1 cup|Indonesian,Soup,Chicken
Gado Gado Vegetable Salad|Indonesian|salad|fried tofu and tempeh~500 g;boiled potatoes~500 g;cabbage beans sprouts cucumber~700 g;warm peanut dressing~350 ml;tamarind chili palm sugar~2 tbsp 2 and 2 tbsp;egg and crackers~4 and 2 cups|Indonesian,Vegetarian,Salad
Ikan Bakar Sambal Fish|Indonesian|grill|whole snapper~1 kg;steamed jasmine rice~320 g dry;cucumber tomato~400 g;sambal kecap glaze~220 ml;turmeric coriander garlic~2 tsp 2 tsp 4 cloves;lime and basil~1 cup|Indonesian,Seafood,Grilled
Gudeg Jackfruit Stew|Indonesian|stew|young jackfruit~900 g;steamed rice~320 g dry;hard-boiled eggs~4;coconut palm sugar broth~900 ml;galangal bay coriander~50 g 4 leaves 2 tsp;fried shallots~1 cup|Indonesian,Vegetarian,Stew
Bakso Beef Noodle Soup|Indonesian|quickSoup|beef meatballs~700 g;rice noodles~350 g;bok choy bean sprouts~450 g;garlic beef broth~1.5 L;white pepper nutmeg celery leaf~2 tsp 1/4 tsp 1 cup;fried shallots and sambal~1 cup|Indonesian,Noodles,Soup
Martabak Telur|Indonesian|fried|spiced beef egg filling~700 g;thin wheat wrappers~8 large;scallion and onion~350 g;sweet sour pickle sauce~250 ml;curry powder pepper garlic~2 tsp 1 tsp 3 cloves;cucumber pickle~1 cup|Indonesian,Street Food,Fried
Dadar Gulung Coconut Crepes|Indonesian|dessertCook|rice flour batter~500 ml;grated coconut~300 g;pandan juice~120 ml;palm sugar syrup~220 ml;fine salt and pandan~1 pinch and 3 leaves;toasted sesame~2 tbsp|Indonesian,Dessert,Coconut
Chicken Adobo|Filipino|braise|bone-in chicken thighs~1 kg;steamed jasmine rice~320 g dry;onion~250 g;soy cane vinegar sauce~500 ml;bay leaf peppercorn garlic~4 leaves 2 tsp 8 cloves;scallion~1 cup|Filipino,Chicken,Braise
Pork Sinigang|Filipino|quickSoup|pork ribs~900 g;steamed rice~320 g dry;radish long beans water spinach~700 g;tamarind pork broth~1.5 L;fish sauce tomato chili~3 tbsp 2 and 2;scallion~1 cup|Filipino,Pork,Soup
Beef Kare Kare|Filipino|stew|oxtail and beef shank~1.2 kg;steamed rice~320 g dry;eggplant long beans bok choy~800 g;peanut annatto sauce~900 ml;garlic onion toasted rice~4 cloves 2 and 50 g;shrimp paste~120 g|Filipino,Beef,Stew
Chicken Inasal|Filipino|grill|chicken leg quarters~1.2 kg;garlic rice~320 g dry;green papaya pickle~300 g;calamansi annatto marinade~400 ml;lemongrass ginger garlic~3 stalks 40 g 5 cloves;calamansi and chili~1 cup|Filipino,Chicken,Grilled
Pancit Canton|Filipino|wok|pork shrimp and chicken~650 g;egg wheat noodles~500 g;cabbage carrot snow peas~600 g;soy oyster broth~350 ml;garlic pepper sesame oil~4 cloves 1 tsp 1 tbsp;calamansi and scallion~1 cup|Filipino,Noodles,Stir Fry
Lumpiang Shanghai|Filipino|fried|ground pork shrimp filling~700 g;spring roll wrappers~40;carrot scallion water chestnut~350 g;sweet chili banana ketchup~250 ml;garlic pepper soy~3 cloves 1 tsp 2 tbsp;scallion~1 cup|Filipino,Street Food,Fried
Bangus Sisig|Filipino|skillet|flaked milkfish~700 g;steamed garlic rice~320 g dry;onion chili bell pepper~400 g;calamansi mayonnaise sauce~220 ml;soy pepper garlic~2 tbsp 1 tsp 3 cloves;scallion and egg~1 cup and 4|Filipino,Seafood,Skillet
Laing Taro Leaves|Filipino|stew|dried taro leaves~200 g;steamed rice~320 g dry;pork belly and chili~450 g;coconut milk shrimp paste broth~900 ml;ginger garlic lemongrass~30 g 3 cloves 2 stalks;fried garlic~1/2 cup|Filipino,Coconut,Spicy
Arroz Caldo Chicken Porridge|Filipino|quickSoup|bone-in chicken~700 g;glutinous rice~280 g;ginger and onion~200 g;chicken fish sauce broth~1.5 L;garlic safflower pepper~4 cloves 1 tbsp 1 tsp;egg scallion calamansi~4 and 1 cup|Filipino,Breakfast,Chicken
Leche Flan|Filipino|dessertBake|egg yolks~10;evaporated milk~350 ml;condensed milk~400 g;caramel syrup~180 g;vanilla and calamansi zest~1 tsp each;fresh berries~1 cup|Filipino,Dessert,Custard
Nasi Lemak with Sambal|Malaysian|riceBowl|coconut pandan rice~800 g cooked;fried anchovies and peanuts~180 g;cucumber and boiled eggs~400 g;sambal ikan bilis~300 ml;pandan ginger fenugreek~3 leaves 30 g 1 tsp;fried peanuts and cucumber~1 cup|Malaysian,Rice,Breakfast
Penang Assam Laksa|Malaysian|slowSoup|poached mackerel~700 g;thick rice noodles~400 g;pineapple cucumber onion~500 g;tamarind fish broth~2 L;lemongrass torch ginger chili~3 stalks 1 bud 5;mint and shrimp paste~1 cup|Malaysian,Noodles,Seafood
Char Kway Teow|Malaysian|wok|shrimp Chinese sausage cockles~650 g;flat rice noodles~600 g;bean sprouts and chives~400 g;dark soy chili sauce~140 ml;garlic white pepper shrimp paste~4 cloves 1 tsp 1 tsp;fried lard and lime~1 cup|Malaysian,Noodles,Street Food
Hainanese Chicken Rice|Malaysian|slowSoup|whole chicken~1.5 kg;ginger chicken fat rice~400 g dry;cucumber~300 g;ginger scallion chili sauces~300 ml;pandan garlic ginger~3 leaves 5 cloves 60 g;cilantro and scallion~1 cup|Malaysian,Chicken,Rice
Beef Rendang Tok|Malaysian|stew|beef chuck~900 g;steamed rice~320 g dry;toasted coconut~150 g;coconut milk spice sauce~1 L;lemongrass galangal kaffir lime~3 stalks 60 g 8 leaves;fried shallots~1 cup|Malaysian,Beef,Spicy
Fish Head Curry|Malaysian|curry|red snapper head~1.2 kg;steamed rice~320 g dry;okra eggplant tomato~700 g;tamarind coconut curry~1 L;fish curry powder fenugreek curry leaf~4 tbsp 1 tsp 12 leaves;cilantro~1 cup|Malaysian,Seafood,Curry
Chicken Kapitan Curry|Malaysian|curry|chicken thighs~900 g;steamed jasmine rice~320 g dry;potato and onion~600 g;coconut lime curry~850 ml;belacan lemongrass turmeric~1 tbsp 3 stalks 2 tsp;fried shallots~1 cup|Malaysian,Chicken,Curry
Mee Rebus|Malaysian|noodle|boiled eggs and tofu~4 and 300 g;yellow wheat noodles~500 g;bean sprouts potato tomato~600 g;sweet potato shrimp gravy~800 ml;curry powder lemongrass chili~2 tbsp 2 stalks 2;fried shallots and lime~1 cup|Malaysian,Noodles,Vegetarian
Roti Jala with Chicken Curry|Malaysian|curry|chicken thighs~700 g;lacy turmeric crepes~16;potato and onion~600 g;coconut chicken curry~800 ml;curry powder turmeric fennel~3 tbsp 1 tsp 1 tsp;cilantro~1 cup|Malaysian,Chicken,Bread
Pandan Kaya Toast|Malaysian|sandwich|pandan coconut kaya~250 g;thick white bread~8 slices;salted butter~120 g;soft egg soy dip~250 ml;pandan vanilla coconut~3 leaves 1 tsp 200 ml;white pepper~1 tsp|Malaysian,Breakfast,Sweet
Moroccan Chicken Tagine|African|braise|chicken thighs~900 g;couscous~320 g dry;preserved lemon and olives~350 g;saffron chicken sauce~650 ml;ginger turmeric cinnamon~2 tsp each;cilantro and parsley~1 cup|African,Chicken,Braise
Ethiopian Doro Wat|African|stew|chicken drumsticks~900 g;injera flatbread~8 pieces;onion and boiled eggs~700 g;berbere chicken sauce~850 ml;berbere garlic niter kibbeh~4 tbsp 5 cloves 120 g;cilantro~1 cup|African,Chicken,Spicy
West African Peanut Stew|African|stew|chicken thighs~700 g;steamed rice~320 g dry;sweet potato tomato kale~800 g;peanut tomato broth~1 L;ginger chili cumin~30 g 2 and 2 tsp;cilantro and peanuts~1 cup|African,Chicken,Stew
Senegalese Fish Thieboudienne|African|riceBowl|stuffed whole fish~1 kg;broken rice~400 g;carrot cassava cabbage~900 g;tomato tamarind broth~900 ml;parsley chili garlic~1 cup 2 and 4 cloves;lime and parsley~1 cup|African,Seafood,Rice
Nigerian Jollof Rice Chicken|African|riceBowl|grilled chicken thighs~800 g;parboiled long-grain rice~400 g;tomato pepper onion~700 g;smoky tomato stock~850 ml;thyme curry powder bay~2 tsp 2 tsp 2 leaves;fried plantain~400 g|African,Chicken,Rice
South African Bobotie|African|bake|spiced ground beef~800 g;yellow rice~320 g dry;onion raisin apple~500 g;egg milk custard~500 ml;curry turmeric allspice~2 tbsp 1 tsp 1 tsp;chutney and almonds~1 cup|African,Beef,Baked
Egyptian Koshari|African|riceBowl|brown lentils~300 g;rice pasta chickpea mix~800 g cooked;caramelized onion~500 g;spicy tomato vinegar sauce~600 ml;cumin coriander garlic~2 tsp each;crispy onions~1 cup|African,Vegetarian,Rice
Tunisian Shakshuka Merguez|African|skillet|merguez sausage~500 g;crusty bread~8 slices;eggs tomato pepper~8 and 700 g;harissa tomato sauce~650 ml;caraway cumin garlic~1 tsp 2 tsp 3 cloves;cilantro~1 cup|African,Breakfast,Spicy
Kenyan Coconut Fish Curry|African|curry|white fish fillets~800 g;coconut rice~320 g dry;tomato and spinach~500 g;coconut tamarind sauce~750 ml;turmeric cumin coriander~2 tsp each;cilantro and lime~1 cup|African,Seafood,Curry
Malva Pudding|African|dessertBake|apricot sponge batter~700 g;cake flour~220 g;apricot jam~120 g;hot cream butter sauce~500 ml;baking soda vinegar vanilla~1 tsp 1 tbsp 1 tsp;vanilla custard~2 cups|African,Dessert,Cake
Mushroom Lentil Wellington|Vegetarian|bake|mushroom lentil filling~900 g;puff pastry~500 g;spinach and onion~400 g;Dijon herb glaze~150 ml;thyme garlic black pepper~2 tsp 3 cloves 1 tsp;parsley~1 cup|Vegetarian,Baked,Holiday
Roasted Cauliflower Shawarma Bowl|Vegetarian|roast|cauliflower florets~900 g;turmeric quinoa~320 g dry;tomato cucumber pickle~500 g;tahini lemon sauce~250 ml;cumin coriander paprika~2 tsp each;parsley and seeds~1 cup|Vegetarian,Vegan,Bowl
Tempeh Peanut Noodle Bowl|Vegetarian|noodle|tempeh strips~500 g;rice noodles~400 g;carrot cucumber cabbage~600 g;lime peanut sauce~300 ml;ginger chili soy~30 g 2 and 3 tbsp;cilantro and peanuts~1 cup|Vegetarian,Vegan,Noodles
Spinach Ricotta Stuffed Shells|Vegetarian|bake|ricotta spinach filling~800 g;jumbo pasta shells~30;tomato basil sauce~700 ml;mozzarella cream sauce~350 ml;nutmeg garlic oregano~1/4 tsp 3 cloves 2 tsp;parmesan and basil~200 g|Vegetarian,Pasta,Baked
Chickpea Sweet Potato Tagine|Vegetarian|stew|cooked chickpeas~700 g;couscous~320 g dry;sweet potato zucchini tomato~800 g;apricot tomato broth~850 ml;cumin cinnamon coriander~2 tsp each;cilantro and almonds~1 cup|Vegetarian,Vegan,Stew
Crispy Tofu Lettuce Cups|Vegetarian|wok|firm tofu~700 g;butter lettuce leaves~20;mushroom water chestnut carrot~500 g;hoisin lime sauce~180 ml;ginger garlic chili~30 g 3 cloves 1;scallion and peanuts~1 cup|Vegetarian,Vegan,High Protein
Beetroot Goat Cheese Tart|Vegetarian|bake|roasted beetroot~700 g;butter puff pastry~400 g;goat cheese and onion~350 g;balsamic honey glaze~150 ml;thyme black pepper salt~2 tsp 1 tsp 1/2 tsp;arugula and walnuts~2 cups|Vegetarian,Tart,Baked
Black Bean Quinoa Burgers|Vegetarian|skillet|black bean patties~700 g;whole-grain buns~4;avocado tomato lettuce~500 g;chipotle yogurt sauce~200 ml;cumin smoked paprika garlic~2 tsp each;pickled onion~1 cup|Vegetarian,Burger,High Protein
Pumpkin Sage Barley Risotto|Vegetarian|skillet|pearl barley~360 g;roasted pumpkin~600 g;leek and spinach~400 g;sage vegetable stock~1.2 L;sage nutmeg black pepper~20 leaves 1/4 tsp 1 tsp;parmesan and seeds~180 g|Vegetarian,Rice,Comfort Food
Vietnamese Lemongrass Tofu Bowl|Vegetarian|riceBowl|firm tofu~700 g;jasmine rice~320 g dry;pickled carrot cucumber~500 g;lime soy dressing~180 ml;lemongrass garlic chili~3 stalks 3 cloves 1;herbs and peanuts~2 cups|Vegetarian,Vegan,Vietnamese
Basque Burnt Cheesecake|Dessert|dessertBake|cream cheese~700 g;eggs~5 large;heavy cream~350 ml;vanilla sugar batter~850 g;cake flour and fine salt~25 g and 1/4 tsp;fresh berries~2 cups|Dessert,Cake,Baked
Japanese Cotton Cheesecake|Dessert|dessertBake|cream cheese~300 g;eggs~6 large;whole milk~150 ml;meringue sugar mixture~300 g;cake flour cornstarch lemon~80 g 30 g 1 tbsp;powdered sugar~30 g|Dessert,Cake,Japanese
French Lemon Tart|Dessert|dessertBake|lemon curd~600 g;sweet pastry shell~1 24-cm shell;egg yolks~6;lemon butter filling~700 ml;lemon zest and vanilla~2 tbsp and 1 tsp;torched meringue~300 g|Dessert,Tart,Citrus
Sticky Toffee Date Pudding|Dessert|dessertBake|pitted dates~350 g;cake flour~220 g;brown sugar~180 g;toffee cream sauce~450 ml;baking soda vanilla sea salt~1 tsp 1 tsp 1/4 tsp;vanilla ice cream~4 scoops|Dessert,Cake,Warm
Chocolate Mousse Pots|Dessert|dessertChill|dark chocolate~300 g;whipped cream~500 ml;egg yolks~4;espresso chocolate base~450 ml;vanilla and sea salt~1 tsp and 1 pinch;cocoa nibs and berries~1 cup|Dessert,Chocolate,Chilled
Coconut Pandan Chiffon Cake|Dessert|dessertBake|eggs~7 large;cake flour~220 g;coconut milk~180 ml;pandan sugar batter~500 ml;pandan extract cream of tartar~2 tsp and 1 tsp;toasted coconut~80 g|Dessert,Cake,Pandan
Apple Tarte Tatin|Dessert|dessertBake|firm apples~1 kg;butter puff pastry~350 g;caster sugar~180 g;caramel butter sauce~300 ml;vanilla cinnamon lemon~1 tsp 1/2 tsp 1 tbsp;crème fraîche~250 g|Dessert,Tart,Fruit
Black Sesame Panna Cotta|Dessert|dessertChill|heavy cream~600 ml;gelatin~8 g;black sesame paste~120 g;honey milk mixture~650 ml;vanilla and fine salt~1 tsp and 1 pinch;sesame brittle~100 g|Dessert,Chilled,Sesame
Mango Passion Fruit Pavlova|Dessert|dessertBake|egg whites~6;caster sugar~300 g;mango passion fruit~500 g;vanilla cream~450 ml;cornstarch vinegar vanilla~2 tsp 1 tsp 1 tsp;mint and lime zest~1 cup|Dessert,Meringue,Fruit
Vietnamese Banana Tapioca Pudding|Dessert|dessertCook|ripe bananas~600 g;small tapioca pearls~120 g;coconut milk~700 ml;palm sugar coconut sauce~300 ml;pandan and fine salt~2 leaves and 1 pinch;roasted peanuts sesame~100 g|Dessert,Vietnamese,Coconut
Salted Plum Soda|Drinks|drink|salted preserved plums~8;cold sparkling water~800 ml;fresh lime~2;plum sugar syrup~160 ml;fine salt and chili~1 pinch each;mint sprigs~8|Drinks,Vietnamese,Refreshing
Pandan Coconut Iced Latte|Drinks|drink|espresso shots~4;cold coconut milk~600 ml;pandan leaves~3;pandan palm sugar syrup~160 ml;vanilla and fine salt~1 tsp and 1 pinch;toasted coconut~60 g|Drinks,Coffee,Coconut
Thai Butterfly Pea Lime Tea|Drinks|drink|butterfly pea flowers~20 g;cold jasmine tea~700 ml;fresh lime juice~120 ml;honey syrup~140 ml;lemongrass and ginger~2 stalks and 20 g;lime wheels~8|Drinks,Tea,Thai
Korean Honey Citron Tea|Drinks|drink|citron marmalade~240 g;hot green tea~800 ml;fresh lemon~1;honey syrup~80 ml;ginger and cinnamon~20 g and 1 stick;pine nuts~30 g|Drinks,Tea,Korean
Japanese Hojicha Oat Latte|Drinks|drink|hojicha tea~20 g;cold oat milk~700 ml;espresso optional~2 shots;brown sugar syrup~120 ml;vanilla and sea salt~1 tsp and 1 pinch;toasted sesame~30 g|Drinks,Tea,Japanese
Indian Masala Chai|Drinks|drink|Assam black tea~20 g;whole milk~600 ml;fresh ginger~30 g;jaggery syrup~120 ml;cardamom cinnamon clove pepper~8 pods 1 stick 4 and 6;ground nutmeg~1 pinch|Drinks,Tea,Indian
Mexican Tamarind Agua Fresca|Drinks|drink|tamarind pulp~250 g;cold water~900 ml;fresh lime~2;piloncillo syrup~150 ml;chili and sea salt~1 pinch each;lime wheels~8|Drinks,Mexican,Fruit
Middle Eastern Mint Lemonade|Drinks|drink|fresh lemon juice~220 ml;cold sparkling water~700 ml;fresh mint leaves~2 cups;orange blossom syrup~150 ml;fine salt and cardamom~1 pinch each;lemon slices~8|Drinks,Lemonade,Refreshing
Italian Blood Orange Spritz|Drinks|drink|blood orange juice~400 ml;sparkling mineral water~500 ml;rosemary~4 sprigs;bitter orange syrup~120 ml;lemon juice and sea salt~40 ml and 1 pinch;orange wheels~8|Drinks,Italian,Citrus
African Hibiscus Ginger Cooler|Drinks|drink|dried hibiscus~35 g;cold water~900 ml;pineapple chunks~300 g;ginger honey syrup~160 ml;clove and lime~4 and 2;mint and pineapple leaves~1 cup|Drinks,African,Fruit
`

export const expandedRecipeCatalog = recipeLines
  .trim()
  .split('\n')
  .map((line) => parseLine(line.trim()))
