USE foodstory;

SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM checklist_items;
DELETE FROM checklists;
DELETE FROM favorites;
DELETE FROM ratings;
DELETE FROM comments;
DELETE FROM recipe_tags;
DELETE FROM recipe_ingredients;
DELETE FROM recipes;
DELETE FROM tags;
DELETE FROM categories;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO users (username, email, password_hash, role)
VALUES
  ('admin', 'admin@foodstory.test', '$2a$10$tQy/BUVTgZWDskpJWWoNB.3SsChspHqY3ad.QCEhFVX94YJzm.3My', 'admin'),
  ('long', 'long@foodstory.test', '$2a$10$RHxrLQU0durOB3SJPPxOyul4D857v2M1gOtOb3p00gydqVMqvySm.', 'user')
ON DUPLICATE KEY UPDATE
  username = VALUES(username),
  role = VALUES(role);

INSERT INTO categories (id, name) VALUES
  (1, 'Vietnamese'),
  (2, 'Korean'),
  (3, 'Japanese'),
  (4, 'Dessert'),
  (5, 'Drinks')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO tags (id, name) VALUES
  (1, 'Spicy'),
  (2, 'Healthy'),
  (3, 'Quick Meal'),
  (4, 'Vegetarian'),
  (5, 'Student-friendly')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO recipes
  (id, category_id, title, image_url, instructions, calories, protein, carbs, fat)
VALUES
  (
    1,
    1,
    'Hanoi Beef Pho',
    'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=900&q=80',
    'Char the ginger and onion until fragrant. Simmer beef bones with star anise, cinnamon, and black cardamom. Blanch the rice noodles, add thinly sliced beef, pour over the hot broth, and serve with fresh herbs.',
    520,
    34,
    62,
    14
  ),
  (
    2,
    1,
    'Student-Style Pate Banh Mi',
    'https://images.unsplash.com/photo-1600454309261-3dc9b7597637?auto=format&fit=crop&w=900&q=80',
    'Warm the baguette until crisp. Spread the pate, then add Vietnamese pork sausage, cucumber, pickles, cilantro, and chili sauce. Press gently to hold the filling together.',
    430,
    18,
    55,
    15
  ),
  (
    3,
    1,
    'Shrimp and Pork Fresh Spring Rolls',
    'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80',
    'Soften the rice paper. Add herbs, rice vermicelli, shrimp, and cooked pork, then roll tightly. Serve with peanut sauce or sweet-and-sour fish sauce.',
    310,
    22,
    36,
    8
  ),
  (
    4,
    2,
    'Kimchi Fried Rice',
    'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=900&q=80',
    'Stir-fry kimchi with onion, then add chilled rice and gochujang. Cook until the rice is firm, top with a fried egg, and finish with toasted sesame seeds.',
    480,
    16,
    68,
    16
  ),
  (
    5,
    2,
    'Vegetable Bibimbap',
    'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=900&q=80',
    'Prepare hot rice, separately sauteed vegetables, an egg, and gochujang sauce. Arrange everything in a bowl and mix well before eating.',
    560,
    21,
    82,
    15
  ),
  (
    6,
    3,
    'Tuna Mayo Onigiri',
    'https://images.unsplash.com/photo-1615361200141-f45040f367be?auto=format&fit=crop&w=900&q=80',
    'Mix tuna with mayonnaise and pepper. Shape the rice into triangles with the filling in the center, then wrap with seaweed just before serving.',
    360,
    17,
    52,
    9
  ),
  (
    7,
    3,
    'Mushroom and Tofu Miso Soup',
    'https://images.unsplash.com/photo-1607301405390-d831c242f59b?auto=format&fit=crop&w=900&q=80',
    'Gently heat the dashi broth, then add mushrooms, tofu, and seaweed. Turn off the heat before stirring in the miso to preserve its aroma.',
    180,
    12,
    18,
    6
  ),
  (
    8,
    4,
    'Mango Coconut Dessert',
    'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80',
    'Blend part of the mango with coconut milk. Dice the remaining mango, add small tapioca pearls, and chill before serving.',
    340,
    5,
    58,
    11
  ),
  (
    9,
    4,
    'Coffee Creme Caramel',
    'https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=900&q=80',
    'Prepare the caramel, then mix eggs and milk with instant coffee. Steam gently until smooth and chill for at least two hours.',
    290,
    8,
    36,
    12
  ),
  (
    10,
    5,
    'Honey Kumquat Tea',
    'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80',
    'Brew black tea and let it cool slightly before adding honey and kumquat juice. Shake with ice until well combined.',
    120,
    1,
    30,
    0
  );

INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (1, 'Rice noodles', '400g'),
  (1, 'Rare beef', '300g'),
  (1, 'Beef bones', '1kg'),
  (1, 'Star anise, cinnamon, ginger, and onion', '1 portion'),
  (2, 'Baguettes', '2'),
  (2, 'Pate', '80g'),
  (2, 'Vietnamese pork sausage', '120g'),
  (2, 'Pickled vegetables', '1 cup'),
  (3, 'Rice paper wrappers', '8'),
  (3, 'Cooked shrimp', '200g'),
  (3, 'Cooked pork', '150g'),
  (3, 'Fresh herbs and rice vermicelli', '1 portion'),
  (4, 'Chilled rice', '2 cups'),
  (4, 'Kimchi', '1 cup'),
  (4, 'Eggs', '2'),
  (4, 'Gochujang', '1 tablespoon'),
  (5, 'Steamed rice', '2 cups'),
  (5, 'Seasonal vegetables', '300g'),
  (5, 'Eggs', '2'),
  (5, 'Gochujang sauce', '2 tablespoons'),
  (6, 'Japanese short-grain rice', '2 cups'),
  (6, 'Canned tuna', '120g'),
  (6, 'Mayonnaise', '2 tablespoons'),
  (6, 'Seaweed sheets', '4'),
  (7, 'Silken tofu', '200g'),
  (7, 'Miso', '2 tablespoons'),
  (7, 'Mushrooms', '120g'),
  (7, 'Wakame seaweed', '1 tablespoon'),
  (8, 'Ripe mangoes', '2'),
  (8, 'Coconut milk', '250ml'),
  (8, 'Small tapioca pearls', '80g'),
  (9, 'Eggs', '4'),
  (9, 'Fresh milk', '400ml'),
  (9, 'Instant coffee', '1 packet'),
  (9, 'Sugar', '80g'),
  (10, 'Black tea bags', '2'),
  (10, 'Kumquats', '5'),
  (10, 'Honey', '2 tablespoons');

INSERT INTO recipe_tags (recipe_id, tag_id) VALUES
  (1, 2),
  (1, 5),
  (2, 3),
  (2, 5),
  (3, 2),
  (3, 3),
  (4, 1),
  (4, 3),
  (5, 2),
  (5, 4),
  (6, 3),
  (6, 5),
  (7, 2),
  (7, 4),
  (8, 4),
  (9, 5),
  (10, 2),
  (10, 3);
