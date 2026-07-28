-- FoodStory generated recipe seed.
-- image_url is intentionally blank so you can paste your own image URL for each recipe.
-- Re-running this file replaces recipes whose titles match the generated seed titles.
USE foodstory;

START TRANSACTION;

INSERT INTO categories (name) VALUES
  ('Vietnamese'),
  ('Korean'),
  ('Japanese'),
  ('Thai'),
  ('Chinese'),
  ('Indian'),
  ('Italian'),
  ('Mexican'),
  ('Mediterranean'),
  ('American'),
  ('Vegetarian'),
  ('Seafood'),
  ('Breakfast'),
  ('Dessert'),
  ('Drinks'),
  ('Meal Prep')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO tags (name) VALUES
  ('Soup'),
  ('High Protein'),
  ('Comfort Food'),
  ('Student-friendly'),
  ('Meal Prep'),
  ('Healthy'),
  ('Quick Meal'),
  ('Fresh'),
  ('Family Dinner'),
  ('Seafood'),
  ('Street Food'),
  ('Vegetarian'),
  ('Spicy'),
  ('Dessert'),
  ('Breakfast'),
  ('Low Carb'),
  ('Drinks')
ON DUPLICATE KEY UPDATE name = VALUES(name);

DELETE FROM recipes WHERE title IN ('Hanoi Beef Pho', 'Saigon Lemongrass Chicken Rice', 'Fresh Shrimp Summer Rolls', 'Caramelized Pork Clay Pot', 'Turmeric Fish Noodle Bowl', 'Crispy Banh Mi Chicken Sandwich', 'Vietnamese Coconut Chicken Curry', 'Garlic Morning Glory Stir Fry', 'Kimchi Fried Rice with Egg', 'Beef Bulgogi Lettuce Bowls', 'Gochujang Tofu Stew', 'Bibimbap Vegetable Rice Bowl', 'Spicy Pork Noodle Stir Fry', 'Soy Garlic Crispy Chicken', 'Korean Seaweed Beef Soup', 'Japchae Glass Noodles', 'Salmon Teriyaki Donburi', 'Chicken Katsu Curry', 'Miso Tofu Soup', 'Tuna Mayo Onigiri Plate', 'Vegetable Yakisoba', 'Pork Gyoza Rice Plate', 'Soba Noodle Sesame Salad', 'Matcha Chia Pudding', 'Chicken Pad Thai', 'Green Curry Vegetables', 'Tom Yum Shrimp Soup', 'Basil Beef Stir Fry', 'Mango Sticky Rice', 'Thai Peanut Chicken Salad', 'Pineapple Fried Rice', 'Coconut Pumpkin Soup', 'Ginger Scallion Chicken Rice', 'Mapo Tofu with Mushrooms', 'Beef and Broccoli Stir Fry', 'Tomato Egg Noodle Soup', 'Char Siu Pork Bowls', 'Vegetable Chow Mein', 'Sesame Cucumber Salad', 'Pork Wonton Soup', 'Butter Chicken Curry', 'Chickpea Chana Masala', 'Palak Paneer Rice Bowl', 'Masala Dosa Potato Plate', 'Tandoori Cauliflower Bowls', 'Lentil Dal Tadka', 'Vegetable Biryani', 'Mango Lassi', 'Tomato Basil Spaghetti', 'Chicken Pesto Pasta', 'Mushroom Risotto', 'Margherita Flatbread', 'Tuscan White Bean Soup', 'Lemon Shrimp Linguine', 'Caprese Farro Salad', 'Tiramisu Overnight Cups', 'Chicken Tinga Tacos', 'Beef Taco Rice Bowl', 'Black Bean Enchilada Bake', 'Shrimp Fajita Skillet', 'Pozole Verde Chicken Soup', 'Street Corn Salad', 'Sweet Potato Quesadillas', 'Cinnamon Horchata', 'Greek Chicken Souvlaki Bowls', 'Falafel Chickpea Salad', 'Lemon Herb Salmon Couscous', 'Turkish Lentil Soup', 'Shakshuka Pepper Skillet', 'Lamb Kofta Pita Plates', 'Roasted Vegetable Hummus Bowl', 'Baklava Yogurt Parfaits', 'Turkey Meatball Pasta', 'BBQ Chicken Sheet Pan', 'Classic Beef Burger Bowl', 'Creamy Corn Chowder', 'Buffalo Cauliflower Wraps', 'Apple Cinnamon Oat Bake', 'Ranch Chicken Salad', 'Chocolate Chip Skillet Cookie', 'Tofu Quinoa Power Bowl', 'Lentil Mushroom Shepherd Pie', 'Chickpea Spinach Curry', 'Roasted Cauliflower Tacos', 'Sweet Potato Black Bean Chili', 'Pesto White Bean Toast', 'Zucchini Noodle Primavera', 'Sesame Edamame Rice Bowl', 'Garlic Butter Shrimp Rice', 'Coconut Fish Curry', 'Tuna Poke Bowl', 'Lemon Dill Cod Bake', 'Crab Corn Fritters', 'Mussel Tomato Stew', 'Salmon Sushi Bake', 'Scallop Pea Risotto', 'Spinach Feta Egg Muffins', 'Banana Oat Pancakes', 'Savory Breakfast Burrito', 'Berry Yogurt Parfait', 'Avocado Egg Toast', 'Smoked Salmon Bagel Plate', 'Apple Peanut Butter Overnight Oats', 'Breakfast Fried Rice', 'Dark Chocolate Brownies', 'Lemon Blueberry Cheesecake Cups', 'Coconut Mango Sago', 'Strawberry Shortcake Jars', 'Banana Bread Loaf', 'Peanut Butter Energy Bites', 'Vietnamese Coffee Flan', 'Cinnamon Baked Apples', 'Honey Kumquat Iced Tea', 'Cucumber Mint Limeade', 'Matcha Oat Latte', 'Vietnamese Iced Coffee', 'Watermelon Basil Cooler', 'Ginger Turmeric Tea', 'Strawberry Yogurt Smoothie', 'Pineapple Coconut Refresher', 'Sheet Pan Chicken and Vegetables', 'Turkey Quinoa Stuffed Peppers', 'Garlic Tofu Rice Boxes', 'Beef Burrito Freezer Bowls', 'Greek Pasta Salad Boxes', 'Lentil Soup Batch Pot', 'Teriyaki Salmon Lunch Boxes', 'Chickpea Couscous Jars');

-- Hanoi Beef Pho
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Hanoi Beef Pho',
    '/images/Hanoi%20Beef%20Pho.jpg',
    'Preparation:
1. Rinse and drain flat rice noodles. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim thinly sliced beef sirloin into even pieces. Pat it dry, season lightly with star anise, cinnamon, fish sauce, and keep it chilled while the broth develops flavor.
3. Cut yellow onion and ginger into bite-size pieces. Measure beef broth, then arrange bean sprouts, basil, lime, scallions on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and star anise, cinnamon, fish sauce; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in beef broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add thinly sliced beef sirloin and yellow onion and ginger. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place flat rice noodles in warm bowls, ladle the hot soup over the top, and finish with bean sprouts, basil, lime, scallions.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Hanoi Beef Pho is a brothy soup built around thinly sliced beef sirloin, flat rice noodles, and yellow onion and ginger. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    510,
    26,
    39,
    9
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'thinly sliced beef sirloin', '350g'),
  (@recipe_id, 'flat rice noodles', '450g fresh'),
  (@recipe_id, 'yellow onion and ginger', '1 onion, 1 thumb'),
  (@recipe_id, 'beef broth', '1.8L'),
  (@recipe_id, 'star anise, cinnamon, fish sauce', '3 pods, 1 stick, 3 tbsp'),
  (@recipe_id, 'bean sprouts, basil, lime, scallions', '1 platter'),
  (@recipe_id, 'beef meatballs', '200g'),
  (@recipe_id, 'rock sugar', '1 tbsp'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Soup', 'High Protein', 'Comfort Food');

-- Saigon Lemongrass Chicken Rice
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Saigon Lemongrass Chicken Rice',
    '/images/Saigon%20Lemongrass%20Chicken%20Rice.jpg',
    'Preparation:
1. Cook or warm jasmine rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season boneless chicken thighs with lemongrass, garlic, turmeric. Cut cucumber, carrot, and lettuce into similar-size pieces for even cooking and easy eating.
3. Whisk fish sauce lime dressing until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook boneless chicken thighs in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook cucumber, carrot, and lettuce until tender-crisp, scraping up any browned bits to build flavor.
3. Return boneless chicken thighs to the pan with a spoonful of fish sauce lime dressing. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide jasmine rice into bowls, add the cooked components, spoon over extra fish sauce lime dressing, and top with cilantro and fried shallots.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Saigon Lemongrass Chicken Rice is a complete rice or grain bowl built around boneless chicken thighs, jasmine rice, and cucumber, carrot, and lettuce. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    585,
    29,
    62,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'boneless chicken thighs', '500g'),
  (@recipe_id, 'jasmine rice', '2 cups cooked'),
  (@recipe_id, 'cucumber, carrot, and lettuce', '3 cups sliced'),
  (@recipe_id, 'fish sauce lime dressing', '1/3 cup'),
  (@recipe_id, 'lemongrass, garlic, turmeric', '3 stalks, 3 cloves, 1 tsp'),
  (@recipe_id, 'cilantro and fried shallots', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Student-friendly', 'Meal Prep');

-- Fresh Shrimp Summer Rolls
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Fresh Shrimp Summer Rolls',
    '/images/Fresh%20Shrimp%20Summer%20Rolls.jpg',
    'Preparation:
1. Wash and dry lettuce, mint, and cucumber thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare cooked shrimp halves and rice paper wrappers. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk peanut hoisin sauce with rice vinegar and fish sauce. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If cooked shrimp halves needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine rice paper wrappers with lettuce, mint, and cucumber in a wide bowl and toss with a small amount of dressing first.
3. Add cooked shrimp halves and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with crushed peanuts and herbs just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Fresh Shrimp Summer Rolls is a fresh salad built around cooked shrimp halves, rice paper wrappers, and lettuce, mint, and cucumber. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    490,
    22,
    38,
    15
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cooked shrimp halves', '250g'),
  (@recipe_id, 'rice paper wrappers', '12 sheets'),
  (@recipe_id, 'lettuce, mint, and cucumber', '4 cups'),
  (@recipe_id, 'peanut hoisin sauce', '1/2 cup'),
  (@recipe_id, 'rice vinegar and fish sauce', '2 tbsp each'),
  (@recipe_id, 'crushed peanuts and herbs', '1/3 cup'),
  (@recipe_id, 'rice vermicelli', '200g cooked'),
  (@recipe_id, 'pickled carrot', '1 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Healthy', 'Quick Meal', 'Fresh');

-- Caramelized Pork Clay Pot
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Caramelized Pork Clay Pot',
    '/images/Caramelized%20Pork%20Clay%20Pot.jpg',
    'Preparation:
1. Cut pork shoulder slices into sturdy portions and dry them well. Season on all sides with fish sauce, black pepper, caramel.
2. Prepare shallots and green onions and steamed jasmine rice before searing because the braise moves slowly once the pan is hot.
3. Measure coconut water and keep warm water or stock nearby so the pan can be deglazed cleanly.

Cooking:
1. Sear pork shoulder slices in a heavy pot until browned on several sides. Work in batches if needed so the meat does not steam.
2. Add shallots and green onions, cook until aromatic, then pour in coconut water. Scrape the bottom of the pot to dissolve the browned bits.
3. Cover and simmer gently until the protein is tender and the sauce is rich. If the liquid reduces too quickly, add a splash of water and lower the heat.

Serving and storage:
1. Rest the braise for 10 minutes, skim excess fat, and finish with cilantro and sliced chile.
2. Serve with steamed jasmine rice. Braises improve overnight, so cool completely before refrigerating and reheat gently.',
    'Caramelized Pork Clay Pot is a slow simmered braise built around pork shoulder slices, steamed jasmine rice, and shallots and green onions. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    665,
    36,
    38,
    25
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'pork shoulder slices', '600g'),
  (@recipe_id, 'steamed jasmine rice', '3 cups'),
  (@recipe_id, 'shallots and green onions', '1 cup'),
  (@recipe_id, 'coconut water', '1 cup'),
  (@recipe_id, 'fish sauce, black pepper, caramel', '3 tbsp, 1 tsp, 2 tbsp'),
  (@recipe_id, 'cilantro and sliced chile', '1/3 cup'),
  (@recipe_id, 'soft boiled eggs', '4'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'water or stock', '1 cup');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Comfort Food', 'Family Dinner');

-- Turmeric Fish Noodle Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Turmeric Fish Noodle Bowl',
    '/images/Turmeric%20Fish%20Noodle%20Bowl.jpg',
    'Preparation:
1. Cook rice vermicelli until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare white fish fillets and dill, scallions, and lettuce in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk pineapple fish sauce dressing with turmeric, galangal, shrimp paste. Set roasted peanuts and herbs near the serving bowls.

Cooking:
1. Sear or saute white fish fillets until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook dill, scallions, and lettuce until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in pineapple fish sauce dressing, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return white fish fillets to the pan, toss once more, and finish with roasted peanuts and herbs.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Turmeric Fish Noodle Bowl is a noodle dish built around white fish fillets, rice vermicelli, and dill, scallions, and lettuce. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    615,
    26,
    75,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'white fish fillets', '500g'),
  (@recipe_id, 'rice vermicelli', '300g'),
  (@recipe_id, 'dill, scallions, and lettuce', '4 cups'),
  (@recipe_id, 'pineapple fish sauce dressing', '1/2 cup'),
  (@recipe_id, 'turmeric, galangal, shrimp paste', '1 tbsp, 1 tsp, 1 tsp'),
  (@recipe_id, 'roasted peanuts and herbs', '1/2 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Fresh', 'High Protein');

-- Crispy Banh Mi Chicken Sandwich
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Crispy Banh Mi Chicken Sandwich',
    '/images/Crispy%20Banh%20Mi%20Chicken%20Sandwich.jpg',
    'Preparation:
1. Prepare crispy chicken cutlets first and keep it warm. Toast or warm baguette rolls so it can hold the filling without becoming soggy.
2. Slice pickled carrot, daikon, cucumber thinly and pat wet ingredients dry. This keeps every bite crisp and prevents the sauce from watering down.
3. Mix chile mayo with five spice and garlic powder. Taste for salt, heat, and acidity before assembling.

Cooking:
1. Heat a skillet and crisp or warm crispy chicken cutlets until the edges are browned.
2. Brush the inside of baguette rolls with a thin layer of chile mayo, then layer in pickled carrot, daikon, cucumber.
3. Add the warm filling and press gently so the sandwich holds together without crushing the bread.

Serving and storage:
1. Finish with cilantro and jalapeno. Slice and serve while the bread is still warm and crisp.
2. For packed lunches, keep the sauce separate and assemble close to eating time.',
    'Crispy Banh Mi Chicken Sandwich is a layered sandwich built around crispy chicken cutlets, baguette rolls, and pickled carrot, daikon, cucumber. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    585,
    24,
    59,
    22
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'crispy chicken cutlets', '4 pieces'),
  (@recipe_id, 'baguette rolls', '4'),
  (@recipe_id, 'pickled carrot, daikon, cucumber', '3 cups'),
  (@recipe_id, 'chile mayo', '1/2 cup'),
  (@recipe_id, 'five spice and garlic powder', '1 tsp each'),
  (@recipe_id, 'cilantro and jalapeno', '1 cup'),
  (@recipe_id, 'neutral oil or butter', '1 tbsp'),
  (@recipe_id, 'crisp lettuce or herbs', '1 handful');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Student-friendly', 'Street Food');

-- Vietnamese Coconut Chicken Curry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Vietnamese Coconut Chicken Curry',
    '/images/Vietnamese%20Coconut%20Chicken%20Curry.jpg',
    'Preparation:
1. Cut bone-in chicken pieces and potato, carrot, and onion into similar-size pieces so they finish cooking together.
2. Cook or warm warm baguette or rice. Curries are best when the base is ready before the sauce reaches its final texture.
3. Measure coconut milk and curry powder, lemongrass, fish sauce; curry spices can burn quickly, so keep them beside the pot.

Cooking:
1. Heat oil in a deep pan, add aromatics, then bloom curry powder, lemongrass, fish sauce for 30 to 60 seconds until fragrant.
2. Add bone-in chicken pieces and potato, carrot, and onion. Stir until coated, then pour in coconut milk.
3. Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.

Serving and storage:
1. Rest the curry for 5 minutes, then finish with Thai basil and lime.
2. Serve with warm baguette or rice. Store in shallow containers; the flavor deepens after one night in the refrigerator.',
    'Vietnamese Coconut Chicken Curry is a saucy curry built around bone-in chicken pieces, warm baguette or rice, and potato, carrot, and onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    610,
    31,
    60,
    22
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'bone-in chicken pieces', '700g'),
  (@recipe_id, 'warm baguette or rice', '4 portions'),
  (@recipe_id, 'potato, carrot, and onion', '4 cups'),
  (@recipe_id, 'coconut milk', '400ml'),
  (@recipe_id, 'curry powder, lemongrass, fish sauce', '2 tbsp, 2 stalks, 2 tbsp'),
  (@recipe_id, 'Thai basil and lime', '1 handful'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'onion and garlic', '1 onion, 3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Comfort Food', 'Family Dinner');

-- Garlic Morning Glory Stir Fry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vietnamese'),
    'Garlic Morning Glory Stir Fry',
    '/images/Garlic%20Morning%20Glory%20Stir%20Fry.jpg',
    'Preparation:
1. Cut morning glory stems into small even pieces so they cook quickly. Pat dry and season with half of fermented bean paste and garlic.
2. Prepare steamed rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice red chile and scallions thinly. Stir oyster sauce with the remaining fermented bean paste and garlic and keep fried garlic ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear morning glory stems until browned and nearly cooked through.
2. Add red chile and scallions and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add steamed rice and pour oyster sauce around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in fried garlic, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Garlic Morning Glory Stir Fry is a fast stir-fry built around morning glory stems, steamed rice, and red chile and scallions. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    645,
    26,
    54,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'morning glory stems', '500g'),
  (@recipe_id, 'steamed rice', '3 cups'),
  (@recipe_id, 'red chile and scallions', '1/2 cup'),
  (@recipe_id, 'oyster sauce', '2 tbsp'),
  (@recipe_id, 'fermented bean paste and garlic', '1 tbsp, 5 cloves'),
  (@recipe_id, 'fried garlic', '2 tbsp'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Quick Meal', 'Student-friendly');

-- Kimchi Fried Rice with Egg
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Kimchi Fried Rice with Egg',
    '/images/Kimchi%20Fried%20Rice%20with%20Egg.jpg',
    'Preparation:
1. Cut chopped napa kimchi into small even pieces so they cook quickly. Pat dry and season with half of soy sauce and sesame oil.
2. Prepare day-old rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice onion and peas thinly. Stir kimchi juice and gochujang with the remaining soy sauce and sesame oil and keep fried eggs and sesame seeds ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear chopped napa kimchi until browned and nearly cooked through.
2. Add onion and peas and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add day-old rice and pour kimchi juice and gochujang around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in fried eggs and sesame seeds, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Kimchi Fried Rice with Egg is a fast stir-fry built around chopped napa kimchi, day-old rice, and onion and peas. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    620,
    27,
    59,
    18
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chopped napa kimchi', '1 1/2 cups'),
  (@recipe_id, 'day-old rice', '3 cups'),
  (@recipe_id, 'onion and peas', '1 1/2 cups'),
  (@recipe_id, 'kimchi juice and gochujang', '1/3 cup'),
  (@recipe_id, 'soy sauce and sesame oil', '1 tbsp each'),
  (@recipe_id, 'fried eggs and sesame seeds', '4 eggs'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'Quick Meal', 'Student-friendly');

-- Beef Bulgogi Lettuce Bowls
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Beef Bulgogi Lettuce Bowls',
    '/images/Beef%20Bulgogi%20Lettuce%20Bowls.jpg',
    'Preparation:
1. Cook or warm short grain rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season thin sliced beef with garlic, ginger, sesame oil. Cut romaine lettuce and cucumber into similar-size pieces for even cooking and easy eating.
3. Whisk pear soy marinade until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook thin sliced beef in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook romaine lettuce and cucumber until tender-crisp, scraping up any browned bits to build flavor.
3. Return thin sliced beef to the pan with a spoonful of pear soy marinade. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide short grain rice into bowls, add the cooked components, spoon over extra pear soy marinade, and top with scallions and sesame seeds.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Beef Bulgogi Lettuce Bowls is a complete rice or grain bowl built around thin sliced beef, short grain rice, and romaine lettuce and cucumber. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    610,
    32,
    69,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'thin sliced beef', '500g'),
  (@recipe_id, 'short grain rice', '3 cups cooked'),
  (@recipe_id, 'romaine lettuce and cucumber', '4 cups'),
  (@recipe_id, 'pear soy marinade', '1/2 cup'),
  (@recipe_id, 'garlic, ginger, sesame oil', '4 cloves, 1 tsp, 1 tbsp'),
  (@recipe_id, 'scallions and sesame seeds', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Family Dinner');

-- Gochujang Tofu Stew
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Gochujang Tofu Stew',
    '/images/Gochujang%20Tofu%20Stew.jpg',
    'Preparation:
1. Rinse and drain short grain rice. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim firm tofu cubes into even pieces. Pat it dry, season lightly with gochujang and doenjang, and keep it chilled while the broth develops flavor.
3. Cut zucchini, mushroom, and onion into bite-size pieces. Measure anchovy or vegetable broth, then arrange scallions and sesame oil on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and gochujang and doenjang; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in anchovy or vegetable broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add firm tofu cubes and zucchini, mushroom, and onion. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place short grain rice in warm bowls, ladle the hot soup over the top, and finish with scallions and sesame oil.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Gochujang Tofu Stew is a brothy soup built around firm tofu cubes, short grain rice, and zucchini, mushroom, and onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    410,
    22,
    41,
    8
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'firm tofu cubes', '450g'),
  (@recipe_id, 'short grain rice', '3 cups cooked'),
  (@recipe_id, 'zucchini, mushroom, and onion', '4 cups'),
  (@recipe_id, 'anchovy or vegetable broth', '1.5L'),
  (@recipe_id, 'gochujang and doenjang', '2 tbsp each'),
  (@recipe_id, 'scallions and sesame oil', '1/3 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'Vegetarian', 'Soup');

-- Bibimbap Vegetable Rice Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Bibimbap Vegetable Rice Bowl',
    '/images/Bibimbap%20Vegetable%20Rice%20Bowl.jpg',
    'Preparation:
1. Cook or warm short grain rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season fried eggs with sesame oil and soy sauce. Cut spinach, carrot, bean sprouts into similar-size pieces for even cooking and easy eating.
3. Whisk gochujang bibimbap sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook fried eggs in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook spinach, carrot, bean sprouts until tender-crisp, scraping up any browned bits to build flavor.
3. Return fried eggs to the pan with a spoonful of gochujang bibimbap sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide short grain rice into bowls, add the cooked components, spoon over extra gochujang bibimbap sauce, and top with nori strips and sesame seeds.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Bibimbap Vegetable Rice Bowl is a complete rice or grain bowl built around fried eggs, short grain rice, and spinach, carrot, bean sprouts. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    685,
    31,
    66,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'fried eggs', '4'),
  (@recipe_id, 'short grain rice', '4 cups cooked'),
  (@recipe_id, 'spinach, carrot, bean sprouts', '5 cups'),
  (@recipe_id, 'gochujang bibimbap sauce', '1/2 cup'),
  (@recipe_id, 'sesame oil and soy sauce', '2 tbsp each'),
  (@recipe_id, 'nori strips and sesame seeds', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Healthy', 'Family Dinner');

-- Spicy Pork Noodle Stir Fry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Spicy Pork Noodle Stir Fry',
    '/images/Spicy%20Pork%20Noodle%20Stir%20Fry.jpg',
    'Preparation:
1. Cook wheat noodles until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare thin pork shoulder and cabbage and onion in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk gochujang soy sauce with ginger, garlic, chile flakes. Set scallions and sesame seeds near the serving bowls.

Cooking:
1. Sear or saute thin pork shoulder until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook cabbage and onion until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in gochujang soy sauce, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return thin pork shoulder to the pan, toss once more, and finish with scallions and sesame seeds.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Spicy Pork Noodle Stir Fry is a noodle dish built around thin pork shoulder, wheat noodles, and cabbage and onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    715,
    27,
    75,
    14
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'thin pork shoulder', '500g'),
  (@recipe_id, 'wheat noodles', '350g'),
  (@recipe_id, 'cabbage and onion', '4 cups'),
  (@recipe_id, 'gochujang soy sauce', '1/2 cup'),
  (@recipe_id, 'ginger, garlic, chile flakes', '1 tbsp total'),
  (@recipe_id, 'scallions and sesame seeds', '1/2 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'Comfort Food');

-- Soy Garlic Crispy Chicken
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Soy Garlic Crispy Chicken',
    '/images/Soy%20Garlic%20Crispy%20Chicken.jpg',
    'Preparation:
1. Cut chicken thigh bites into small even pieces so they cook quickly. Pat dry and season with half of rice flour and black pepper.
2. Prepare steamed rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice cabbage slaw thinly. Stir soy garlic glaze with the remaining rice flour and black pepper and keep sesame seeds and scallions ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear chicken thigh bites until browned and nearly cooked through.
2. Add cabbage slaw and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add steamed rice and pour soy garlic glaze around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in sesame seeds and scallions, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Soy Garlic Crispy Chicken is a fast stir-fry built around chicken thigh bites, steamed rice, and cabbage slaw. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    545,
    28,
    61,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chicken thigh bites', '600g'),
  (@recipe_id, 'steamed rice', '3 cups'),
  (@recipe_id, 'cabbage slaw', '3 cups'),
  (@recipe_id, 'soy garlic glaze', '1/2 cup'),
  (@recipe_id, 'rice flour and black pepper', '1/2 cup, 1 tsp'),
  (@recipe_id, 'sesame seeds and scallions', '1/3 cup'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Student-friendly');

-- Korean Seaweed Beef Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Korean Seaweed Beef Soup',
    '/images/Korean%20Seaweed%20Beef%20Soup.jpg',
    'Preparation:
1. Rinse and drain steamed rice. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim lean beef strips into even pieces. Pat it dry, season lightly with garlic, soy sauce, sesame oil, and keep it chilled while the broth develops flavor.
3. Cut dried seaweed into bite-size pieces. Measure beef broth, then arrange scallions on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and garlic, soy sauce, sesame oil; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in beef broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add lean beef strips and dried seaweed. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place steamed rice in warm bowls, ladle the hot soup over the top, and finish with scallions.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Korean Seaweed Beef Soup is a brothy soup built around lean beef strips, steamed rice, and dried seaweed. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    385,
    26,
    45,
    10
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'lean beef strips', '300g'),
  (@recipe_id, 'steamed rice', '3 cups'),
  (@recipe_id, 'dried seaweed', '25g'),
  (@recipe_id, 'beef broth', '1.4L'),
  (@recipe_id, 'garlic, soy sauce, sesame oil', '3 cloves, 2 tbsp, 1 tbsp'),
  (@recipe_id, 'scallions', '1/3 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Healthy', 'Soup', 'High Protein');

-- Japchae Glass Noodles
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Korean'),
    'Japchae Glass Noodles',
    '/images/Japchae%20Glass%20Noodles.jpg',
    'Preparation:
1. Cook sweet potato glass noodles until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare beef strips or tofu and spinach, carrot, mushroom in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk soy sesame sauce with garlic and black pepper. Set sesame seeds near the serving bowls.

Cooking:
1. Sear or saute beef strips or tofu until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook spinach, carrot, mushroom until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in soy sesame sauce, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return beef strips or tofu to the pan, toss once more, and finish with sesame seeds.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Japchae Glass Noodles is a noodle dish built around beef strips or tofu, sweet potato glass noodles, and spinach, carrot, mushroom. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    690,
    28,
    82,
    18
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'beef strips or tofu', '350g'),
  (@recipe_id, 'sweet potato glass noodles', '350g'),
  (@recipe_id, 'spinach, carrot, mushroom', '5 cups'),
  (@recipe_id, 'soy sesame sauce', '1/2 cup'),
  (@recipe_id, 'garlic and black pepper', '3 cloves, 1 tsp'),
  (@recipe_id, 'sesame seeds', '2 tbsp'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Family Dinner', 'Vegetarian');

-- Salmon Teriyaki Donburi
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Salmon Teriyaki Donburi',
    '/images/Salmon%20Teriyaki%20Donburi.jpg',
    'Preparation:
1. Cook or warm Japanese rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season salmon fillets with ginger and garlic. Cut broccoli and cucumber into similar-size pieces for even cooking and easy eating.
3. Whisk teriyaki sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook salmon fillets in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook broccoli and cucumber until tender-crisp, scraping up any browned bits to build flavor.
3. Return salmon fillets to the pan with a spoonful of teriyaki sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide Japanese rice into bowls, add the cooked components, spoon over extra teriyaki sauce, and top with furikake and scallions.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Salmon Teriyaki Donburi is a complete rice or grain bowl built around salmon fillets, Japanese rice, and broccoli and cucumber. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    710,
    32,
    68,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'salmon fillets', '4 small'),
  (@recipe_id, 'Japanese rice', '4 cups cooked'),
  (@recipe_id, 'broccoli and cucumber', '4 cups'),
  (@recipe_id, 'teriyaki sauce', '1/2 cup'),
  (@recipe_id, 'ginger and garlic', '1 tbsp each'),
  (@recipe_id, 'furikake and scallions', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'High Protein', 'Healthy');

-- Chicken Katsu Curry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Chicken Katsu Curry',
    '/images/Chicken%20Katsu%20Curry.jpg',
    'Preparation:
1. Cut breaded chicken cutlets and potato, carrot, and onion into similar-size pieces so they finish cooking together.
2. Cook or warm Japanese rice. Curries are best when the base is ready before the sauce reaches its final texture.
3. Measure Japanese curry sauce and curry powder and soy sauce; curry spices can burn quickly, so keep them beside the pot.

Cooking:
1. Heat oil in a deep pan, add aromatics, then bloom curry powder and soy sauce for 30 to 60 seconds until fragrant.
2. Add breaded chicken cutlets and potato, carrot, and onion. Stir until coated, then pour in Japanese curry sauce.
3. Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.

Serving and storage:
1. Rest the curry for 5 minutes, then finish with pickled ginger and scallions.
2. Serve with Japanese rice. Store in shallow containers; the flavor deepens after one night in the refrigerator.',
    'Chicken Katsu Curry is a saucy curry built around breaded chicken cutlets, Japanese rice, and potato, carrot, and onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    710,
    27,
    56,
    23
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'breaded chicken cutlets', '4'),
  (@recipe_id, 'Japanese rice', '4 cups cooked'),
  (@recipe_id, 'potato, carrot, and onion', '4 cups'),
  (@recipe_id, 'Japanese curry sauce', '3 cups'),
  (@recipe_id, 'curry powder and soy sauce', '2 tsp, 1 tbsp'),
  (@recipe_id, 'pickled ginger and scallions', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'onion and garlic', '1 onion, 3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Comfort Food', 'Family Dinner');

-- Miso Tofu Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Miso Tofu Soup',
    '/images/Miso%20Tofu%20Soup.jpg',
    'Preparation:
1. Rinse and drain steamed rice. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim silken tofu cubes into even pieces. Pat it dry, season lightly with white miso paste, and keep it chilled while the broth develops flavor.
3. Cut wakame and mushrooms into bite-size pieces. Measure dashi broth, then arrange scallions on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and white miso paste; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in dashi broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add silken tofu cubes and wakame and mushrooms. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place steamed rice in warm bowls, ladle the hot soup over the top, and finish with scallions.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Miso Tofu Soup is a brothy soup built around silken tofu cubes, steamed rice, and wakame and mushrooms. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    360,
    26,
    38,
    7
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'silken tofu cubes', '350g'),
  (@recipe_id, 'steamed rice', '3 cups'),
  (@recipe_id, 'wakame and mushrooms', '2 cups'),
  (@recipe_id, 'dashi broth', '1.4L'),
  (@recipe_id, 'white miso paste', '3 tbsp'),
  (@recipe_id, 'scallions', '1/3 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Healthy', 'Vegetarian', 'Soup');

-- Tuna Mayo Onigiri Plate
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Tuna Mayo Onigiri Plate',
    '/images/Tuna%20Mayo%20Onigiri%20Plate.jpg',
    'Preparation:
1. Cook or warm sushi rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season canned tuna with rice vinegar and soy sauce. Cut cucumber and avocado into similar-size pieces for even cooking and easy eating.
3. Whisk Japanese mayo until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook canned tuna in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook cucumber and avocado until tender-crisp, scraping up any browned bits to build flavor.
3. Return canned tuna to the pan with a spoonful of Japanese mayo. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide sushi rice into bowls, add the cooked components, spoon over extra Japanese mayo, and top with nori sheets and sesame seeds.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Tuna Mayo Onigiri Plate is a complete rice or grain bowl built around canned tuna, sushi rice, and cucumber and avocado. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    685,
    31,
    65,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'canned tuna', '2 cans'),
  (@recipe_id, 'sushi rice', '4 cups cooked'),
  (@recipe_id, 'cucumber and avocado', '3 cups'),
  (@recipe_id, 'Japanese mayo', '1/3 cup'),
  (@recipe_id, 'rice vinegar and soy sauce', '2 tbsp each'),
  (@recipe_id, 'nori sheets and sesame seeds', '6 sheets'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Quick Meal', 'Student-friendly');

-- Vegetable Yakisoba
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Vegetable Yakisoba',
    '/images/Vegetable%20Yakisoba.jpg',
    'Preparation:
1. Cook yakisoba noodles until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare sliced tofu or pork and cabbage, carrot, onion in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk yakisoba sauce with ginger and white pepper. Set pickled ginger and scallions near the serving bowls.

Cooking:
1. Sear or saute sliced tofu or pork until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook cabbage, carrot, onion until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in yakisoba sauce, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return sliced tofu or pork to the pan, toss once more, and finish with pickled ginger and scallions.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Vegetable Yakisoba is a noodle dish built around sliced tofu or pork, yakisoba noodles, and cabbage, carrot, onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    715,
    27,
    75,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'sliced tofu or pork', '350g'),
  (@recipe_id, 'yakisoba noodles', '400g'),
  (@recipe_id, 'cabbage, carrot, onion', '5 cups'),
  (@recipe_id, 'yakisoba sauce', '1/2 cup'),
  (@recipe_id, 'ginger and white pepper', '1 tsp each'),
  (@recipe_id, 'pickled ginger and scallions', '1/3 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Quick Meal', 'Street Food');

-- Pork Gyoza Rice Plate
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Pork Gyoza Rice Plate',
    '/images/Pork%20Gyoza%20Rice%20Plate.jpg',
    'Preparation:
1. Prepare pork gyoza, Japanese rice, and shredded cabbage before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with sesame oil and ginger. Keep ponzu dipping sauce measured and ready.
3. Warm plates or tortillas if needed, and set scallions and sesame seeds aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook pork gyoza until browned and nearly done.
2. Add shredded cabbage and cook until softened. Stir in Japanese rice if it needs heating or crisping.
3. Lower the heat, add ponzu dipping sauce, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with scallions and sesame seeds and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Pork Gyoza Rice Plate is a one-pan skillet meal built around pork gyoza, Japanese rice, and shredded cabbage. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    505,
    26,
    51,
    16
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'pork gyoza', '24 pieces'),
  (@recipe_id, 'Japanese rice', '4 cups cooked'),
  (@recipe_id, 'shredded cabbage', '4 cups'),
  (@recipe_id, 'ponzu dipping sauce', '1/3 cup'),
  (@recipe_id, 'sesame oil and ginger', '1 tbsp, 1 tsp'),
  (@recipe_id, 'scallions and sesame seeds', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Student-friendly', 'Family Dinner');

-- Soba Noodle Sesame Salad
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Soba Noodle Sesame Salad',
    '/images/Soba%20Noodle%20Sesame%20Salad.jpg',
    'Preparation:
1. Wash and dry cucumber, carrot, radish thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare edamame and soba noodles. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk sesame soy dressing with rice vinegar and wasabi. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If edamame needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine soba noodles with cucumber, carrot, radish in a wide bowl and toss with a small amount of dressing first.
3. Add edamame and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with nori strips and sesame just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Soba Noodle Sesame Salad is a fresh salad built around edamame, soba noodles, and cucumber, carrot, radish. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    415,
    18,
    35,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'edamame', '1 1/2 cups'),
  (@recipe_id, 'soba noodles', '300g'),
  (@recipe_id, 'cucumber, carrot, radish', '4 cups'),
  (@recipe_id, 'sesame soy dressing', '1/2 cup'),
  (@recipe_id, 'rice vinegar and wasabi', '2 tbsp, 1 tsp'),
  (@recipe_id, 'nori strips and sesame', '1/3 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Healthy', 'Vegetarian', 'Meal Prep');

-- Matcha Chia Pudding
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Japanese'),
    'Matcha Chia Pudding',
    '/images/Matcha%20Chia%20Pudding.jpg',
    'Preparation:
1. Set out chia seeds, oat milk, and berries. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure maple syrup and matcha powder and vanilla accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine chia seeds with oat milk until evenly mixed. Fold in berries gently so it stays distinct.
2. Add maple syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with toasted coconut just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Matcha Chia Pudding is a sweet dessert built around chia seeds, oat milk, and berries. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    480,
    6,
    50,
    13
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chia seeds', '1/2 cup'),
  (@recipe_id, 'oat milk', '2 cups'),
  (@recipe_id, 'berries', '1 cup'),
  (@recipe_id, 'maple syrup', '3 tbsp'),
  (@recipe_id, 'matcha powder and vanilla', '2 tsp, 1 tsp'),
  (@recipe_id, 'toasted coconut', '1/4 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Healthy', 'Vegetarian');

-- Chicken Pad Thai
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Chicken Pad Thai',
    '/images/Chicken%20Pad%20Thai.jpg',
    'Preparation:
1. Cut chicken breast strips into small even pieces so they cook quickly. Pat dry and season with half of palm sugar and chile flakes.
2. Prepare rice noodles before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice bean sprouts and garlic chives thinly. Stir tamarind fish sauce with the remaining palm sugar and chile flakes and keep peanuts, lime, cilantro ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear chicken breast strips until browned and nearly cooked through.
2. Add bean sprouts and garlic chives and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add rice noodles and pour tamarind fish sauce around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in peanuts, lime, cilantro, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Chicken Pad Thai is a fast stir-fry built around chicken breast strips, rice noodles, and bean sprouts and garlic chives. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    595,
    30,
    59,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chicken breast strips', '450g'),
  (@recipe_id, 'rice noodles', '350g'),
  (@recipe_id, 'bean sprouts and garlic chives', '4 cups'),
  (@recipe_id, 'tamarind fish sauce', '1/2 cup'),
  (@recipe_id, 'palm sugar and chile flakes', '2 tbsp, 1 tsp'),
  (@recipe_id, 'peanuts, lime, cilantro', '1/2 cup'),
  (@recipe_id, 'eggs', '2'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Quick Meal', 'Street Food');

-- Green Curry Vegetables
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Green Curry Vegetables',
    '/images/Green%20Curry%20Vegetables.jpg',
    'Preparation:
1. Cut firm tofu cubes and eggplant, bamboo shoots, peppers into similar-size pieces so they finish cooking together.
2. Cook or warm jasmine rice. Curries are best when the base is ready before the sauce reaches its final texture.
3. Measure coconut milk and green curry paste and fish sauce; curry spices can burn quickly, so keep them beside the pot.

Cooking:
1. Heat oil in a deep pan, add aromatics, then bloom green curry paste and fish sauce for 30 to 60 seconds until fragrant.
2. Add firm tofu cubes and eggplant, bamboo shoots, peppers. Stir until coated, then pour in coconut milk.
3. Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.

Serving and storage:
1. Rest the curry for 5 minutes, then finish with Thai basil and lime.
2. Serve with jasmine rice. Store in shallow containers; the flavor deepens after one night in the refrigerator.',
    'Green Curry Vegetables is a saucy curry built around firm tofu cubes, jasmine rice, and eggplant, bamboo shoots, peppers. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    760,
    27,
    55,
    27
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'firm tofu cubes', '450g'),
  (@recipe_id, 'jasmine rice', '4 cups cooked'),
  (@recipe_id, 'eggplant, bamboo shoots, peppers', '5 cups'),
  (@recipe_id, 'coconut milk', '400ml'),
  (@recipe_id, 'green curry paste and fish sauce', '3 tbsp, 1 tbsp'),
  (@recipe_id, 'Thai basil and lime', '1 handful'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'onion and garlic', '1 onion, 3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'Vegetarian', 'Family Dinner');

-- Tom Yum Shrimp Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Tom Yum Shrimp Soup',
    '/images/Tom%20Yum%20Shrimp%20Soup.jpg',
    'Preparation:
1. Rinse and drain jasmine rice. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim shrimp into even pieces. Pat it dry, season lightly with lime leaves, galangal, fish sauce, and keep it chilled while the broth develops flavor.
3. Cut mushrooms and tomato into bite-size pieces. Measure lemongrass broth, then arrange cilantro and lime wedges on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and lime leaves, galangal, fish sauce; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in lemongrass broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add shrimp and mushrooms and tomato. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place jasmine rice in warm bowls, ladle the hot soup over the top, and finish with cilantro and lime wedges.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Tom Yum Shrimp Soup is a brothy soup built around shrimp, jasmine rice, and mushrooms and tomato. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    385,
    22,
    40,
    12
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shrimp', '400g'),
  (@recipe_id, 'jasmine rice', '3 cups cooked'),
  (@recipe_id, 'mushrooms and tomato', '3 cups'),
  (@recipe_id, 'lemongrass broth', '1.5L'),
  (@recipe_id, 'lime leaves, galangal, fish sauce', '6 leaves, 4 slices, 2 tbsp'),
  (@recipe_id, 'cilantro and lime wedges', '1/2 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'Seafood', 'Soup');

-- Basil Beef Stir Fry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Basil Beef Stir Fry',
    '/images/Basil%20Beef%20Stir%20Fry.jpg',
    'Preparation:
1. Cut ground beef into small even pieces so they cook quickly. Pat dry and season with half of garlic and Thai chile.
2. Prepare jasmine rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice green beans and bell pepper thinly. Stir oyster fish sauce blend with the remaining garlic and Thai chile and keep holy basil and fried egg ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear ground beef until browned and nearly cooked through.
2. Add green beans and bell pepper and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add jasmine rice and pour oyster fish sauce blend around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in holy basil and fried egg, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Basil Beef Stir Fry is a fast stir-fry built around ground beef, jasmine rice, and green beans and bell pepper. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    520,
    26,
    57,
    15
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ground beef', '500g'),
  (@recipe_id, 'jasmine rice', '4 cups cooked'),
  (@recipe_id, 'green beans and bell pepper', '4 cups'),
  (@recipe_id, 'oyster fish sauce blend', '1/3 cup'),
  (@recipe_id, 'garlic and Thai chile', '5 cloves, 2 chiles'),
  (@recipe_id, 'holy basil and fried egg', '1 cup'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'High Protein', 'Quick Meal');

-- Mango Sticky Rice
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Mango Sticky Rice',
    '/images/Mango%20Sticky%20Rice.jpg',
    'Preparation:
1. Set out ripe mango slices, sticky rice, and coconut cream. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure palm sugar syrup and sea salt and pandan accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine ripe mango slices with sticky rice until evenly mixed. Fold in coconut cream gently so it stays distinct.
2. Add palm sugar syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with toasted sesame seeds just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Mango Sticky Rice is a sweet dessert built around ripe mango slices, sticky rice, and coconut cream. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    455,
    4,
    45,
    10
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ripe mango slices', '3 mangoes'),
  (@recipe_id, 'sticky rice', '2 cups cooked'),
  (@recipe_id, 'coconut cream', '1 cup'),
  (@recipe_id, 'palm sugar syrup', '1/3 cup'),
  (@recipe_id, 'sea salt and pandan', '1 pinch, 1 leaf'),
  (@recipe_id, 'toasted sesame seeds', '2 tbsp'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Vegetarian');

-- Thai Peanut Chicken Salad
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Thai Peanut Chicken Salad',
    '/images/Thai%20Peanut%20Chicken%20Salad.jpg',
    'Preparation:
1. Wash and dry cabbage, carrot, cucumber thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare grilled chicken breast and rice noodles. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk peanut lime dressing with ginger, garlic, fish sauce. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If grilled chicken breast needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine rice noodles with cabbage, carrot, cucumber in a wide bowl and toss with a small amount of dressing first.
3. Add grilled chicken breast and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with mint, cilantro, peanuts just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Thai Peanut Chicken Salad is a fresh salad built around grilled chicken breast, rice noodles, and cabbage, carrot, cucumber. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    465,
    18,
    37,
    16
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'grilled chicken breast', '450g'),
  (@recipe_id, 'rice noodles', '250g cooked'),
  (@recipe_id, 'cabbage, carrot, cucumber', '5 cups'),
  (@recipe_id, 'peanut lime dressing', '1/2 cup'),
  (@recipe_id, 'ginger, garlic, fish sauce', '1 tbsp total'),
  (@recipe_id, 'mint, cilantro, peanuts', '1/2 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Healthy', 'High Protein', 'Meal Prep');

-- Pineapple Fried Rice
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Pineapple Fried Rice',
    '/images/Pineapple%20Fried%20Rice.jpg',
    'Preparation:
1. Cut shrimp or tofu into small even pieces so they cook quickly. Pat dry and season with half of curry powder and white pepper.
2. Prepare day-old jasmine rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice pineapple, peas, bell pepper thinly. Stir soy fish sauce blend with the remaining curry powder and white pepper and keep cashews and cilantro ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear shrimp or tofu until browned and nearly cooked through.
2. Add pineapple, peas, bell pepper and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add day-old jasmine rice and pour soy fish sauce blend around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in cashews and cilantro, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Pineapple Fried Rice is a fast stir-fry built around shrimp or tofu, day-old jasmine rice, and pineapple, peas, bell pepper. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    645,
    28,
    58,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shrimp or tofu', '400g'),
  (@recipe_id, 'day-old jasmine rice', '4 cups'),
  (@recipe_id, 'pineapple, peas, bell pepper', '4 cups'),
  (@recipe_id, 'soy fish sauce blend', '1/3 cup'),
  (@recipe_id, 'curry powder and white pepper', '2 tsp, 1 tsp'),
  (@recipe_id, 'cashews and cilantro', '1/2 cup'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Quick Meal', 'Family Dinner');

-- Coconut Pumpkin Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Thai'),
    'Coconut Pumpkin Soup',
    '/images/Coconut%20Pumpkin%20Soup.jpg',
    'Preparation:
1. Rinse and drain jasmine rice. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim roasted pumpkin into even pieces. Pat it dry, season lightly with red curry paste and lime, and keep it chilled while the broth develops flavor.
3. Cut onion and carrot into bite-size pieces. Measure coconut milk broth, then arrange Thai basil and pumpkin seeds on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and red curry paste and lime; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in coconut milk broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add roasted pumpkin and onion and carrot. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place jasmine rice in warm bowls, ladle the hot soup over the top, and finish with Thai basil and pumpkin seeds.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Coconut Pumpkin Soup is a brothy soup built around roasted pumpkin, jasmine rice, and onion and carrot. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    485,
    25,
    42,
    10
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'roasted pumpkin', '700g'),
  (@recipe_id, 'jasmine rice', '3 cups cooked'),
  (@recipe_id, 'onion and carrot', '2 cups'),
  (@recipe_id, 'coconut milk broth', '1.2L'),
  (@recipe_id, 'red curry paste and lime', '2 tbsp, 1 lime'),
  (@recipe_id, 'Thai basil and pumpkin seeds', '1/3 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Soup', 'Comfort Food');

-- Ginger Scallion Chicken Rice
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Ginger Scallion Chicken Rice',
    '/images/Ginger%20Scallion%20Chicken%20Rice.jpg',
    'Preparation:
1. Cook or warm jasmine rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season poached chicken thighs with soy sauce and sesame oil. Cut bok choy into similar-size pieces for even cooking and easy eating.
3. Whisk ginger scallion oil until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook poached chicken thighs in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook bok choy until tender-crisp, scraping up any browned bits to build flavor.
3. Return poached chicken thighs to the pan with a spoonful of ginger scallion oil. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide jasmine rice into bowls, add the cooked components, spoon over extra ginger scallion oil, and top with cilantro and cucumber.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Ginger Scallion Chicken Rice is a complete rice or grain bowl built around poached chicken thighs, jasmine rice, and bok choy. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    660,
    29,
    69,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'poached chicken thighs', '600g'),
  (@recipe_id, 'jasmine rice', '4 cups cooked'),
  (@recipe_id, 'bok choy', '4 cups'),
  (@recipe_id, 'ginger scallion oil', '1/2 cup'),
  (@recipe_id, 'soy sauce and sesame oil', '2 tbsp each'),
  (@recipe_id, 'cilantro and cucumber', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Family Dinner');

-- Mapo Tofu with Mushrooms
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Mapo Tofu with Mushrooms',
    '/images/Mapo%20Tofu%20with%20Mushrooms.jpg',
    'Preparation:
1. Cut firm tofu cubes into small even pieces so they cook quickly. Pat dry and season with half of Sichuan pepper and garlic.
2. Prepare steamed rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice shiitake mushrooms and peas thinly. Stir doubanjiang sauce with the remaining Sichuan pepper and garlic and keep scallions ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear firm tofu cubes until browned and nearly cooked through.
2. Add shiitake mushrooms and peas and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add steamed rice and pour doubanjiang sauce around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in scallions, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Mapo Tofu with Mushrooms is a fast stir-fry built around firm tofu cubes, steamed rice, and shiitake mushrooms and peas. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    520,
    30,
    59,
    18
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'firm tofu cubes', '500g'),
  (@recipe_id, 'steamed rice', '4 cups'),
  (@recipe_id, 'shiitake mushrooms and peas', '3 cups'),
  (@recipe_id, 'doubanjiang sauce', '1/3 cup'),
  (@recipe_id, 'Sichuan pepper and garlic', '1 tsp, 4 cloves'),
  (@recipe_id, 'scallions', '1/2 cup'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'Vegetarian', 'Comfort Food');

-- Beef and Broccoli Stir Fry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Beef and Broccoli Stir Fry',
    '/images/Beef%20and%20Broccoli%20Stir%20Fry.jpg',
    'Preparation:
1. Cut flank steak slices into small even pieces so they cook quickly. Pat dry and season with half of ginger, garlic, cornstarch.
2. Prepare steamed rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice broccoli florets thinly. Stir oyster soy sauce with the remaining ginger, garlic, cornstarch and keep sesame seeds ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear flank steak slices until browned and nearly cooked through.
2. Add broccoli florets and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add steamed rice and pour oyster soy sauce around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in sesame seeds, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Beef and Broccoli Stir Fry is a fast stir-fry built around flank steak slices, steamed rice, and broccoli florets. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    595,
    27,
    54,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'flank steak slices', '500g'),
  (@recipe_id, 'steamed rice', '4 cups'),
  (@recipe_id, 'broccoli florets', '5 cups'),
  (@recipe_id, 'oyster soy sauce', '1/2 cup'),
  (@recipe_id, 'ginger, garlic, cornstarch', '1 tbsp, 4 cloves, 1 tbsp'),
  (@recipe_id, 'sesame seeds', '2 tbsp'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Quick Meal');

-- Tomato Egg Noodle Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Tomato Egg Noodle Soup',
    '/images/Tomato%20Egg%20Noodle%20Soup.jpg',
    'Preparation:
1. Rinse and drain wheat noodles. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim eggs into even pieces. Pat it dry, season lightly with white pepper and soy sauce, and keep it chilled while the broth develops flavor.
3. Cut ripe tomatoes and spinach into bite-size pieces. Measure chicken or vegetable broth, then arrange scallions and cilantro on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and white pepper and soy sauce; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in chicken or vegetable broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add eggs and ripe tomatoes and spinach. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place wheat noodles in warm bowls, ladle the hot soup over the top, and finish with scallions and cilantro.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Tomato Egg Noodle Soup is a brothy soup built around eggs, wheat noodles, and ripe tomatoes and spinach. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    385,
    23,
    39,
    7
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'eggs', '4'),
  (@recipe_id, 'wheat noodles', '350g'),
  (@recipe_id, 'ripe tomatoes and spinach', '5 cups'),
  (@recipe_id, 'chicken or vegetable broth', '1.4L'),
  (@recipe_id, 'white pepper and soy sauce', '1 tsp, 2 tbsp'),
  (@recipe_id, 'scallions and cilantro', '1/2 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Quick Meal', 'Soup', 'Student-friendly');

-- Char Siu Pork Bowls
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Char Siu Pork Bowls',
    '/images/Char%20Siu%20Pork%20Bowls.jpg',
    'Preparation:
1. Cook or warm jasmine rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season char siu pork slices with five spice and garlic. Cut steamed gai lan into similar-size pieces for even cooking and easy eating.
3. Whisk hoisin honey glaze until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook char siu pork slices in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook steamed gai lan until tender-crisp, scraping up any browned bits to build flavor.
3. Return char siu pork slices to the pan with a spoonful of hoisin honey glaze. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide jasmine rice into bowls, add the cooked components, spoon over extra hoisin honey glaze, and top with sesame seeds and scallions.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Char Siu Pork Bowls is a complete rice or grain bowl built around char siu pork slices, jasmine rice, and steamed gai lan. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    710,
    32,
    62,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'char siu pork slices', '500g'),
  (@recipe_id, 'jasmine rice', '4 cups cooked'),
  (@recipe_id, 'steamed gai lan', '4 cups'),
  (@recipe_id, 'hoisin honey glaze', '1/3 cup'),
  (@recipe_id, 'five spice and garlic', '1 tsp, 3 cloves'),
  (@recipe_id, 'sesame seeds and scallions', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Family Dinner', 'Meal Prep');

-- Vegetable Chow Mein
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Vegetable Chow Mein',
    '/images/Vegetable%20Chow%20Mein.jpg',
    'Preparation:
1. Cook chow mein noodles until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare tofu strips and cabbage, carrot, snow peas in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk soy oyster mushroom sauce with garlic and white pepper. Set scallions near the serving bowls.

Cooking:
1. Sear or saute tofu strips until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook cabbage, carrot, snow peas until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in soy oyster mushroom sauce, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return tofu strips to the pan, toss once more, and finish with scallions.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Vegetable Chow Mein is a noodle dish built around tofu strips, chow mein noodles, and cabbage, carrot, snow peas. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    715,
    29,
    76,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'tofu strips', '350g'),
  (@recipe_id, 'chow mein noodles', '400g'),
  (@recipe_id, 'cabbage, carrot, snow peas', '5 cups'),
  (@recipe_id, 'soy oyster mushroom sauce', '1/2 cup'),
  (@recipe_id, 'garlic and white pepper', '4 cloves, 1 tsp'),
  (@recipe_id, 'scallions', '1/2 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Quick Meal');

-- Sesame Cucumber Salad
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Sesame Cucumber Salad',
    '/images/Sesame%20Cucumber%20Salad.jpg',
    'Preparation:
1. Wash and dry cilantro and scallions thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare soft tofu cubes and crisp cucumbers. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk black vinegar sesame dressing with garlic, chile crisp, sugar. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If soft tofu cubes needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine crisp cucumbers with cilantro and scallions in a wide bowl and toss with a small amount of dressing first.
3. Add soft tofu cubes and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with toasted sesame seeds just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Sesame Cucumber Salad is a fresh salad built around soft tofu cubes, crisp cucumbers, and cilantro and scallions. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    465,
    20,
    38,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'soft tofu cubes', '300g'),
  (@recipe_id, 'crisp cucumbers', '4 large'),
  (@recipe_id, 'cilantro and scallions', '1 cup'),
  (@recipe_id, 'black vinegar sesame dressing', '1/3 cup'),
  (@recipe_id, 'garlic, chile crisp, sugar', '2 cloves, 1 tbsp, 1 tsp'),
  (@recipe_id, 'toasted sesame seeds', '2 tbsp'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Healthy', 'Quick Meal', 'Vegetarian');

-- Pork Wonton Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Chinese'),
    'Pork Wonton Soup',
    '/images/Pork%20Wonton%20Soup.jpg',
    'Preparation:
1. Rinse and drain egg noodles. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim pork wontons into even pieces. Pat it dry, season lightly with ginger, soy sauce, white pepper, and keep it chilled while the broth develops flavor.
3. Cut bok choy and mushrooms into bite-size pieces. Measure clear chicken broth, then arrange scallions and fried garlic on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and ginger, soy sauce, white pepper; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in clear chicken broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add pork wontons and bok choy and mushrooms. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place egg noodles in warm bowls, ladle the hot soup over the top, and finish with scallions and fried garlic.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Pork Wonton Soup is a brothy soup built around pork wontons, egg noodles, and bok choy and mushrooms. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    460,
    26,
    40,
    13
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'pork wontons', '24 pieces'),
  (@recipe_id, 'egg noodles', '250g'),
  (@recipe_id, 'bok choy and mushrooms', '4 cups'),
  (@recipe_id, 'clear chicken broth', '1.6L'),
  (@recipe_id, 'ginger, soy sauce, white pepper', '1 tbsp, 2 tbsp, 1 tsp'),
  (@recipe_id, 'scallions and fried garlic', '1/3 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Soup', 'Comfort Food');

-- Butter Chicken Curry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Butter Chicken Curry',
    '/images/Butter%20Chicken%20Curry.jpg',
    'Preparation:
1. Cut chicken thigh pieces and tomato and onion puree into similar-size pieces so they finish cooking together.
2. Cook or warm basmati rice. Curries are best when the base is ready before the sauce reaches its final texture.
3. Measure cream and tomato sauce and garam masala, cumin, paprika; curry spices can burn quickly, so keep them beside the pot.

Cooking:
1. Heat oil in a deep pan, add aromatics, then bloom garam masala, cumin, paprika for 30 to 60 seconds until fragrant.
2. Add chicken thigh pieces and tomato and onion puree. Stir until coated, then pour in cream and tomato sauce.
3. Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.

Serving and storage:
1. Rest the curry for 5 minutes, then finish with cilantro and yogurt.
2. Serve with basmati rice. Store in shallow containers; the flavor deepens after one night in the refrigerator.',
    'Butter Chicken Curry is a saucy curry built around chicken thigh pieces, basmati rice, and tomato and onion puree. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    660,
    27,
    60,
    22
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chicken thigh pieces', '650g'),
  (@recipe_id, 'basmati rice', '4 cups cooked'),
  (@recipe_id, 'tomato and onion puree', '3 cups'),
  (@recipe_id, 'cream and tomato sauce', '1 1/2 cups'),
  (@recipe_id, 'garam masala, cumin, paprika', '1 tbsp total'),
  (@recipe_id, 'cilantro and yogurt', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'onion and garlic', '1 onion, 3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Comfort Food', 'Family Dinner');

-- Chickpea Chana Masala
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Chickpea Chana Masala',
    '/images/Chickpea%20Chana%20Masala.jpg',
    'Preparation:
1. Cut cooked chickpeas and tomatoes and onion into similar-size pieces so they finish cooking together.
2. Cook or warm basmati rice. Curries are best when the base is ready before the sauce reaches its final texture.
3. Measure spiced tomato gravy and coriander, cumin, garam masala; curry spices can burn quickly, so keep them beside the pot.

Cooking:
1. Heat oil in a deep pan, add aromatics, then bloom coriander, cumin, garam masala for 30 to 60 seconds until fragrant.
2. Add cooked chickpeas and tomatoes and onion. Stir until coated, then pour in spiced tomato gravy.
3. Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.

Serving and storage:
1. Rest the curry for 5 minutes, then finish with cilantro and lemon.
2. Serve with basmati rice. Store in shallow containers; the flavor deepens after one night in the refrigerator.',
    'Chickpea Chana Masala is a saucy curry built around cooked chickpeas, basmati rice, and tomatoes and onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    710,
    29,
    60,
    23
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cooked chickpeas', '3 cups'),
  (@recipe_id, 'basmati rice', '4 cups cooked'),
  (@recipe_id, 'tomatoes and onion', '4 cups'),
  (@recipe_id, 'spiced tomato gravy', '2 cups'),
  (@recipe_id, 'coriander, cumin, garam masala', '2 tbsp total'),
  (@recipe_id, 'cilantro and lemon', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'onion and garlic', '1 onion, 3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Healthy', 'Meal Prep');

-- Palak Paneer Rice Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Palak Paneer Rice Bowl',
    '/images/Palak%20Paneer%20Rice%20Bowl.jpg',
    'Preparation:
1. Cook or warm basmati rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season paneer cubes with garlic, ginger, garam masala. Cut spinach puree into similar-size pieces for even cooking and easy eating.
3. Whisk spiced cream sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook paneer cubes in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook spinach puree until tender-crisp, scraping up any browned bits to build flavor.
3. Return paneer cubes to the pan with a spoonful of spiced cream sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide basmati rice into bowls, add the cooked components, spoon over extra spiced cream sauce, and top with cilantro and toasted cumin.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Palak Paneer Rice Bowl is a complete rice or grain bowl built around paneer cubes, basmati rice, and spinach puree. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    685,
    32,
    70,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'paneer cubes', '400g'),
  (@recipe_id, 'basmati rice', '4 cups cooked'),
  (@recipe_id, 'spinach puree', '4 cups'),
  (@recipe_id, 'spiced cream sauce', '1 1/2 cups'),
  (@recipe_id, 'garlic, ginger, garam masala', '1 tbsp total'),
  (@recipe_id, 'cilantro and toasted cumin', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Comfort Food');

-- Masala Dosa Potato Plate
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Masala Dosa Potato Plate',
    '/images/Masala%20Dosa%20Potato%20Plate.jpg',
    'Preparation:
1. Prepare spiced potato filling, dosa batter, and onion and curry leaves before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with mustard seed, turmeric, chile. Keep coconut chutney measured and ready.
3. Warm plates or tortillas if needed, and set cilantro aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook spiced potato filling until browned and nearly done.
2. Add onion and curry leaves and cook until softened. Stir in dosa batter if it needs heating or crisping.
3. Lower the heat, add coconut chutney, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with cilantro and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Masala Dosa Potato Plate is a one-pan skillet meal built around spiced potato filling, dosa batter, and onion and curry leaves. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    630,
    23,
    47,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'spiced potato filling', '500g'),
  (@recipe_id, 'dosa batter', '3 cups'),
  (@recipe_id, 'onion and curry leaves', '1 cup'),
  (@recipe_id, 'coconut chutney', '1/2 cup'),
  (@recipe_id, 'mustard seed, turmeric, chile', '2 tsp total'),
  (@recipe_id, 'cilantro', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Street Food');

-- Tandoori Cauliflower Bowls
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Tandoori Cauliflower Bowls',
    '/images/Tandoori%20Cauliflower%20Bowls.jpg',
    'Preparation:
1. Soak skewers if using wood. Cut cauliflower florets and cucumber and tomato salad into grill-friendly pieces that will not fall through the grate.
2. Coat with yogurt mint sauce and tandoori spice and lemon. Let it marinate for at least 15 minutes while the grill preheats.
3. Prepare brown rice and arrange cilantro and pickled onion before grilling because the hot food should be served quickly.

Cooking:
1. Heat the grill or grill pan to medium-high. Oil the grate, then cook cauliflower florets until marked and cooked through.
2. Grill cucumber and tomato salad until charred in spots but still juicy. Move pieces to a cooler area if they darken too fast.
3. Brush with a small amount of yogurt mint sauce during the final minute so it glazes instead of burning.

Serving and storage:
1. Rest grilled items for 5 minutes. Serve over or beside brown rice and finish with cilantro and pickled onion.
2. Store grilled components separately from fresh garnish for the best texture.',
    'Tandoori Cauliflower Bowls is a grilled plate built around cauliflower florets, brown rice, and cucumber and tomato salad. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    520,
    35,
    42,
    18
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cauliflower florets', '700g'),
  (@recipe_id, 'brown rice', '4 cups cooked'),
  (@recipe_id, 'cucumber and tomato salad', '4 cups'),
  (@recipe_id, 'yogurt mint sauce', '1/2 cup'),
  (@recipe_id, 'tandoori spice and lemon', '2 tbsp, 1 lemon'),
  (@recipe_id, 'cilantro and pickled onion', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'lemon wedges', 'for serving');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Healthy', 'Meal Prep');

-- Lentil Dal Tadka
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Lentil Dal Tadka',
    '/images/Lentil%20Dal%20Tadka.jpg',
    'Preparation:
1. Rinse and drain basmati rice. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim red lentils into even pieces. Pat it dry, season lightly with turmeric, cumin, garam masala, and keep it chilled while the broth develops flavor.
3. Cut tomato, onion, and spinach into bite-size pieces. Measure vegetable broth, then arrange cilantro and lemon on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and turmeric, cumin, garam masala; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in vegetable broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add red lentils and tomato, onion, and spinach. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place basmati rice in warm bowls, ladle the hot soup over the top, and finish with cilantro and lemon.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Lentil Dal Tadka is a brothy soup built around red lentils, basmati rice, and tomato, onion, and spinach. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    435,
    25,
    46,
    7
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'red lentils', '2 cups'),
  (@recipe_id, 'basmati rice', '4 cups cooked'),
  (@recipe_id, 'tomato, onion, and spinach', '4 cups'),
  (@recipe_id, 'vegetable broth', '1.5L'),
  (@recipe_id, 'turmeric, cumin, garam masala', '2 tbsp total'),
  (@recipe_id, 'cilantro and lemon', '1/2 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Soup', 'Meal Prep');

-- Vegetable Biryani
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Vegetable Biryani',
    '/images/Vegetable%20Biryani.jpg',
    'Preparation:
1. Cook or warm basmati rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season mixed vegetables with biryani masala and cardamom. Cut onion, peas, and carrots into similar-size pieces for even cooking and easy eating.
3. Whisk saffron yogurt sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook mixed vegetables in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook onion, peas, and carrots until tender-crisp, scraping up any browned bits to build flavor.
3. Return mixed vegetables to the pan with a spoonful of saffron yogurt sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide basmati rice into bowls, add the cooked components, spoon over extra saffron yogurt sauce, and top with fried onions and cilantro.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Vegetable Biryani is a complete rice or grain bowl built around mixed vegetables, basmati rice, and onion, peas, and carrots. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    610,
    29,
    70,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'mixed vegetables', '5 cups'),
  (@recipe_id, 'basmati rice', '3 cups dry'),
  (@recipe_id, 'onion, peas, and carrots', '4 cups'),
  (@recipe_id, 'saffron yogurt sauce', '1/2 cup'),
  (@recipe_id, 'biryani masala and cardamom', '2 tbsp, 4 pods'),
  (@recipe_id, 'fried onions and cilantro', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Family Dinner');

-- Mango Lassi
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Indian'),
    'Mango Lassi',
    '/images/Mango%20Lassi.jpg',
    'Preparation:
1. Prepare ripe mango first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill plain yogurt and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure honey and ground cardamom and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine ripe mango, plain yogurt, and cardamom milk in a pitcher or blender.
2. Add honey and ground cardamom and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with pistachios.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Mango Lassi is a refreshing drink built around ripe mango, plain yogurt, and cardamom milk. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    200,
    4,
    26,
    4
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ripe mango', '2 cups'),
  (@recipe_id, 'plain yogurt', '2 cups'),
  (@recipe_id, 'cardamom milk', '1 cup'),
  (@recipe_id, 'honey', '2 tbsp'),
  (@recipe_id, 'ground cardamom and salt', '1/2 tsp, 1 pinch'),
  (@recipe_id, 'pistachios', '2 tbsp'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Quick Meal');

-- Tomato Basil Spaghetti
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Tomato Basil Spaghetti',
    '/images/Tomato%20Basil%20Spaghetti.jpg',
    'Preparation:
1. Cook tomato passata until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare spaghetti and cherry tomatoes and basil in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk olive oil tomato sauce with garlic, oregano, chile flakes. Set parmesan and basil near the serving bowls.

Cooking:
1. Sear or saute spaghetti until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook cherry tomatoes and basil until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in olive oil tomato sauce, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return spaghetti to the pan, toss once more, and finish with parmesan and basil.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Tomato Basil Spaghetti is a noodle dish built around spaghetti, tomato passata, and cherry tomatoes and basil. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    740,
    25,
    75,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'spaghetti', '400g'),
  (@recipe_id, 'tomato passata', '3 cups'),
  (@recipe_id, 'cherry tomatoes and basil', '3 cups'),
  (@recipe_id, 'olive oil tomato sauce', '2 cups'),
  (@recipe_id, 'garlic, oregano, chile flakes', '1 tbsp total'),
  (@recipe_id, 'parmesan and basil', '1/2 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Family Dinner');

-- Chicken Pesto Pasta
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Chicken Pesto Pasta',
    '/images/Chicken%20Pesto%20Pasta.jpg',
    'Preparation:
1. Cook short pasta until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare grilled chicken strips and spinach and peas in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk basil pesto with garlic and lemon zest. Set parmesan and pine nuts near the serving bowls.

Cooking:
1. Sear or saute grilled chicken strips until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook spinach and peas until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in basil pesto, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return grilled chicken strips to the pan, toss once more, and finish with parmesan and pine nuts.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Chicken Pesto Pasta is a noodle dish built around grilled chicken strips, short pasta, and spinach and peas. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    590,
    25,
    80,
    14
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'grilled chicken strips', '500g'),
  (@recipe_id, 'short pasta', '400g'),
  (@recipe_id, 'spinach and peas', '4 cups'),
  (@recipe_id, 'basil pesto', '2/3 cup'),
  (@recipe_id, 'garlic and lemon zest', '1 tbsp total'),
  (@recipe_id, 'parmesan and pine nuts', '1/2 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Quick Meal');

-- Mushroom Risotto
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Mushroom Risotto',
    '/images/Mushroom%20Risotto.jpg',
    'Preparation:
1. Cook or warm arborio rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season mixed mushrooms with white wine and parmesan. Cut shallot and thyme into similar-size pieces for even cooking and easy eating.
3. Whisk warm vegetable stock until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook mixed mushrooms in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook shallot and thyme until tender-crisp, scraping up any browned bits to build flavor.
3. Return mixed mushrooms to the pan with a spoonful of warm vegetable stock. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide arborio rice into bowls, add the cooked components, spoon over extra warm vegetable stock, and top with parsley and lemon zest.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Mushroom Risotto is a complete rice or grain bowl built around mixed mushrooms, arborio rice, and shallot and thyme. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    585,
    29,
    67,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'mixed mushrooms', '500g'),
  (@recipe_id, 'arborio rice', '1 1/2 cups'),
  (@recipe_id, 'shallot and thyme', '1 cup'),
  (@recipe_id, 'warm vegetable stock', '1.2L'),
  (@recipe_id, 'white wine and parmesan', '1/2 cup each'),
  (@recipe_id, 'parsley and lemon zest', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Comfort Food');

-- Margherita Flatbread
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Margherita Flatbread',
    '/images/Margherita%20Flatbread.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut fresh mozzarella, flatbread bases, and tomatoes and basil into even pieces. Toss with marinara sauce and olive oil and dried oregano.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with basil and parmesan.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Margherita Flatbread is a oven-baked dish built around fresh mozzarella, flatbread bases, and tomatoes and basil. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    525,
    24,
    49,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'fresh mozzarella', '250g'),
  (@recipe_id, 'flatbread bases', '4'),
  (@recipe_id, 'tomatoes and basil', '3 cups'),
  (@recipe_id, 'marinara sauce', '1 cup'),
  (@recipe_id, 'olive oil and dried oregano', '2 tbsp, 1 tsp'),
  (@recipe_id, 'basil and parmesan', '1/2 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Quick Meal');

-- Tuscan White Bean Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Tuscan White Bean Soup',
    '/images/Tuscan%20White%20Bean%20Soup.jpg',
    'Preparation:
1. Rinse and drain crusty bread. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim cannellini beans into even pieces. Pat it dry, season lightly with rosemary, garlic, fennel seed, and keep it chilled while the broth develops flavor.
3. Cut kale, carrot, celery into bite-size pieces. Measure vegetable broth, then arrange parmesan and parsley on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and rosemary, garlic, fennel seed; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in vegetable broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add cannellini beans and kale, carrot, celery. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place crusty bread in warm bowls, ladle the hot soup over the top, and finish with parmesan and parsley.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Tuscan White Bean Soup is a brothy soup built around cannellini beans, crusty bread, and kale, carrot, celery. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    485,
    25,
    38,
    7
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cannellini beans', '3 cups'),
  (@recipe_id, 'crusty bread', '4 slices'),
  (@recipe_id, 'kale, carrot, celery', '5 cups'),
  (@recipe_id, 'vegetable broth', '1.5L'),
  (@recipe_id, 'rosemary, garlic, fennel seed', '1 tbsp total'),
  (@recipe_id, 'parmesan and parsley', '1/3 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Soup', 'Healthy');

-- Lemon Shrimp Linguine
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Lemon Shrimp Linguine',
    '/images/Lemon%20Shrimp%20Linguine.jpg',
    'Preparation:
1. Cook linguine until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare shrimp and zucchini and arugula in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk lemon butter sauce with garlic, chile flakes, black pepper. Set parsley and parmesan near the serving bowls.

Cooking:
1. Sear or saute shrimp until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook zucchini and arugula until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in lemon butter sauce, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return shrimp to the pan, toss once more, and finish with parsley and parmesan.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Lemon Shrimp Linguine is a noodle dish built around shrimp, linguine, and zucchini and arugula. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    640,
    25,
    74,
    14
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shrimp', '450g'),
  (@recipe_id, 'linguine', '400g'),
  (@recipe_id, 'zucchini and arugula', '4 cups'),
  (@recipe_id, 'lemon butter sauce', '1/2 cup'),
  (@recipe_id, 'garlic, chile flakes, black pepper', '1 tbsp total'),
  (@recipe_id, 'parsley and parmesan', '1/2 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Quick Meal');

-- Caprese Farro Salad
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Caprese Farro Salad',
    '/images/Caprese%20Farro%20Salad.jpg',
    'Preparation:
1. Wash and dry tomatoes, basil, cucumber thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare fresh mozzarella pearls and cooked farro. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk balsamic vinaigrette with garlic and black pepper. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If fresh mozzarella pearls needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine cooked farro with tomatoes, basil, cucumber in a wide bowl and toss with a small amount of dressing first.
3. Add fresh mozzarella pearls and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with toasted almonds just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Caprese Farro Salad is a fresh salad built around fresh mozzarella pearls, cooked farro, and tomatoes, basil, cucumber. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    515,
    20,
    31,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'fresh mozzarella pearls', '250g'),
  (@recipe_id, 'cooked farro', '3 cups'),
  (@recipe_id, 'tomatoes, basil, cucumber', '5 cups'),
  (@recipe_id, 'balsamic vinaigrette', '1/2 cup'),
  (@recipe_id, 'garlic and black pepper', '1 tsp each'),
  (@recipe_id, 'toasted almonds', '1/3 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Meal Prep', 'Fresh');

-- Tiramisu Overnight Cups
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Italian'),
    'Tiramisu Overnight Cups',
    '/images/Tiramisu%20Overnight%20Cups.jpg',
    'Preparation:
1. Set out ladyfinger pieces, mascarpone yogurt, and espresso. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure maple syrup and cocoa powder and vanilla accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine ladyfinger pieces with mascarpone yogurt until evenly mixed. Fold in espresso gently so it stays distinct.
2. Add maple syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with dark chocolate shavings just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Tiramisu Overnight Cups is a sweet dessert built around ladyfinger pieces, mascarpone yogurt, and espresso. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    405,
    5,
    48,
    9
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ladyfinger pieces', '150g'),
  (@recipe_id, 'mascarpone yogurt', '2 cups'),
  (@recipe_id, 'espresso', '1 cup'),
  (@recipe_id, 'maple syrup', '3 tbsp'),
  (@recipe_id, 'cocoa powder and vanilla', '2 tbsp, 1 tsp'),
  (@recipe_id, 'dark chocolate shavings', '1/4 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Meal Prep');

-- Chicken Tinga Tacos
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Chicken Tinga Tacos',
    '/images/Chicken%20Tinga%20Tacos.jpg',
    'Preparation:
1. Prepare shredded chicken, corn tortillas, and onion and cabbage before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with cumin, oregano, smoked paprika. Keep chipotle tomato sauce measured and ready.
3. Warm plates or tortillas if needed, and set cilantro, lime, cotija aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook shredded chicken until browned and nearly done.
2. Add onion and cabbage and cook until softened. Stir in corn tortillas if it needs heating or crisping.
3. Lower the heat, add chipotle tomato sauce, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with cilantro, lime, cotija and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Chicken Tinga Tacos is a one-pan skillet meal built around shredded chicken, corn tortillas, and onion and cabbage. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    605,
    24,
    47,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shredded chicken', '500g'),
  (@recipe_id, 'corn tortillas', '12'),
  (@recipe_id, 'onion and cabbage', '3 cups'),
  (@recipe_id, 'chipotle tomato sauce', '1 1/2 cups'),
  (@recipe_id, 'cumin, oregano, smoked paprika', '1 tbsp total'),
  (@recipe_id, 'cilantro, lime, cotija', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Spicy', 'Street Food', 'Family Dinner');

-- Beef Taco Rice Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Beef Taco Rice Bowl',
    '/images/Beef%20Taco%20Rice%20Bowl.jpg',
    'Preparation:
1. Cook or warm cilantro lime rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season ground beef with taco seasoning. Cut corn, lettuce, tomato into similar-size pieces for even cooking and easy eating.
3. Whisk salsa roja until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook ground beef in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook corn, lettuce, tomato until tender-crisp, scraping up any browned bits to build flavor.
3. Return ground beef to the pan with a spoonful of salsa roja. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide cilantro lime rice into bowls, add the cooked components, spoon over extra salsa roja, and top with avocado and cheese.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Beef Taco Rice Bowl is a complete rice or grain bowl built around ground beef, cilantro lime rice, and corn, lettuce, tomato. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    635,
    31,
    67,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ground beef', '500g'),
  (@recipe_id, 'cilantro lime rice', '4 cups'),
  (@recipe_id, 'corn, lettuce, tomato', '5 cups'),
  (@recipe_id, 'salsa roja', '1 cup'),
  (@recipe_id, 'taco seasoning', '2 tbsp'),
  (@recipe_id, 'avocado and cheese', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Student-friendly');

-- Black Bean Enchilada Bake
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Black Bean Enchilada Bake',
    '/images/Black%20Bean%20Enchilada%20Bake.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut black beans, corn tortillas, and zucchini, corn, onion into even pieces. Toss with enchilada sauce and cumin and chile powder.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with cheese and cilantro.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Black Bean Enchilada Bake is a oven-baked dish built around black beans, corn tortillas, and zucchini, corn, onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    550,
    25,
    44,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'black beans', '3 cups'),
  (@recipe_id, 'corn tortillas', '12'),
  (@recipe_id, 'zucchini, corn, onion', '4 cups'),
  (@recipe_id, 'enchilada sauce', '2 cups'),
  (@recipe_id, 'cumin and chile powder', '2 tbsp total'),
  (@recipe_id, 'cheese and cilantro', '1 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Family Dinner');

-- Shrimp Fajita Skillet
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Shrimp Fajita Skillet',
    '/images/Shrimp%20Fajita%20Skillet.jpg',
    'Preparation:
1. Cut shrimp into small even pieces so they cook quickly. Pat dry and season with half of fajita seasoning.
2. Prepare warm tortillas before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice bell peppers and onion thinly. Stir lime crema with the remaining fajita seasoning and keep cilantro and avocado ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear shrimp until browned and nearly cooked through.
2. Add bell peppers and onion and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add warm tortillas and pour lime crema around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in cilantro and avocado, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Shrimp Fajita Skillet is a fast stir-fry built around shrimp, warm tortillas, and bell peppers and onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    545,
    26,
    60,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shrimp', '500g'),
  (@recipe_id, 'warm tortillas', '12'),
  (@recipe_id, 'bell peppers and onion', '5 cups'),
  (@recipe_id, 'lime crema', '1/2 cup'),
  (@recipe_id, 'fajita seasoning', '2 tbsp'),
  (@recipe_id, 'cilantro and avocado', '1 cup'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Quick Meal');

-- Pozole Verde Chicken Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Pozole Verde Chicken Soup',
    '/images/Pozole%20Verde%20Chicken%20Soup.jpg',
    'Preparation:
1. Rinse and drain hominy. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim shredded chicken into even pieces. Pat it dry, season lightly with cumin, oregano, garlic, and keep it chilled while the broth develops flavor.
3. Cut tomatillos and poblano into bite-size pieces. Measure green chile broth, then arrange radish, cabbage, lime on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and cumin, oregano, garlic; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in green chile broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add shredded chicken and tomatillos and poblano. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place hominy in warm bowls, ladle the hot soup over the top, and finish with radish, cabbage, lime.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Pozole Verde Chicken Soup is a brothy soup built around shredded chicken, hominy, and tomatillos and poblano. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    410,
    24,
    39,
    12
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shredded chicken', '500g'),
  (@recipe_id, 'hominy', '3 cups'),
  (@recipe_id, 'tomatillos and poblano', '4 cups'),
  (@recipe_id, 'green chile broth', '1.5L'),
  (@recipe_id, 'cumin, oregano, garlic', '1 tbsp total'),
  (@recipe_id, 'radish, cabbage, lime', '2 cups'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Soup', 'Family Dinner');

-- Street Corn Salad
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Street Corn Salad',
    '/images/Street%20Corn%20Salad.jpg',
    'Preparation:
1. Wash and dry red onion and jalapeno thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare grilled corn kernels and romaine lettuce. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk lime mayo dressing with chile powder and smoked paprika. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If grilled corn kernels needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine romaine lettuce with red onion and jalapeno in a wide bowl and toss with a small amount of dressing first.
3. Add grilled corn kernels and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with cotija and cilantro just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Street Corn Salad is a fresh salad built around grilled corn kernels, romaine lettuce, and red onion and jalapeno. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    390,
    20,
    31,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'grilled corn kernels', '4 cups'),
  (@recipe_id, 'romaine lettuce', '4 cups'),
  (@recipe_id, 'red onion and jalapeno', '1 cup'),
  (@recipe_id, 'lime mayo dressing', '1/2 cup'),
  (@recipe_id, 'chile powder and smoked paprika', '2 tsp total'),
  (@recipe_id, 'cotija and cilantro', '1 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Quick Meal', 'Fresh');

-- Sweet Potato Quesadillas
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Sweet Potato Quesadillas',
    '/images/Sweet%20Potato%20Quesadillas.jpg',
    'Preparation:
1. Prepare roasted sweet potato, flour tortillas, and black beans and spinach before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with cumin and garlic powder. Keep chipotle yogurt sauce measured and ready.
3. Warm plates or tortillas if needed, and set cilantro and lime aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook roasted sweet potato until browned and nearly done.
2. Add black beans and spinach and cook until softened. Stir in flour tortillas if it needs heating or crisping.
3. Lower the heat, add chipotle yogurt sauce, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with cilantro and lime and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Sweet Potato Quesadillas is a one-pan skillet meal built around roasted sweet potato, flour tortillas, and black beans and spinach. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    480,
    26,
    49,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'roasted sweet potato', '500g'),
  (@recipe_id, 'flour tortillas', '8'),
  (@recipe_id, 'black beans and spinach', '3 cups'),
  (@recipe_id, 'chipotle yogurt sauce', '1/2 cup'),
  (@recipe_id, 'cumin and garlic powder', '2 tsp total'),
  (@recipe_id, 'cilantro and lime', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Student-friendly');

-- Cinnamon Horchata
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mexican'),
    'Cinnamon Horchata',
    '/images/Cinnamon%20Horchata.jpg',
    'Preparation:
1. Prepare long grain rice first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill milk and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure vanilla sugar syrup and ground cinnamon and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine long grain rice, milk, and cinnamon sticks in a pitcher or blender.
2. Add vanilla sugar syrup and ground cinnamon and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with toasted almonds.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Cinnamon Horchata is a refreshing drink built around long grain rice, milk, and cinnamon sticks. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    200,
    2,
    34,
    5
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'long grain rice', '1 cup'),
  (@recipe_id, 'milk', '3 cups'),
  (@recipe_id, 'cinnamon sticks', '2'),
  (@recipe_id, 'vanilla sugar syrup', '1/3 cup'),
  (@recipe_id, 'ground cinnamon and salt', '1 tsp, 1 pinch'),
  (@recipe_id, 'toasted almonds', '2 tbsp'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Dessert');

-- Greek Chicken Souvlaki Bowls
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Greek Chicken Souvlaki Bowls',
    '/images/Greek%20Chicken%20Souvlaki%20Bowls.jpg',
    'Preparation:
1. Soak skewers if using wood. Cut chicken breast cubes and cucumber, tomato, red onion into grill-friendly pieces that will not fall through the grate.
2. Coat with tzatziki sauce and oregano, garlic, lemon zest. Let it marinate for at least 15 minutes while the grill preheats.
3. Prepare warm pita or rice and arrange feta and parsley before grilling because the hot food should be served quickly.

Cooking:
1. Heat the grill or grill pan to medium-high. Oil the grate, then cook chicken breast cubes until marked and cooked through.
2. Grill cucumber, tomato, red onion until charred in spots but still juicy. Move pieces to a cooler area if they darken too fast.
3. Brush with a small amount of tzatziki sauce during the final minute so it glazes instead of burning.

Serving and storage:
1. Rest grilled items for 5 minutes. Serve over or beside warm pita or rice and finish with feta and parsley.
2. Store grilled components separately from fresh garnish for the best texture.',
    'Greek Chicken Souvlaki Bowls is a grilled plate built around chicken breast cubes, warm pita or rice, and cucumber, tomato, red onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    520,
    34,
    41,
    16
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chicken breast cubes', '600g'),
  (@recipe_id, 'warm pita or rice', '4 portions'),
  (@recipe_id, 'cucumber, tomato, red onion', '5 cups'),
  (@recipe_id, 'tzatziki sauce', '1 cup'),
  (@recipe_id, 'oregano, garlic, lemon zest', '1 tbsp total'),
  (@recipe_id, 'feta and parsley', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'lemon wedges', 'for serving');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Healthy', 'Meal Prep');

-- Falafel Chickpea Salad
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Falafel Chickpea Salad',
    '/images/Falafel%20Chickpea%20Salad.jpg',
    'Preparation:
1. Wash and dry cucumber, tomato, radish thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare baked falafel and mixed greens. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk tahini lemon dressing with cumin and coriander. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If baked falafel needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine mixed greens with cucumber, tomato, radish in a wide bowl and toss with a small amount of dressing first.
3. Add baked falafel and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with parsley and pickles just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Falafel Chickpea Salad is a fresh salad built around baked falafel, mixed greens, and cucumber, tomato, radish. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    415,
    22,
    38,
    15
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'baked falafel', '16 pieces'),
  (@recipe_id, 'mixed greens', '5 cups'),
  (@recipe_id, 'cucumber, tomato, radish', '4 cups'),
  (@recipe_id, 'tahini lemon dressing', '1/2 cup'),
  (@recipe_id, 'cumin and coriander', '2 tsp total'),
  (@recipe_id, 'parsley and pickles', '1 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Healthy');

-- Lemon Herb Salmon Couscous
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Lemon Herb Salmon Couscous',
    '/images/Lemon%20Herb%20Salmon%20Couscous.jpg',
    'Preparation:
1. Cook or warm couscous first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season salmon fillets with dill, oregano, garlic. Cut zucchini and tomatoes into similar-size pieces for even cooking and easy eating.
3. Whisk lemon herb vinaigrette until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook salmon fillets in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook zucchini and tomatoes until tender-crisp, scraping up any browned bits to build flavor.
3. Return salmon fillets to the pan with a spoonful of lemon herb vinaigrette. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide couscous into bowls, add the cooked components, spoon over extra lemon herb vinaigrette, and top with feta and parsley.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Lemon Herb Salmon Couscous is a complete rice or grain bowl built around salmon fillets, couscous, and zucchini and tomatoes. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    585,
    31,
    67,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'salmon fillets', '4 small'),
  (@recipe_id, 'couscous', '3 cups cooked'),
  (@recipe_id, 'zucchini and tomatoes', '4 cups'),
  (@recipe_id, 'lemon herb vinaigrette', '1/2 cup'),
  (@recipe_id, 'dill, oregano, garlic', '1 tbsp total'),
  (@recipe_id, 'feta and parsley', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Healthy', 'High Protein');

-- Turkish Lentil Soup
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Turkish Lentil Soup',
    '/images/Turkish%20Lentil%20Soup.jpg',
    'Preparation:
1. Rinse and drain flatbread. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim red lentils into even pieces. Pat it dry, season lightly with cumin, paprika, dried mint, and keep it chilled while the broth develops flavor.
3. Cut carrot, onion, tomato into bite-size pieces. Measure vegetable broth, then arrange lemon and parsley on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and cumin, paprika, dried mint; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in vegetable broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add red lentils and carrot, onion, tomato. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place flatbread in warm bowls, ladle the hot soup over the top, and finish with lemon and parsley.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Turkish Lentil Soup is a brothy soup built around red lentils, flatbread, and carrot, onion, tomato. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    385,
    26,
    38,
    10
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'red lentils', '2 cups'),
  (@recipe_id, 'flatbread', '4 pieces'),
  (@recipe_id, 'carrot, onion, tomato', '4 cups'),
  (@recipe_id, 'vegetable broth', '1.6L'),
  (@recipe_id, 'cumin, paprika, dried mint', '1 tbsp total'),
  (@recipe_id, 'lemon and parsley', '1/2 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Soup', 'Meal Prep');

-- Shakshuka Pepper Skillet
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Shakshuka Pepper Skillet',
    '/images/Shakshuka%20Pepper%20Skillet.jpg',
    'Preparation:
1. Prepare eggs, crusty bread, and bell peppers and tomatoes before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with cumin, paprika, harissa. Keep spiced tomato sauce measured and ready.
3. Warm plates or tortillas if needed, and set feta and cilantro aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook eggs until browned and nearly done.
2. Add bell peppers and tomatoes and cook until softened. Stir in crusty bread if it needs heating or crisping.
3. Lower the heat, add spiced tomato sauce, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with feta and cilantro and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Shakshuka Pepper Skillet is a one-pan skillet meal built around eggs, crusty bread, and bell peppers and tomatoes. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    605,
    25,
    46,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'eggs', '6'),
  (@recipe_id, 'crusty bread', '4 slices'),
  (@recipe_id, 'bell peppers and tomatoes', '5 cups'),
  (@recipe_id, 'spiced tomato sauce', '2 cups'),
  (@recipe_id, 'cumin, paprika, harissa', '1 tbsp total'),
  (@recipe_id, 'feta and cilantro', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Breakfast');

-- Lamb Kofta Pita Plates
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Lamb Kofta Pita Plates',
    '/images/Lamb%20Kofta%20Pita%20Plates.jpg',
    'Preparation:
1. Soak skewers if using wood. Cut ground lamb kofta and cucumber tomato salad into grill-friendly pieces that will not fall through the grate.
2. Coat with garlic yogurt sauce and cumin, allspice, coriander. Let it marinate for at least 15 minutes while the grill preheats.
3. Prepare pita bread and arrange mint and parsley before grilling because the hot food should be served quickly.

Cooking:
1. Heat the grill or grill pan to medium-high. Oil the grate, then cook ground lamb kofta until marked and cooked through.
2. Grill cucumber tomato salad until charred in spots but still juicy. Move pieces to a cooler area if they darken too fast.
3. Brush with a small amount of garlic yogurt sauce during the final minute so it glazes instead of burning.

Serving and storage:
1. Rest grilled items for 5 minutes. Serve over or beside pita bread and finish with mint and parsley.
2. Store grilled components separately from fresh garnish for the best texture.',
    'Lamb Kofta Pita Plates is a grilled plate built around ground lamb kofta, pita bread, and cucumber tomato salad. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    570,
    33,
    36,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ground lamb kofta', '600g'),
  (@recipe_id, 'pita bread', '4'),
  (@recipe_id, 'cucumber tomato salad', '4 cups'),
  (@recipe_id, 'garlic yogurt sauce', '1 cup'),
  (@recipe_id, 'cumin, allspice, coriander', '1 tbsp total'),
  (@recipe_id, 'mint and parsley', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'lemon wedges', 'for serving');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Family Dinner');

-- Roasted Vegetable Hummus Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Roasted Vegetable Hummus Bowl',
    '/images/Roasted%20Vegetable%20Hummus%20Bowl.jpg',
    'Preparation:
1. Cook or warm quinoa first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season hummus with zaatar and garlic. Cut eggplant, pepper, zucchini into similar-size pieces for even cooking and easy eating.
3. Whisk lemon tahini sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook hummus in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook eggplant, pepper, zucchini until tender-crisp, scraping up any browned bits to build flavor.
3. Return hummus to the pan with a spoonful of lemon tahini sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide quinoa into bowls, add the cooked components, spoon over extra lemon tahini sauce, and top with parsley and pine nuts.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Roasted Vegetable Hummus Bowl is a complete rice or grain bowl built around hummus, quinoa, and eggplant, pepper, zucchini. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    560,
    30,
    67,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'hummus', '2 cups'),
  (@recipe_id, 'quinoa', '3 cups cooked'),
  (@recipe_id, 'eggplant, pepper, zucchini', '5 cups'),
  (@recipe_id, 'lemon tahini sauce', '1/2 cup'),
  (@recipe_id, 'zaatar and garlic', '1 tbsp, 3 cloves'),
  (@recipe_id, 'parsley and pine nuts', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Healthy', 'Meal Prep');

-- Baklava Yogurt Parfaits
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Mediterranean'),
    'Baklava Yogurt Parfaits',
    '/images/Baklava%20Yogurt%20Parfaits.jpg',
    'Preparation:
1. Set out Greek yogurt, crushed phyllo crisps, and honeyed walnuts. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure orange honey syrup and cinnamon and cardamom accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine Greek yogurt with crushed phyllo crisps until evenly mixed. Fold in honeyed walnuts gently so it stays distinct.
2. Add orange honey syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with pistachios just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Baklava Yogurt Parfaits is a sweet dessert built around Greek yogurt, crushed phyllo crisps, and honeyed walnuts. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    430,
    4,
    49,
    14
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'Greek yogurt', '2 cups'),
  (@recipe_id, 'crushed phyllo crisps', '1 cup'),
  (@recipe_id, 'honeyed walnuts', '1 cup'),
  (@recipe_id, 'orange honey syrup', '1/3 cup'),
  (@recipe_id, 'cinnamon and cardamom', '1 tsp total'),
  (@recipe_id, 'pistachios', '1/3 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Quick Meal');

-- Turkey Meatball Pasta
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'Turkey Meatball Pasta',
    '/images/Turkey%20Meatball%20Pasta.jpg',
    'Preparation:
1. Cook penne pasta until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.
2. Prepare turkey meatballs and spinach and bell pepper in bite-size pieces. Keep the vegetables dry so the sauce will cling.
3. Whisk marinara sauce with Italian seasoning and garlic. Set parmesan and parsley near the serving bowls.

Cooking:
1. Sear or saute turkey meatballs until cooked through. Remove it briefly if it will overcook while the vegetables soften.
2. Cook spinach and bell pepper until bright and tender. Add the noodles and toss with tongs to loosen every strand.
3. Pour in marinara sauce, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.

Serving and storage:
1. Return turkey meatballs to the pan, toss once more, and finish with parmesan and parsley.
2. Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.',
    'Turkey Meatball Pasta is a noodle dish built around turkey meatballs, penne pasta, and spinach and bell pepper. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    740,
    25,
    81,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'turkey meatballs', '20 small'),
  (@recipe_id, 'penne pasta', '400g'),
  (@recipe_id, 'spinach and bell pepper', '4 cups'),
  (@recipe_id, 'marinara sauce', '2 cups'),
  (@recipe_id, 'Italian seasoning and garlic', '1 tbsp, 3 cloves'),
  (@recipe_id, 'parmesan and parsley', '1/2 cup'),
  (@recipe_id, 'reserved noodle water', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Family Dinner');

-- BBQ Chicken Sheet Pan
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'BBQ Chicken Sheet Pan',
    '/images/BBQ%20Chicken%20Sheet%20Pan.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut chicken drumsticks, baby potatoes, and green beans and onion into even pieces. Toss with barbecue sauce and smoked paprika and garlic powder.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with scallions.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'BBQ Chicken Sheet Pan is a oven-baked dish built around chicken drumsticks, baby potatoes, and green beans and onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    550,
    27,
    51,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chicken drumsticks', '8'),
  (@recipe_id, 'baby potatoes', '700g'),
  (@recipe_id, 'green beans and onion', '5 cups'),
  (@recipe_id, 'barbecue sauce', '3/4 cup'),
  (@recipe_id, 'smoked paprika and garlic powder', '2 tsp each'),
  (@recipe_id, 'scallions', '1/3 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Family Dinner', 'Meal Prep');

-- Classic Beef Burger Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'Classic Beef Burger Bowl',
    '/images/Classic%20Beef%20Burger%20Bowl.jpg',
    'Preparation:
1. Cook or warm roasted potato wedges first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season lean ground beef patties with mustard powder and black pepper. Cut lettuce, tomato, pickles into similar-size pieces for even cooking and easy eating.
3. Whisk burger sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook lean ground beef patties in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook lettuce, tomato, pickles until tender-crisp, scraping up any browned bits to build flavor.
3. Return lean ground beef patties to the pan with a spoonful of burger sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide roasted potato wedges into bowls, add the cooked components, spoon over extra burger sauce, and top with cheddar and sesame seeds.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Classic Beef Burger Bowl is a complete rice or grain bowl built around lean ground beef patties, roasted potato wedges, and lettuce, tomato, pickles. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    560,
    29,
    68,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'lean ground beef patties', '500g'),
  (@recipe_id, 'roasted potato wedges', '700g'),
  (@recipe_id, 'lettuce, tomato, pickles', '5 cups'),
  (@recipe_id, 'burger sauce', '1/2 cup'),
  (@recipe_id, 'mustard powder and black pepper', '2 tsp total'),
  (@recipe_id, 'cheddar and sesame seeds', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Student-friendly');

-- Creamy Corn Chowder
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'Creamy Corn Chowder',
    '/images/Creamy%20Corn%20Chowder.jpg',
    'Preparation:
1. Rinse and drain diced potatoes. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim sweet corn kernels into even pieces. Pat it dry, season lightly with thyme and smoked paprika, and keep it chilled while the broth develops flavor.
3. Cut celery, onion, carrot into bite-size pieces. Measure milk and stock, then arrange chives and cheddar on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and thyme and smoked paprika; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in milk and stock and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add sweet corn kernels and celery, onion, carrot. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place diced potatoes in warm bowls, ladle the hot soup over the top, and finish with chives and cheddar.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Creamy Corn Chowder is a brothy soup built around sweet corn kernels, diced potatoes, and celery, onion, carrot. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    510,
    23,
    45,
    7
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'sweet corn kernels', '5 cups'),
  (@recipe_id, 'diced potatoes', '500g'),
  (@recipe_id, 'celery, onion, carrot', '4 cups'),
  (@recipe_id, 'milk and stock', '1.5L'),
  (@recipe_id, 'thyme and smoked paprika', '2 tsp total'),
  (@recipe_id, 'chives and cheddar', '1/2 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Soup', 'Comfort Food');

-- Buffalo Cauliflower Wraps
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'Buffalo Cauliflower Wraps',
    '/images/Buffalo%20Cauliflower%20Wraps.jpg',
    'Preparation:
1. Prepare cauliflower florets, whole wheat tortillas, and romaine and celery before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with garlic powder and paprika. Keep buffalo yogurt sauce measured and ready.
3. Warm plates or tortillas if needed, and set blue cheese and scallions aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook cauliflower florets until browned and nearly done.
2. Add romaine and celery and cook until softened. Stir in whole wheat tortillas if it needs heating or crisping.
3. Lower the heat, add buffalo yogurt sauce, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with blue cheese and scallions and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Buffalo Cauliflower Wraps is a one-pan skillet meal built around cauliflower florets, whole wheat tortillas, and romaine and celery. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    605,
    23,
    48,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cauliflower florets', '700g'),
  (@recipe_id, 'whole wheat tortillas', '8'),
  (@recipe_id, 'romaine and celery', '4 cups'),
  (@recipe_id, 'buffalo yogurt sauce', '1/2 cup'),
  (@recipe_id, 'garlic powder and paprika', '2 tsp total'),
  (@recipe_id, 'blue cheese and scallions', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Spicy', 'Student-friendly');

-- Apple Cinnamon Oat Bake
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'Apple Cinnamon Oat Bake',
    '/images/Apple%20Cinnamon%20Oat%20Bake.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut rolled oats, milk, and apples and raisins into even pieces. Toss with maple syrup and cinnamon and vanilla.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with walnuts.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Apple Cinnamon Oat Bake is a oven-baked dish built around rolled oats, milk, and apples and raisins. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    600,
    24,
    45,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'rolled oats', '3 cups'),
  (@recipe_id, 'milk', '2 1/2 cups'),
  (@recipe_id, 'apples and raisins', '4 cups'),
  (@recipe_id, 'maple syrup', '1/3 cup'),
  (@recipe_id, 'cinnamon and vanilla', '2 tsp, 1 tsp'),
  (@recipe_id, 'walnuts', '1/2 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Meal Prep', 'Vegetarian');

-- Ranch Chicken Salad
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'Ranch Chicken Salad',
    '/images/Ranch%20Chicken%20Salad.jpg',
    'Preparation:
1. Wash and dry corn, tomato, cucumber thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare grilled chicken breast and romaine lettuce. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk ranch yogurt dressing with dill, garlic, black pepper. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If grilled chicken breast needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine romaine lettuce with corn, tomato, cucumber in a wide bowl and toss with a small amount of dressing first.
3. Add grilled chicken breast and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with cheddar and croutons just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Ranch Chicken Salad is a fresh salad built around grilled chicken breast, romaine lettuce, and corn, tomato, cucumber. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    515,
    22,
    34,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'grilled chicken breast', '500g'),
  (@recipe_id, 'romaine lettuce', '6 cups'),
  (@recipe_id, 'corn, tomato, cucumber', '4 cups'),
  (@recipe_id, 'ranch yogurt dressing', '1/2 cup'),
  (@recipe_id, 'dill, garlic, black pepper', '1 tbsp total'),
  (@recipe_id, 'cheddar and croutons', '1 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('High Protein', 'Quick Meal');

-- Chocolate Chip Skillet Cookie
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'American'),
    'Chocolate Chip Skillet Cookie',
    '/images/Chocolate%20Chip%20Skillet%20Cookie.jpg',
    'Preparation:
1. Set out chocolate chips, all purpose flour, and brown sugar and butter. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure vanilla egg mixture and baking soda and salt accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine chocolate chips with all purpose flour until evenly mixed. Fold in brown sugar and butter gently so it stays distinct.
2. Add vanilla egg mixture gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with vanilla ice cream just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Chocolate Chip Skillet Cookie is a sweet dessert built around chocolate chips, all purpose flour, and brown sugar and butter. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    455,
    7,
    49,
    15
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chocolate chips', '1 cup'),
  (@recipe_id, 'all purpose flour', '1 1/2 cups'),
  (@recipe_id, 'brown sugar and butter', '1 cup each'),
  (@recipe_id, 'vanilla egg mixture', '2 eggs'),
  (@recipe_id, 'baking soda and salt', '1 tsp, 1/2 tsp'),
  (@recipe_id, 'vanilla ice cream', 'for serving'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Family Dinner');

-- Tofu Quinoa Power Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Tofu Quinoa Power Bowl',
    '/images/Tofu%20Quinoa%20Power%20Bowl.jpg',
    'Preparation:
1. Cook or warm quinoa first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season extra firm tofu cubes with soy sauce and smoked paprika. Cut broccoli, carrot, cabbage into similar-size pieces for even cooking and easy eating.
3. Whisk sesame tahini sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook extra firm tofu cubes in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook broccoli, carrot, cabbage until tender-crisp, scraping up any browned bits to build flavor.
3. Return extra firm tofu cubes to the pan with a spoonful of sesame tahini sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide quinoa into bowls, add the cooked components, spoon over extra sesame tahini sauce, and top with pumpkin seeds and herbs.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Tofu Quinoa Power Bowl is a complete rice or grain bowl built around extra firm tofu cubes, quinoa, and broccoli, carrot, cabbage. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    610,
    28,
    69,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'extra firm tofu cubes', '500g'),
  (@recipe_id, 'quinoa', '3 cups cooked'),
  (@recipe_id, 'broccoli, carrot, cabbage', '5 cups'),
  (@recipe_id, 'sesame tahini sauce', '1/2 cup'),
  (@recipe_id, 'soy sauce and smoked paprika', '2 tbsp, 1 tsp'),
  (@recipe_id, 'pumpkin seeds and herbs', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Healthy', 'Meal Prep');

-- Lentil Mushroom Shepherd Pie
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Lentil Mushroom Shepherd Pie',
    '/images/Lentil%20Mushroom%20Shepherd%20Pie.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut cooked lentils, mashed potatoes, and mushrooms, peas, carrots into even pieces. Toss with tomato vegetable gravy and thyme, rosemary, garlic.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with parsley.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Lentil Mushroom Shepherd Pie is a oven-baked dish built around cooked lentils, mashed potatoes, and mushrooms, peas, carrots. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    525,
    23,
    48,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cooked lentils', '3 cups'),
  (@recipe_id, 'mashed potatoes', '4 cups'),
  (@recipe_id, 'mushrooms, peas, carrots', '5 cups'),
  (@recipe_id, 'tomato vegetable gravy', '2 cups'),
  (@recipe_id, 'thyme, rosemary, garlic', '1 tbsp total'),
  (@recipe_id, 'parsley', '1/3 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Comfort Food', 'Family Dinner');

-- Chickpea Spinach Curry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Chickpea Spinach Curry',
    '/images/Chickpea%20Spinach%20Curry.jpg',
    'Preparation:
1. Cut cooked chickpeas and spinach and tomato into similar-size pieces so they finish cooking together.
2. Cook or warm basmati rice. Curries are best when the base is ready before the sauce reaches its final texture.
3. Measure coconut tomato sauce and curry powder, cumin, ginger; curry spices can burn quickly, so keep them beside the pot.

Cooking:
1. Heat oil in a deep pan, add aromatics, then bloom curry powder, cumin, ginger for 30 to 60 seconds until fragrant.
2. Add cooked chickpeas and spinach and tomato. Stir until coated, then pour in coconut tomato sauce.
3. Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.

Serving and storage:
1. Rest the curry for 5 minutes, then finish with cilantro and lime.
2. Serve with basmati rice. Store in shallow containers; the flavor deepens after one night in the refrigerator.',
    'Chickpea Spinach Curry is a saucy curry built around cooked chickpeas, basmati rice, and spinach and tomato. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    760,
    31,
    59,
    26
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cooked chickpeas', '3 cups'),
  (@recipe_id, 'basmati rice', '4 cups cooked'),
  (@recipe_id, 'spinach and tomato', '5 cups'),
  (@recipe_id, 'coconut tomato sauce', '2 cups'),
  (@recipe_id, 'curry powder, cumin, ginger', '2 tbsp total'),
  (@recipe_id, 'cilantro and lime', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'onion and garlic', '1 onion, 3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Meal Prep');

-- Roasted Cauliflower Tacos
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Roasted Cauliflower Tacos',
    '/images/Roasted%20Cauliflower%20Tacos.jpg',
    'Preparation:
1. Prepare roasted cauliflower, corn tortillas, and cabbage slaw before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with chile powder and cumin. Keep avocado crema measured and ready.
3. Warm plates or tortillas if needed, and set cilantro and pickled onion aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook roasted cauliflower until browned and nearly done.
2. Add cabbage slaw and cook until softened. Stir in corn tortillas if it needs heating or crisping.
3. Lower the heat, add avocado crema, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with cilantro and pickled onion and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Roasted Cauliflower Tacos is a one-pan skillet meal built around roasted cauliflower, corn tortillas, and cabbage slaw. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    605,
    23,
    48,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'roasted cauliflower', '700g'),
  (@recipe_id, 'corn tortillas', '12'),
  (@recipe_id, 'cabbage slaw', '4 cups'),
  (@recipe_id, 'avocado crema', '1/2 cup'),
  (@recipe_id, 'chile powder and cumin', '2 tbsp total'),
  (@recipe_id, 'cilantro and pickled onion', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Street Food');

-- Sweet Potato Black Bean Chili
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Sweet Potato Black Bean Chili',
    '/images/Sweet%20Potato%20Black%20Bean%20Chili.jpg',
    'Preparation:
1. Rinse and drain sweet potato cubes. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim black beans into even pieces. Pat it dry, season lightly with chile powder, cumin, cocoa, and keep it chilled while the broth develops flavor.
3. Cut tomato, onion, bell pepper into bite-size pieces. Measure vegetable broth, then arrange avocado and cilantro on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and chile powder, cumin, cocoa; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in vegetable broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add black beans and tomato, onion, bell pepper. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place sweet potato cubes in warm bowls, ladle the hot soup over the top, and finish with avocado and cilantro.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Sweet Potato Black Bean Chili is a brothy soup built around black beans, sweet potato cubes, and tomato, onion, bell pepper. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    385,
    26,
    39,
    7
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'black beans', '3 cups'),
  (@recipe_id, 'sweet potato cubes', '600g'),
  (@recipe_id, 'tomato, onion, bell pepper', '5 cups'),
  (@recipe_id, 'vegetable broth', '1.5L'),
  (@recipe_id, 'chile powder, cumin, cocoa', '2 tbsp total'),
  (@recipe_id, 'avocado and cilantro', '1 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Soup', 'Meal Prep');

-- Pesto White Bean Toast
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Pesto White Bean Toast',
    '/images/Pesto%20White%20Bean%20Toast.jpg',
    'Preparation:
1. Prepare white beans first and keep it warm. Toast or warm sourdough slices so it can hold the filling without becoming soggy.
2. Slice arugula and cherry tomato thinly and pat wet ingredients dry. This keeps every bite crisp and prevents the sauce from watering down.
3. Mix basil pesto with lemon zest and black pepper. Taste for salt, heat, and acidity before assembling.

Cooking:
1. Heat a skillet and crisp or warm white beans until the edges are browned.
2. Brush the inside of sourdough slices with a thin layer of basil pesto, then layer in arugula and cherry tomato.
3. Add the warm filling and press gently so the sandwich holds together without crushing the bread.

Serving and storage:
1. Finish with parmesan and basil. Slice and serve while the bread is still warm and crisp.
2. For packed lunches, keep the sauce separate and assemble close to eating time.',
    'Pesto White Bean Toast is a layered sandwich built around white beans, sourdough slices, and arugula and cherry tomato. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    660,
    27,
    51,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'white beans', '2 cups'),
  (@recipe_id, 'sourdough slices', '8'),
  (@recipe_id, 'arugula and cherry tomato', '4 cups'),
  (@recipe_id, 'basil pesto', '1/2 cup'),
  (@recipe_id, 'lemon zest and black pepper', '2 tsp total'),
  (@recipe_id, 'parmesan and basil', '1/2 cup'),
  (@recipe_id, 'neutral oil or butter', '1 tbsp'),
  (@recipe_id, 'crisp lettuce or herbs', '1 handful');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Quick Meal');

-- Zucchini Noodle Primavera
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Zucchini Noodle Primavera',
    '/images/Zucchini%20Noodle%20Primavera.jpg',
    'Preparation:
1. Cut zucchini noodles into small even pieces so they cook quickly. Pat dry and season with half of Italian herbs and chile flakes.
2. Prepare white beans before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice peas, tomato, bell pepper thinly. Stir lemon garlic sauce with the remaining Italian herbs and chile flakes and keep parmesan and parsley ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear zucchini noodles until browned and nearly cooked through.
2. Add peas, tomato, bell pepper and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add white beans and pour lemon garlic sauce around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in parmesan and parsley, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Zucchini Noodle Primavera is a fast stir-fry built around zucchini noodles, white beans, and peas, tomato, bell pepper. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    545,
    28,
    55,
    18
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'zucchini noodles', '700g'),
  (@recipe_id, 'white beans', '2 cups'),
  (@recipe_id, 'peas, tomato, bell pepper', '4 cups'),
  (@recipe_id, 'lemon garlic sauce', '1/3 cup'),
  (@recipe_id, 'Italian herbs and chile flakes', '2 tsp total'),
  (@recipe_id, 'parmesan and parsley', '1/2 cup'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Low Carb', 'Quick Meal');

-- Sesame Edamame Rice Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Vegetarian'),
    'Sesame Edamame Rice Bowl',
    '/images/Sesame%20Edamame%20Rice%20Bowl.jpg',
    'Preparation:
1. Cook or warm brown rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season shelled edamame with ginger and rice vinegar. Cut cucumber, carrot, cabbage into similar-size pieces for even cooking and easy eating.
3. Whisk miso sesame dressing until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook shelled edamame in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook cucumber, carrot, cabbage until tender-crisp, scraping up any browned bits to build flavor.
3. Return shelled edamame to the pan with a spoonful of miso sesame dressing. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide brown rice into bowls, add the cooked components, spoon over extra miso sesame dressing, and top with nori and sesame seeds.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Sesame Edamame Rice Bowl is a complete rice or grain bowl built around shelled edamame, brown rice, and cucumber, carrot, cabbage. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    685,
    28,
    65,
    16
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shelled edamame', '2 cups'),
  (@recipe_id, 'brown rice', '4 cups cooked'),
  (@recipe_id, 'cucumber, carrot, cabbage', '5 cups'),
  (@recipe_id, 'miso sesame dressing', '1/2 cup'),
  (@recipe_id, 'ginger and rice vinegar', '1 tbsp each'),
  (@recipe_id, 'nori and sesame seeds', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Vegetarian', 'Healthy', 'Meal Prep');

-- Garlic Butter Shrimp Rice
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Garlic Butter Shrimp Rice',
    '/images/Garlic%20Butter%20Shrimp%20Rice.jpg',
    'Preparation:
1. Cook or warm jasmine rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season shrimp with lemon zest and paprika. Cut peas and asparagus into similar-size pieces for even cooking and easy eating.
3. Whisk garlic butter sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook shrimp in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook peas and asparagus until tender-crisp, scraping up any browned bits to build flavor.
3. Return shrimp to the pan with a spoonful of garlic butter sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide jasmine rice into bowls, add the cooked components, spoon over extra garlic butter sauce, and top with parsley and lemon.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Garlic Butter Shrimp Rice is a complete rice or grain bowl built around shrimp, jasmine rice, and peas and asparagus. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    635,
    32,
    69,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'shrimp', '500g'),
  (@recipe_id, 'jasmine rice', '4 cups cooked'),
  (@recipe_id, 'peas and asparagus', '4 cups'),
  (@recipe_id, 'garlic butter sauce', '1/2 cup'),
  (@recipe_id, 'lemon zest and paprika', '2 tsp total'),
  (@recipe_id, 'parsley and lemon', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Quick Meal', 'High Protein');

-- Coconut Fish Curry
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Coconut Fish Curry',
    '/images/Coconut%20Fish%20Curry.jpg',
    'Preparation:
1. Cut white fish chunks and eggplant, tomato, spinach into similar-size pieces so they finish cooking together.
2. Cook or warm jasmine rice. Curries are best when the base is ready before the sauce reaches its final texture.
3. Measure coconut curry sauce and curry paste and fish sauce; curry spices can burn quickly, so keep them beside the pot.

Cooking:
1. Heat oil in a deep pan, add aromatics, then bloom curry paste and fish sauce for 30 to 60 seconds until fragrant.
2. Add white fish chunks and eggplant, tomato, spinach. Stir until coated, then pour in coconut curry sauce.
3. Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.

Serving and storage:
1. Rest the curry for 5 minutes, then finish with cilantro and lime.
2. Serve with jasmine rice. Store in shallow containers; the flavor deepens after one night in the refrigerator.',
    'Coconut Fish Curry is a saucy curry built around white fish chunks, jasmine rice, and eggplant, tomato, spinach. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    610,
    29,
    56,
    25
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'white fish chunks', '600g'),
  (@recipe_id, 'jasmine rice', '4 cups cooked'),
  (@recipe_id, 'eggplant, tomato, spinach', '5 cups'),
  (@recipe_id, 'coconut curry sauce', '2 cups'),
  (@recipe_id, 'curry paste and fish sauce', '2 tbsp, 1 tbsp'),
  (@recipe_id, 'cilantro and lime', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'onion and garlic', '1 onion, 3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Family Dinner');

-- Tuna Poke Bowl
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Tuna Poke Bowl',
    '/images/Tuna%20Poke%20Bowl.jpg',
    'Preparation:
1. Cook or warm sushi rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season sushi grade tuna cubes with ginger and rice vinegar. Cut avocado, cucumber, edamame into similar-size pieces for even cooking and easy eating.
3. Whisk soy sesame poke sauce until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook sushi grade tuna cubes in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook avocado, cucumber, edamame until tender-crisp, scraping up any browned bits to build flavor.
3. Return sushi grade tuna cubes to the pan with a spoonful of soy sesame poke sauce. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide sushi rice into bowls, add the cooked components, spoon over extra soy sesame poke sauce, and top with nori, sesame, scallions.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Tuna Poke Bowl is a complete rice or grain bowl built around sushi grade tuna cubes, sushi rice, and avocado, cucumber, edamame. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    585,
    28,
    65,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'sushi grade tuna cubes', '450g'),
  (@recipe_id, 'sushi rice', '4 cups cooked'),
  (@recipe_id, 'avocado, cucumber, edamame', '5 cups'),
  (@recipe_id, 'soy sesame poke sauce', '1/2 cup'),
  (@recipe_id, 'ginger and rice vinegar', '1 tbsp each'),
  (@recipe_id, 'nori, sesame, scallions', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Healthy', 'Quick Meal');

-- Lemon Dill Cod Bake
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Lemon Dill Cod Bake',
    '/images/Lemon%20Dill%20Cod%20Bake.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut cod fillets, baby potatoes, and green beans and fennel into even pieces. Toss with lemon dill butter and garlic and black pepper.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with parsley and capers.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Lemon Dill Cod Bake is a oven-baked dish built around cod fillets, baby potatoes, and green beans and fennel. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    575,
    24,
    48,
    22
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cod fillets', '4'),
  (@recipe_id, 'baby potatoes', '700g'),
  (@recipe_id, 'green beans and fennel', '5 cups'),
  (@recipe_id, 'lemon dill butter', '1/2 cup'),
  (@recipe_id, 'garlic and black pepper', '1 tbsp total'),
  (@recipe_id, 'parsley and capers', '1/2 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Healthy', 'Family Dinner');

-- Crab Corn Fritters
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Crab Corn Fritters',
    '/images/Crab%20Corn%20Fritters.jpg',
    'Preparation:
1. Prepare lump crab meat, cornmeal batter, and corn kernels and scallions before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with Old Bay seasoning and pepper. Keep lemon yogurt sauce measured and ready.
3. Warm plates or tortillas if needed, and set parsley and lemon aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook lump crab meat until browned and nearly done.
2. Add corn kernels and scallions and cook until softened. Stir in cornmeal batter if it needs heating or crisping.
3. Lower the heat, add lemon yogurt sauce, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with parsley and lemon and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Crab Corn Fritters is a one-pan skillet meal built around lump crab meat, cornmeal batter, and corn kernels and scallions. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    630,
    25,
    51,
    17
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'lump crab meat', '350g'),
  (@recipe_id, 'cornmeal batter', '2 cups'),
  (@recipe_id, 'corn kernels and scallions', '2 cups'),
  (@recipe_id, 'lemon yogurt sauce', '1/2 cup'),
  (@recipe_id, 'Old Bay seasoning and pepper', '2 tsp total'),
  (@recipe_id, 'parsley and lemon', '1/2 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Student-friendly');

-- Mussel Tomato Stew
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Mussel Tomato Stew',
    '/images/Mussel%20Tomato%20Stew.jpg',
    'Preparation:
1. Rinse and drain crusty bread. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim cleaned mussels into even pieces. Pat it dry, season lightly with garlic, thyme, chile flakes, and keep it chilled while the broth develops flavor.
3. Cut tomato, fennel, onion into bite-size pieces. Measure white wine tomato broth, then arrange parsley and lemon on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and garlic, thyme, chile flakes; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in white wine tomato broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add cleaned mussels and tomato, fennel, onion. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place crusty bread in warm bowls, ladle the hot soup over the top, and finish with parsley and lemon.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Mussel Tomato Stew is a brothy soup built around cleaned mussels, crusty bread, and tomato, fennel, onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    385,
    26,
    44,
    11
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cleaned mussels', '1kg'),
  (@recipe_id, 'crusty bread', '4 slices'),
  (@recipe_id, 'tomato, fennel, onion', '5 cups'),
  (@recipe_id, 'white wine tomato broth', '1.5L'),
  (@recipe_id, 'garlic, thyme, chile flakes', '1 tbsp total'),
  (@recipe_id, 'parsley and lemon', '1/2 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Soup', 'Family Dinner');

-- Salmon Sushi Bake
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Salmon Sushi Bake',
    '/images/Salmon%20Sushi%20Bake.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut flaked salmon, sushi rice, and cucumber and avocado into even pieces. Toss with spicy mayo and furikake and rice vinegar.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with nori sheets and scallions.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Salmon Sushi Bake is a oven-baked dish built around flaked salmon, sushi rice, and cucumber and avocado. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    550,
    25,
    44,
    18
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'flaked salmon', '500g'),
  (@recipe_id, 'sushi rice', '4 cups cooked'),
  (@recipe_id, 'cucumber and avocado', '4 cups'),
  (@recipe_id, 'spicy mayo', '1/2 cup'),
  (@recipe_id, 'furikake and rice vinegar', '2 tbsp each'),
  (@recipe_id, 'nori sheets and scallions', '8 sheets'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Comfort Food');

-- Scallop Pea Risotto
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Seafood'),
    'Scallop Pea Risotto',
    '/images/Scallop%20Pea%20Risotto.jpg',
    'Preparation:
1. Cook or warm arborio rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season sea scallops with white wine, lemon, parmesan. Cut peas and asparagus into similar-size pieces for even cooking and easy eating.
3. Whisk warm seafood stock until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook sea scallops in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook peas and asparagus until tender-crisp, scraping up any browned bits to build flavor.
3. Return sea scallops to the pan with a spoonful of warm seafood stock. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide arborio rice into bowls, add the cooked components, spoon over extra warm seafood stock, and top with chives and parsley.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Scallop Pea Risotto is a complete rice or grain bowl built around sea scallops, arborio rice, and peas and asparagus. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    635,
    29,
    65,
    16
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'sea scallops', '500g'),
  (@recipe_id, 'arborio rice', '1 1/2 cups'),
  (@recipe_id, 'peas and asparagus', '4 cups'),
  (@recipe_id, 'warm seafood stock', '1.2L'),
  (@recipe_id, 'white wine, lemon, parmesan', '1/2 cup, 1 lemon, 1/2 cup'),
  (@recipe_id, 'chives and parsley', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Seafood', 'Family Dinner');

-- Spinach Feta Egg Muffins
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Spinach Feta Egg Muffins',
    '/images/Spinach%20Feta%20Egg%20Muffins.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut eggs, feta cheese, and spinach and bell pepper into even pieces. Toss with milk and garlic powder and black pepper.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with chives.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Spinach Feta Egg Muffins is a oven-baked dish built around eggs, feta cheese, and spinach and bell pepper. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    550,
    26,
    50,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'eggs', '10'),
  (@recipe_id, 'feta cheese', '1 cup'),
  (@recipe_id, 'spinach and bell pepper', '4 cups'),
  (@recipe_id, 'milk', '1/2 cup'),
  (@recipe_id, 'garlic powder and black pepper', '2 tsp total'),
  (@recipe_id, 'chives', '1/3 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Meal Prep', 'Vegetarian');

-- Banana Oat Pancakes
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Banana Oat Pancakes',
    '/images/Banana%20Oat%20Pancakes.jpg',
    'Preparation:
1. Prepare ripe bananas, rolled oats, and eggs before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with cinnamon and baking powder. Keep maple yogurt sauce measured and ready.
3. Warm plates or tortillas if needed, and set berries and walnuts aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook ripe bananas until browned and nearly done.
2. Add eggs and cook until softened. Stir in rolled oats if it needs heating or crisping.
3. Lower the heat, add maple yogurt sauce, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with berries and walnuts and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Banana Oat Pancakes is a one-pan skillet meal built around ripe bananas, rolled oats, and eggs. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    555,
    26,
    51,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ripe bananas', '3'),
  (@recipe_id, 'rolled oats', '2 cups'),
  (@recipe_id, 'eggs', '3'),
  (@recipe_id, 'maple yogurt sauce', '1/2 cup'),
  (@recipe_id, 'cinnamon and baking powder', '2 tsp total'),
  (@recipe_id, 'berries and walnuts', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Vegetarian', 'Student-friendly');

-- Savory Breakfast Burrito
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Savory Breakfast Burrito',
    '/images/Savory%20Breakfast%20Burrito.jpg',
    'Preparation:
1. Prepare scrambled eggs, large tortillas, and potato, pepper, onion before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with cumin and smoked paprika. Keep salsa verde measured and ready.
3. Warm plates or tortillas if needed, and set cheese and cilantro aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook scrambled eggs until browned and nearly done.
2. Add potato, pepper, onion and cook until softened. Stir in large tortillas if it needs heating or crisping.
3. Lower the heat, add salsa verde, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with cheese and cilantro and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Savory Breakfast Burrito is a one-pan skillet meal built around scrambled eggs, large tortillas, and potato, pepper, onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    480,
    23,
    51,
    22
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'scrambled eggs', '8 eggs'),
  (@recipe_id, 'large tortillas', '4'),
  (@recipe_id, 'potato, pepper, onion', '4 cups'),
  (@recipe_id, 'salsa verde', '1/2 cup'),
  (@recipe_id, 'cumin and smoked paprika', '2 tsp total'),
  (@recipe_id, 'cheese and cilantro', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Student-friendly');

-- Berry Yogurt Parfait
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Berry Yogurt Parfait',
    '/images/Berry%20Yogurt%20Parfait.jpg',
    'Preparation:
1. Set out Greek yogurt, granola, and mixed berries. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure honey and vanilla and lemon zest accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine Greek yogurt with granola until evenly mixed. Fold in mixed berries gently so it stays distinct.
2. Add honey gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with chia seeds and mint just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Berry Yogurt Parfait is a sweet dessert built around Greek yogurt, granola, and mixed berries. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    380,
    5,
    45,
    11
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'Greek yogurt', '2 cups'),
  (@recipe_id, 'granola', '2 cups'),
  (@recipe_id, 'mixed berries', '3 cups'),
  (@recipe_id, 'honey', '1/4 cup'),
  (@recipe_id, 'vanilla and lemon zest', '1 tsp each'),
  (@recipe_id, 'chia seeds and mint', '1/4 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Quick Meal', 'Vegetarian');

-- Avocado Egg Toast
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Avocado Egg Toast',
    '/images/Avocado%20Egg%20Toast.jpg',
    'Preparation:
1. Prepare eggs, whole grain toast, and avocado and tomato before heating the pan. Skillet recipes move quickly once started.
2. Season the main ingredient with chile flakes and black pepper. Keep lemon herb spread measured and ready.
3. Warm plates or tortillas if needed, and set microgreens aside for the end.

Cooking:
1. Heat a wide skillet over medium-high heat. Add oil, then cook eggs until browned and nearly done.
2. Add avocado and tomato and cook until softened. Stir in whole grain toast if it needs heating or crisping.
3. Lower the heat, add lemon herb spread, and stir until everything is coated and hot throughout.

Serving and storage:
1. Finish with microgreens and serve directly from the skillet or divide into portions.
2. If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.',
    'Avocado Egg Toast is a one-pan skillet meal built around eggs, whole grain toast, and avocado and tomato. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    530,
    25,
    52,
    16
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'eggs', '4'),
  (@recipe_id, 'whole grain toast', '4 slices'),
  (@recipe_id, 'avocado and tomato', '3 cups'),
  (@recipe_id, 'lemon herb spread', '1/3 cup'),
  (@recipe_id, 'chile flakes and black pepper', '1 tsp each'),
  (@recipe_id, 'microgreens', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Quick Meal', 'Vegetarian');

-- Smoked Salmon Bagel Plate
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Smoked Salmon Bagel Plate',
    '/images/Smoked%20Salmon%20Bagel%20Plate.jpg',
    'Preparation:
1. Prepare smoked salmon first and keep it warm. Toast or warm bagels so it can hold the filling without becoming soggy.
2. Slice cucumber, tomato, red onion thinly and pat wet ingredients dry. This keeps every bite crisp and prevents the sauce from watering down.
3. Mix dill cream cheese with capers and black pepper. Taste for salt, heat, and acidity before assembling.

Cooking:
1. Heat a skillet and crisp or warm smoked salmon until the edges are browned.
2. Brush the inside of bagels with a thin layer of dill cream cheese, then layer in cucumber, tomato, red onion.
3. Add the warm filling and press gently so the sandwich holds together without crushing the bread.

Serving and storage:
1. Finish with fresh dill and lemon. Slice and serve while the bread is still warm and crisp.
2. For packed lunches, keep the sauce separate and assemble close to eating time.',
    'Smoked Salmon Bagel Plate is a layered sandwich built around smoked salmon, bagels, and cucumber, tomato, red onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    660,
    25,
    52,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'smoked salmon', '250g'),
  (@recipe_id, 'bagels', '4'),
  (@recipe_id, 'cucumber, tomato, red onion', '4 cups'),
  (@recipe_id, 'dill cream cheese', '1 cup'),
  (@recipe_id, 'capers and black pepper', '2 tbsp, 1 tsp'),
  (@recipe_id, 'fresh dill and lemon', '1/3 cup'),
  (@recipe_id, 'neutral oil or butter', '1 tbsp'),
  (@recipe_id, 'crisp lettuce or herbs', '1 handful');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Seafood', 'Quick Meal');

-- Apple Peanut Butter Overnight Oats
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Apple Peanut Butter Overnight Oats',
    '/images/Apple%20Peanut%20Butter%20Overnight%20Oats.jpg',
    'Preparation:
1. Set out rolled oats, milk, and diced apples. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure peanut butter maple sauce and cinnamon and vanilla accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine rolled oats with milk until evenly mixed. Fold in diced apples gently so it stays distinct.
2. Add peanut butter maple sauce gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with pumpkin seeds just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Apple Peanut Butter Overnight Oats is a sweet dessert built around rolled oats, milk, and diced apples. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    330,
    8,
    51,
    10
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'rolled oats', '2 cups'),
  (@recipe_id, 'milk', '2 cups'),
  (@recipe_id, 'diced apples', '2 cups'),
  (@recipe_id, 'peanut butter maple sauce', '1/2 cup'),
  (@recipe_id, 'cinnamon and vanilla', '2 tsp, 1 tsp'),
  (@recipe_id, 'pumpkin seeds', '1/3 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Meal Prep', 'Vegetarian');

-- Breakfast Fried Rice
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Breakfast'),
    'Breakfast Fried Rice',
    '/images/Breakfast%20Fried%20Rice.jpg',
    'Preparation:
1. Cut eggs and turkey bacon into small even pieces so they cook quickly. Pat dry and season with half of garlic and white pepper.
2. Prepare day-old rice before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.
3. Slice peas, carrot, spinach thinly. Stir soy breakfast sauce with the remaining garlic and white pepper and keep scallions and sesame seeds ready at the stove.

Cooking:
1. Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear eggs and turkey bacon until browned and nearly cooked through.
2. Add peas, carrot, spinach and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.
3. Add day-old rice and pour soy breakfast sauce around the sides of the pan. Toss until the sauce coats everything and the base is hot.

Serving and storage:
1. Turn off the heat, fold in scallions and sesame seeds, and rest for 2 minutes before serving.
2. For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.',
    'Breakfast Fried Rice is a fast stir-fry built around eggs and turkey bacon, day-old rice, and peas, carrot, spinach. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    545,
    27,
    56,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'eggs and turkey bacon', '4 eggs, 200g'),
  (@recipe_id, 'day-old rice', '4 cups'),
  (@recipe_id, 'peas, carrot, spinach', '4 cups'),
  (@recipe_id, 'soy breakfast sauce', '1/3 cup'),
  (@recipe_id, 'garlic and white pepper', '1 tbsp total'),
  (@recipe_id, 'scallions and sesame seeds', '1/3 cup'),
  (@recipe_id, 'neutral oil', '2 tbsp'),
  (@recipe_id, 'garlic', '3 cloves');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Breakfast', 'Quick Meal');

-- Dark Chocolate Brownies
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Dark Chocolate Brownies',
    '/images/Dark%20Chocolate%20Brownies.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut dark chocolate, all purpose flour, and eggs and butter into even pieces. Toss with cocoa sugar mixture and vanilla and espresso powder.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with flaky salt.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Dark Chocolate Brownies is a oven-baked dish built around dark chocolate, all purpose flour, and eggs and butter. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    500,
    23,
    44,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'dark chocolate', '200g'),
  (@recipe_id, 'all purpose flour', '1 cup'),
  (@recipe_id, 'eggs and butter', '3 eggs, 170g'),
  (@recipe_id, 'cocoa sugar mixture', '1 1/2 cups'),
  (@recipe_id, 'vanilla and espresso powder', '1 tsp each'),
  (@recipe_id, 'flaky salt', '1 tsp'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Family Dinner');

-- Lemon Blueberry Cheesecake Cups
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Lemon Blueberry Cheesecake Cups',
    '/images/Lemon%20Blueberry%20Cheesecake%20Cups.jpg',
    'Preparation:
1. Set out cream cheese, graham crumbs, and blueberries. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure lemon honey syrup and vanilla and lemon zest accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine cream cheese with graham crumbs until evenly mixed. Fold in blueberries gently so it stays distinct.
2. Add lemon honey syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with mint and extra berries just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Lemon Blueberry Cheesecake Cups is a sweet dessert built around cream cheese, graham crumbs, and blueberries. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    330,
    6,
    48,
    14
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cream cheese', '450g'),
  (@recipe_id, 'graham crumbs', '1 1/2 cups'),
  (@recipe_id, 'blueberries', '2 cups'),
  (@recipe_id, 'lemon honey syrup', '1/3 cup'),
  (@recipe_id, 'vanilla and lemon zest', '1 tsp each'),
  (@recipe_id, 'mint and extra berries', '1/2 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Meal Prep');

-- Coconut Mango Sago
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Coconut Mango Sago',
    '/images/Coconut%20Mango%20Sago.jpg',
    'Preparation:
1. Set out small tapioca pearls, coconut milk, and ripe mango cubes. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure palm sugar syrup and pandan and salt accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine small tapioca pearls with coconut milk until evenly mixed. Fold in ripe mango cubes gently so it stays distinct.
2. Add palm sugar syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with toasted coconut just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Coconut Mango Sago is a sweet dessert built around small tapioca pearls, coconut milk, and ripe mango cubes. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    330,
    6,
    48,
    10
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'small tapioca pearls', '1 cup'),
  (@recipe_id, 'coconut milk', '2 cups'),
  (@recipe_id, 'ripe mango cubes', '3 cups'),
  (@recipe_id, 'palm sugar syrup', '1/3 cup'),
  (@recipe_id, 'pandan and salt', '1 leaf, 1 pinch'),
  (@recipe_id, 'toasted coconut', '1/3 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Vegetarian');

-- Strawberry Shortcake Jars
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Strawberry Shortcake Jars',
    '/images/Strawberry%20Shortcake%20Jars.jpg',
    'Preparation:
1. Set out strawberries, pound cake cubes, and whipped cream. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure vanilla syrup and lemon zest and salt accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine strawberries with pound cake cubes until evenly mixed. Fold in whipped cream gently so it stays distinct.
2. Add vanilla syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with mint leaves just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Strawberry Shortcake Jars is a sweet dessert built around strawberries, pound cake cubes, and whipped cream. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    380,
    7,
    52,
    14
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'strawberries', '3 cups'),
  (@recipe_id, 'pound cake cubes', '3 cups'),
  (@recipe_id, 'whipped cream', '2 cups'),
  (@recipe_id, 'vanilla syrup', '1/4 cup'),
  (@recipe_id, 'lemon zest and salt', '1 tsp, 1 pinch'),
  (@recipe_id, 'mint leaves', '1/3 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Quick Meal');

-- Banana Bread Loaf
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Banana Bread Loaf',
    '/images/Banana%20Bread%20Loaf.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut ripe bananas, all purpose flour, and eggs and butter into even pieces. Toss with brown sugar and cinnamon and baking soda.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with walnuts.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Banana Bread Loaf is a oven-baked dish built around ripe bananas, all purpose flour, and eggs and butter. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    500,
    23,
    48,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ripe bananas', '4'),
  (@recipe_id, 'all purpose flour', '2 cups'),
  (@recipe_id, 'eggs and butter', '2 eggs, 115g'),
  (@recipe_id, 'brown sugar', '3/4 cup'),
  (@recipe_id, 'cinnamon and baking soda', '2 tsp total'),
  (@recipe_id, 'walnuts', '1/2 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Breakfast');

-- Peanut Butter Energy Bites
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Peanut Butter Energy Bites',
    '/images/Peanut%20Butter%20Energy%20Bites.jpg',
    'Preparation:
1. Set out peanut butter, rolled oats, and mini chocolate chips. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure honey and vanilla and cinnamon accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine peanut butter with rolled oats until evenly mixed. Fold in mini chocolate chips gently so it stays distinct.
2. Add honey gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with chia seeds just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Peanut Butter Energy Bites is a sweet dessert built around peanut butter, rolled oats, and mini chocolate chips. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    430,
    7,
    51,
    14
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'peanut butter', '1 cup'),
  (@recipe_id, 'rolled oats', '2 cups'),
  (@recipe_id, 'mini chocolate chips', '1/2 cup'),
  (@recipe_id, 'honey', '1/3 cup'),
  (@recipe_id, 'vanilla and cinnamon', '1 tsp each'),
  (@recipe_id, 'chia seeds', '2 tbsp'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Meal Prep', 'Student-friendly');

-- Vietnamese Coffee Flan
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Vietnamese Coffee Flan',
    '/images/Vietnamese%20Coffee%20Flan.jpg',
    'Preparation:
1. Set out eggs, condensed milk, and strong coffee. Bring chilled dairy or eggs close to room temperature when the recipe uses them.
2. Measure caramel syrup and vanilla and salt accurately. Dessert texture depends on clean measurements and even mixing.
3. Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.

Cooking:
1. Combine eggs with condensed milk until evenly mixed. Fold in strong coffee gently so it stays distinct.
2. Add caramel syrup gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.
3. Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.

Serving and storage:
1. Finish with coffee whipped cream just before serving.
2. Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.',
    'Vietnamese Coffee Flan is a sweet dessert built around eggs, condensed milk, and strong coffee. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    380,
    8,
    44,
    12
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'eggs', '5'),
  (@recipe_id, 'condensed milk', '1 can'),
  (@recipe_id, 'strong coffee', '1/2 cup'),
  (@recipe_id, 'caramel syrup', '1/2 cup'),
  (@recipe_id, 'vanilla and salt', '1 tsp, 1 pinch'),
  (@recipe_id, 'coffee whipped cream', '1 cup'),
  (@recipe_id, 'fine sugar or honey', 'to taste'),
  (@recipe_id, 'fine sea salt', '1 pinch');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Family Dinner');

-- Cinnamon Baked Apples
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Dessert'),
    'Cinnamon Baked Apples',
    '/images/Cinnamon%20Baked%20Apples.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut firm apples, rolled oats, and raisins and walnuts into even pieces. Toss with maple butter sauce and cinnamon and nutmeg.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with yogurt or ice cream.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Cinnamon Baked Apples is a oven-baked dish built around firm apples, rolled oats, and raisins and walnuts. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    500,
    25,
    50,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'firm apples', '6'),
  (@recipe_id, 'rolled oats', '1 cup'),
  (@recipe_id, 'raisins and walnuts', '1 cup'),
  (@recipe_id, 'maple butter sauce', '1/2 cup'),
  (@recipe_id, 'cinnamon and nutmeg', '2 tsp total'),
  (@recipe_id, 'yogurt or ice cream', 'for serving'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Dessert', 'Vegetarian');

-- Honey Kumquat Iced Tea
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Honey Kumquat Iced Tea',
    '/images/Honey%20Kumquat%20Iced%20Tea.jpg',
    'Preparation:
1. Prepare black tea bags first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill cold water and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure honey syrup and pinch of salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine black tea bags, cold water, and kumquat juice in a pitcher or blender.
2. Add honey syrup and pinch of salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with kumquat slices and mint.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Honey Kumquat Iced Tea is a refreshing drink built around black tea bags, cold water, and kumquat juice. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    175,
    1,
    32,
    5
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'black tea bags', '4'),
  (@recipe_id, 'cold water', '4 cups'),
  (@recipe_id, 'kumquat juice', '1/2 cup'),
  (@recipe_id, 'honey syrup', '1/3 cup'),
  (@recipe_id, 'pinch of salt', '1 pinch'),
  (@recipe_id, 'kumquat slices and mint', '1/2 cup'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Quick Meal');

-- Cucumber Mint Limeade
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Cucumber Mint Limeade',
    '/images/Cucumber%20Mint%20Limeade.jpg',
    'Preparation:
1. Prepare cucumber first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill sparkling water and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure simple syrup and mint and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine cucumber, sparkling water, and lime juice in a pitcher or blender.
2. Add simple syrup and mint and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with lime wheels.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Cucumber Mint Limeade is a refreshing drink built around cucumber, sparkling water, and lime juice. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    200,
    4,
    26,
    3
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'cucumber', '2 large'),
  (@recipe_id, 'sparkling water', '4 cups'),
  (@recipe_id, 'lime juice', '1/2 cup'),
  (@recipe_id, 'simple syrup', '1/3 cup'),
  (@recipe_id, 'mint and salt', '1 cup, 1 pinch'),
  (@recipe_id, 'lime wheels', '8'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Healthy');

-- Matcha Oat Latte
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Matcha Oat Latte',
    '/images/Matcha%20Oat%20Latte.jpg',
    'Preparation:
1. Prepare matcha powder first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill oat milk and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure maple syrup and vanilla and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine matcha powder, oat milk, and hot water in a pitcher or blender.
2. Add maple syrup and vanilla and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with cinnamon dust.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Matcha Oat Latte is a refreshing drink built around matcha powder, oat milk, and hot water. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    225,
    3,
    28,
    0
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'matcha powder', '2 tbsp'),
  (@recipe_id, 'oat milk', '4 cups'),
  (@recipe_id, 'hot water', '1/2 cup'),
  (@recipe_id, 'maple syrup', '3 tbsp'),
  (@recipe_id, 'vanilla and salt', '1 tsp, 1 pinch'),
  (@recipe_id, 'cinnamon dust', '1 tsp'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Vegetarian');

-- Vietnamese Iced Coffee
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Vietnamese Iced Coffee',
    '/images/Vietnamese%20Iced%20Coffee.jpg',
    'Preparation:
1. Prepare strong brewed coffee first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill crushed ice and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure coffee syrup and vanilla and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine strong brewed coffee, crushed ice, and condensed milk in a pitcher or blender.
2. Add coffee syrup and vanilla and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with cocoa dust.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Vietnamese Iced Coffee is a refreshing drink built around strong brewed coffee, crushed ice, and condensed milk. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    250,
    3,
    33,
    1
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'strong brewed coffee', '2 cups'),
  (@recipe_id, 'crushed ice', '4 cups'),
  (@recipe_id, 'condensed milk', '1/2 cup'),
  (@recipe_id, 'coffee syrup', '2 tbsp'),
  (@recipe_id, 'vanilla and salt', '1 tsp, 1 pinch'),
  (@recipe_id, 'cocoa dust', '1 tsp'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Dessert');

-- Watermelon Basil Cooler
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Watermelon Basil Cooler',
    '/images/Watermelon%20Basil%20Cooler.jpg',
    'Preparation:
1. Prepare watermelon cubes first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill cold water and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure agave syrup and basil and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine watermelon cubes, cold water, and lime juice in a pitcher or blender.
2. Add agave syrup and basil and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with watermelon wedges.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Watermelon Basil Cooler is a refreshing drink built around watermelon cubes, cold water, and lime juice. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    200,
    2,
    29,
    3
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'watermelon cubes', '5 cups'),
  (@recipe_id, 'cold water', '2 cups'),
  (@recipe_id, 'lime juice', '1/3 cup'),
  (@recipe_id, 'agave syrup', '3 tbsp'),
  (@recipe_id, 'basil and salt', '1 cup, 1 pinch'),
  (@recipe_id, 'watermelon wedges', '4'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Healthy');

-- Ginger Turmeric Tea
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Ginger Turmeric Tea',
    '/images/Ginger%20Turmeric%20Tea.jpg',
    'Preparation:
1. Prepare fresh ginger slices first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill hot water and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure honey and turmeric and black pepper. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine fresh ginger slices, hot water, and lemon juice in a pitcher or blender.
2. Add honey and turmeric and black pepper, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with lemon wheels.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Ginger Turmeric Tea is a refreshing drink built around fresh ginger slices, hot water, and lemon juice. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    175,
    4,
    33,
    0
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'fresh ginger slices', '1/2 cup'),
  (@recipe_id, 'hot water', '4 cups'),
  (@recipe_id, 'lemon juice', '1/4 cup'),
  (@recipe_id, 'honey', '1/4 cup'),
  (@recipe_id, 'turmeric and black pepper', '1 tsp, 1 pinch'),
  (@recipe_id, 'lemon wheels', '4'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Healthy');

-- Strawberry Yogurt Smoothie
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Strawberry Yogurt Smoothie',
    '/images/Strawberry%20Yogurt%20Smoothie.jpg',
    'Preparation:
1. Prepare strawberries first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill plain yogurt and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure honey and vanilla and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine strawberries, plain yogurt, and banana in a pitcher or blender.
2. Add honey and vanilla and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with granola crumbs.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Strawberry Yogurt Smoothie is a refreshing drink built around strawberries, plain yogurt, and banana. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    300,
    2,
    30,
    0
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'strawberries', '3 cups'),
  (@recipe_id, 'plain yogurt', '2 cups'),
  (@recipe_id, 'banana', '1 large'),
  (@recipe_id, 'honey', '2 tbsp'),
  (@recipe_id, 'vanilla and salt', '1 tsp, 1 pinch'),
  (@recipe_id, 'granola crumbs', '1/4 cup'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Breakfast');

-- Pineapple Coconut Refresher
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Drinks'),
    'Pineapple Coconut Refresher',
    '/images/Pineapple%20Coconut%20Refresher.jpg',
    'Preparation:
1. Prepare pineapple chunks first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.
2. Chill coconut water and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.
3. Measure ginger syrup and mint and salt. Start with less sweetener than you think you need because it can always be added later.

Cooking:
1. Combine pineapple chunks, coconut water, and lime juice in a pitcher or blender.
2. Add ginger syrup and mint and salt, then blend, shake, or stir until fully combined.
3. Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.

Serving and storage:
1. Pour over fresh ice and finish with toasted coconut.
2. Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.',
    'Pineapple Coconut Refresher is a refreshing drink built around pineapple chunks, coconut water, and lime juice. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    200,
    1,
    26,
    1
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'pineapple chunks', '3 cups'),
  (@recipe_id, 'coconut water', '4 cups'),
  (@recipe_id, 'lime juice', '1/4 cup'),
  (@recipe_id, 'ginger syrup', '3 tbsp'),
  (@recipe_id, 'mint and salt', '1 cup, 1 pinch'),
  (@recipe_id, 'toasted coconut', '2 tbsp'),
  (@recipe_id, 'ice', '2 cups'),
  (@recipe_id, 'cold water or milk', 'as needed');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Drinks', 'Quick Meal');

-- Sheet Pan Chicken and Vegetables
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Sheet Pan Chicken and Vegetables',
    '/images/Sheet%20Pan%20Chicken%20and%20Vegetables.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut chicken breast pieces, baby potatoes, and broccoli, carrot, pepper into even pieces. Toss with lemon herb marinade and garlic powder and oregano.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with parsley and lemon.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Sheet Pan Chicken and Vegetables is a oven-baked dish built around chicken breast pieces, baby potatoes, and broccoli, carrot, pepper. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    650,
    24,
    48,
    22
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chicken breast pieces', '700g'),
  (@recipe_id, 'baby potatoes', '700g'),
  (@recipe_id, 'broccoli, carrot, pepper', '6 cups'),
  (@recipe_id, 'lemon herb marinade', '1/2 cup'),
  (@recipe_id, 'garlic powder and oregano', '2 tsp each'),
  (@recipe_id, 'parsley and lemon', '1/2 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'High Protein', 'Family Dinner');

-- Turkey Quinoa Stuffed Peppers
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Turkey Quinoa Stuffed Peppers',
    '/images/food-placeholder.jpg',
    'Preparation:
1. Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.
2. Cut ground turkey, quinoa, and bell peppers into even pieces. Toss with tomato salsa sauce and cumin and smoked paprika.
3. Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.

Cooking:
1. Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.
2. If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.
3. Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.

Serving and storage:
1. Rest for 5 to 10 minutes, then finish with cheese and cilantro.
2. Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.',
    'Turkey Quinoa Stuffed Peppers is a oven-baked dish built around ground turkey, quinoa, and bell peppers. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    575,
    25,
    49,
    21
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'ground turkey', '600g'),
  (@recipe_id, 'quinoa', '3 cups cooked'),
  (@recipe_id, 'bell peppers', '6 large'),
  (@recipe_id, 'tomato salsa sauce', '2 cups'),
  (@recipe_id, 'cumin and smoked paprika', '2 tsp each'),
  (@recipe_id, 'cheese and cilantro', '1 cup'),
  (@recipe_id, 'neutral oil or melted butter', '2 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'High Protein');

-- Garlic Tofu Rice Boxes
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Garlic Tofu Rice Boxes',
    '/images/food-placeholder.jpg',
    'Preparation:
1. Cook or warm brown rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season extra firm tofu with ginger and sesame oil. Cut green beans and carrots into similar-size pieces for even cooking and easy eating.
3. Whisk garlic soy glaze until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook extra firm tofu in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook green beans and carrots until tender-crisp, scraping up any browned bits to build flavor.
3. Return extra firm tofu to the pan with a spoonful of garlic soy glaze. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide brown rice into bowls, add the cooked components, spoon over extra garlic soy glaze, and top with sesame seeds and scallions.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Garlic Tofu Rice Boxes is a complete rice or grain bowl built around extra firm tofu, brown rice, and green beans and carrots. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    610,
    32,
    66,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'extra firm tofu', '600g'),
  (@recipe_id, 'brown rice', '4 cups cooked'),
  (@recipe_id, 'green beans and carrots', '5 cups'),
  (@recipe_id, 'garlic soy glaze', '1/2 cup'),
  (@recipe_id, 'ginger and sesame oil', '1 tbsp each'),
  (@recipe_id, 'sesame seeds and scallions', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'Vegetarian', 'Healthy');

-- Beef Burrito Freezer Bowls
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Beef Burrito Freezer Bowls',
    '/images/food-placeholder.jpg',
    'Preparation:
1. Cook or warm cilantro lime rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season seasoned ground beef with taco seasoning. Cut black beans, corn, peppers into similar-size pieces for even cooking and easy eating.
3. Whisk tomato salsa until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook seasoned ground beef in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook black beans, corn, peppers until tender-crisp, scraping up any browned bits to build flavor.
3. Return seasoned ground beef to the pan with a spoonful of tomato salsa. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide cilantro lime rice into bowls, add the cooked components, spoon over extra tomato salsa, and top with cheese and cilantro.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Beef Burrito Freezer Bowls is a complete rice or grain bowl built around seasoned ground beef, cilantro lime rice, and black beans, corn, peppers. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    585,
    29,
    66,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'seasoned ground beef', '600g'),
  (@recipe_id, 'cilantro lime rice', '4 cups'),
  (@recipe_id, 'black beans, corn, peppers', '5 cups'),
  (@recipe_id, 'tomato salsa', '1 cup'),
  (@recipe_id, 'taco seasoning', '2 tbsp'),
  (@recipe_id, 'cheese and cilantro', '1 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'High Protein', 'Student-friendly');

-- Greek Pasta Salad Boxes
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Greek Pasta Salad Boxes',
    '/images/food-placeholder.jpg',
    'Preparation:
1. Wash and dry cucumber, tomato, olives thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare chickpeas and short pasta. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk Greek vinaigrette with oregano and black pepper. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If chickpeas needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine short pasta with cucumber, tomato, olives in a wide bowl and toss with a small amount of dressing first.
3. Add chickpeas and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with feta and parsley just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Greek Pasta Salad Boxes is a fresh salad built around chickpeas, short pasta, and cucumber, tomato, olives. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    390,
    21,
    34,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chickpeas', '3 cups'),
  (@recipe_id, 'short pasta', '400g cooked'),
  (@recipe_id, 'cucumber, tomato, olives', '5 cups'),
  (@recipe_id, 'Greek vinaigrette', '1/2 cup'),
  (@recipe_id, 'oregano and black pepper', '2 tsp total'),
  (@recipe_id, 'feta and parsley', '1 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'Vegetarian', 'Fresh');

-- Lentil Soup Batch Pot
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Lentil Soup Batch Pot',
    '/images/food-placeholder.jpg',
    'Preparation:
1. Rinse and drain diced potatoes. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.
2. Trim brown lentils into even pieces. Pat it dry, season lightly with bay leaf, thyme, garlic, and keep it chilled while the broth develops flavor.
3. Cut carrot, celery, onion into bite-size pieces. Measure vegetable broth, then arrange parsley and lemon on a small plate for finishing.

Cooking:
1. Warm a heavy pot over medium heat. Add the aromatics and bay leaf, thyme, garlic; toast for 1 to 2 minutes until fragrant without letting them burn.
2. Pour in vegetable broth and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.
3. Add brown lentils and carrot, celery, onion. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.

Serving and storage:
1. Place diced potatoes in warm bowls, ladle the hot soup over the top, and finish with parsley and lemon.
2. Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.',
    'Lentil Soup Batch Pot is a brothy soup built around brown lentils, diced potatoes, and carrot, celery, onion. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    510,
    26,
    44,
    8
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'brown lentils', '2 cups'),
  (@recipe_id, 'diced potatoes', '500g'),
  (@recipe_id, 'carrot, celery, onion', '5 cups'),
  (@recipe_id, 'vegetable broth', '1.8L'),
  (@recipe_id, 'bay leaf, thyme, garlic', '1 tbsp total'),
  (@recipe_id, 'parsley and lemon', '1/2 cup'),
  (@recipe_id, 'low sodium stock or water', 'as needed'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'Vegetarian', 'Soup');

-- Teriyaki Salmon Lunch Boxes
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Teriyaki Salmon Lunch Boxes',
    '/images/food-placeholder.jpg',
    'Preparation:
1. Cook or warm jasmine rice first, then spread it slightly so excess steam escapes and the grains stay separate.
2. Season salmon fillets with ginger and garlic. Cut broccoli and snap peas into similar-size pieces for even cooking and easy eating.
3. Whisk teriyaki glaze until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.

Cooking:
1. Cook salmon fillets in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.
2. In the same pan, cook broccoli and snap peas until tender-crisp, scraping up any browned bits to build flavor.
3. Return salmon fillets to the pan with a spoonful of teriyaki glaze. Toss briefly so the coating is glossy, not watery.

Serving and storage:
1. Divide jasmine rice into bowls, add the cooked components, spoon over extra teriyaki glaze, and top with sesame seeds and scallions.
2. Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.',
    'Teriyaki Salmon Lunch Boxes is a complete rice or grain bowl built around salmon fillets, jasmine rice, and broccoli and snap peas. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    685,
    30,
    62,
    19
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'salmon fillets', '4'),
  (@recipe_id, 'jasmine rice', '4 cups cooked'),
  (@recipe_id, 'broccoli and snap peas', '5 cups'),
  (@recipe_id, 'teriyaki glaze', '1/2 cup'),
  (@recipe_id, 'ginger and garlic', '1 tbsp each'),
  (@recipe_id, 'sesame seeds and scallions', '1/3 cup'),
  (@recipe_id, 'neutral oil', '1 tbsp'),
  (@recipe_id, 'kosher salt', 'to taste');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'Seafood', 'High Protein');

-- Chickpea Couscous Jars
INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = 'Meal Prep'),
    'Chickpea Couscous Jars',
    '/images/food-placeholder.jpg',
    'Preparation:
1. Wash and dry cucumber, tomato, spinach thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.
2. Prepare chickpeas and couscous. Cool any hot components before mixing so the salad stays crisp.
3. Shake or whisk lemon tahini dressing with cumin and sumac. Taste for a clear balance of salt, acidity, and sweetness.

Cooking:
1. If chickpeas needs cooking, sear, grill, or warm it until done, then rest before slicing.
2. Combine couscous with cucumber, tomato, spinach in a wide bowl and toss with a small amount of dressing first.
3. Add chickpeas and enough extra dressing to coat without making the salad heavy.

Serving and storage:
1. Top with parsley and pumpkin seeds just before serving so crunchy pieces stay crisp.
2. For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.',
    'Chickpea Couscous Jars is a fresh salad built around chickpeas, couscous, and cucumber, tomato, spinach. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.',
    415,
    21,
    37,
    20
  );
SET @recipe_id = LAST_INSERT_ID();
INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (@recipe_id, 'chickpeas', '3 cups'),
  (@recipe_id, 'couscous', '3 cups cooked'),
  (@recipe_id, 'cucumber, tomato, spinach', '5 cups'),
  (@recipe_id, 'lemon tahini dressing', '1/2 cup'),
  (@recipe_id, 'cumin and sumac', '2 tsp total'),
  (@recipe_id, 'parsley and pumpkin seeds', '1/2 cup'),
  (@recipe_id, 'extra virgin olive oil', '2 tbsp'),
  (@recipe_id, 'lemon juice or vinegar', '1 tbsp');
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN ('Meal Prep', 'Vegetarian', 'Healthy');

COMMIT;
