import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'

function item(value) {
  return { name: value[0], quantity: value[1] }
}

function r(
  title,
  category,
  style,
  primary,
  base,
  produce,
  sauce,
  seasoning,
  garnish,
  tags,
  extras = [],
) {
  return {
    title,
    category,
    style,
    primary: item(primary),
    base: item(base),
    produce: item(produce),
    sauce: item(sauce),
    seasoning: item(seasoning),
    garnish: item(garnish),
    tags,
    extras: extras.map(item),
  }
}

const seedImageUrl = ''

const styleLabels = {
  soup: 'brothy soup',
  stirFry: 'fast stir-fry',
  bowl: 'complete rice or grain bowl',
  braise: 'slow simmered braise',
  noodle: 'noodle dish',
  sandwich: 'layered sandwich',
  curry: 'saucy curry',
  salad: 'fresh salad',
  bake: 'oven-baked dish',
  grill: 'grilled plate',
  skillet: 'one-pan skillet meal',
  dessert: 'sweet dessert',
  drink: 'refreshing drink',
}

const nutritionByStyle = {
  soup: { calories: 360, protein: 24, carbs: 42, fat: 10 },
  stirFry: { calories: 520, protein: 28, carbs: 58, fat: 18 },
  bowl: { calories: 560, protein: 30, carbs: 66, fat: 18 },
  braise: { calories: 540, protein: 34, carbs: 36, fat: 24 },
  noodle: { calories: 590, protein: 27, carbs: 78, fat: 17 },
  sandwich: { calories: 510, protein: 25, carbs: 55, fat: 20 },
  curry: { calories: 610, protein: 29, carbs: 58, fat: 25 },
  salad: { calories: 390, protein: 20, carbs: 34, fat: 18 },
  bake: { calories: 500, protein: 25, carbs: 48, fat: 20 },
  grill: { calories: 470, protein: 33, carbs: 38, fat: 18 },
  skillet: { calories: 480, protein: 24, carbs: 50, fat: 19 },
  dessert: { calories: 330, protein: 6, carbs: 48, fat: 12 },
  drink: { calories: 150, protein: 3, carbs: 30, fat: 2 },
}

const pantryByStyle = {
  soup: [
    ['low sodium stock or water', 'as needed'],
    ['kosher salt', 'to taste'],
  ],
  stirFry: [
    ['neutral oil', '2 tbsp'],
    ['garlic', '3 cloves'],
  ],
  bowl: [
    ['neutral oil', '1 tbsp'],
    ['kosher salt', 'to taste'],
  ],
  braise: [
    ['neutral oil', '1 tbsp'],
    ['water or stock', '1 cup'],
  ],
  noodle: [
    ['reserved noodle water', '1 cup'],
    ['neutral oil', '1 tbsp'],
  ],
  sandwich: [
    ['neutral oil or butter', '1 tbsp'],
    ['crisp lettuce or herbs', '1 handful'],
  ],
  curry: [
    ['neutral oil', '1 tbsp'],
    ['onion and garlic', '1 onion, 3 cloves'],
  ],
  salad: [
    ['extra virgin olive oil', '2 tbsp'],
    ['lemon juice or vinegar', '1 tbsp'],
  ],
  bake: [
    ['neutral oil or melted butter', '2 tbsp'],
    ['kosher salt', 'to taste'],
  ],
  grill: [
    ['neutral oil', '1 tbsp'],
    ['lemon wedges', 'for serving'],
  ],
  skillet: [
    ['neutral oil', '1 tbsp'],
    ['kosher salt', 'to taste'],
  ],
  dessert: [
    ['fine sugar or honey', 'to taste'],
    ['fine sea salt', '1 pinch'],
  ],
  drink: [
    ['ice', '2 cups'],
    ['cold water or milk', 'as needed'],
  ],
}

export const recipes = [
  r(
    'Hanoi Beef Pho',
    'Vietnamese',
    'soup',
    ['thinly sliced beef sirloin', '350g'],
    ['flat rice noodles', '450g fresh'],
    ['yellow onion and ginger', '1 onion, 1 thumb'],
    ['beef broth', '1.8L'],
    ['star anise, cinnamon, fish sauce', '3 pods, 1 stick, 3 tbsp'],
    ['bean sprouts, basil, lime, scallions', '1 platter'],
    ['Soup', 'High Protein', 'Comfort Food'],
    [
      ['beef meatballs', '200g'],
      ['rock sugar', '1 tbsp'],
    ],
  ),
  r(
    'Saigon Lemongrass Chicken Rice',
    'Vietnamese',
    'bowl',
    ['boneless chicken thighs', '500g'],
    ['jasmine rice', '2 cups cooked'],
    ['cucumber, carrot, and lettuce', '3 cups sliced'],
    ['fish sauce lime dressing', '1/3 cup'],
    ['lemongrass, garlic, turmeric', '3 stalks, 3 cloves, 1 tsp'],
    ['cilantro and fried shallots', '1/2 cup'],
    ['High Protein', 'Student-friendly', 'Meal Prep'],
  ),
  r(
    'Fresh Shrimp Summer Rolls',
    'Vietnamese',
    'salad',
    ['cooked shrimp halves', '250g'],
    ['rice paper wrappers', '12 sheets'],
    ['lettuce, mint, and cucumber', '4 cups'],
    ['peanut hoisin sauce', '1/2 cup'],
    ['rice vinegar and fish sauce', '2 tbsp each'],
    ['crushed peanuts and herbs', '1/3 cup'],
    ['Healthy', 'Quick Meal', 'Fresh'],
    [
      ['rice vermicelli', '200g cooked'],
      ['pickled carrot', '1 cup'],
    ],
  ),
  r(
    'Caramelized Pork Clay Pot',
    'Vietnamese',
    'braise',
    ['pork shoulder slices', '600g'],
    ['steamed jasmine rice', '3 cups'],
    ['shallots and green onions', '1 cup'],
    ['coconut water', '1 cup'],
    ['fish sauce, black pepper, caramel', '3 tbsp, 1 tsp, 2 tbsp'],
    ['cilantro and sliced chile', '1/3 cup'],
    ['Comfort Food', 'Family Dinner'],
    [['soft boiled eggs', '4']],
  ),
  r(
    'Turmeric Fish Noodle Bowl',
    'Vietnamese',
    'noodle',
    ['white fish fillets', '500g'],
    ['rice vermicelli', '300g'],
    ['dill, scallions, and lettuce', '4 cups'],
    ['pineapple fish sauce dressing', '1/2 cup'],
    ['turmeric, galangal, shrimp paste', '1 tbsp, 1 tsp, 1 tsp'],
    ['roasted peanuts and herbs', '1/2 cup'],
    ['Seafood', 'Fresh', 'High Protein'],
  ),
  r(
    'Crispy Banh Mi Chicken Sandwich',
    'Vietnamese',
    'sandwich',
    ['crispy chicken cutlets', '4 pieces'],
    ['baguette rolls', '4'],
    ['pickled carrot, daikon, cucumber', '3 cups'],
    ['chile mayo', '1/2 cup'],
    ['five spice and garlic powder', '1 tsp each'],
    ['cilantro and jalapeno', '1 cup'],
    ['Student-friendly', 'Street Food'],
  ),
  r(
    'Vietnamese Coconut Chicken Curry',
    'Vietnamese',
    'curry',
    ['bone-in chicken pieces', '700g'],
    ['warm baguette or rice', '4 portions'],
    ['potato, carrot, and onion', '4 cups'],
    ['coconut milk', '400ml'],
    ['curry powder, lemongrass, fish sauce', '2 tbsp, 2 stalks, 2 tbsp'],
    ['Thai basil and lime', '1 handful'],
    ['Comfort Food', 'Family Dinner'],
  ),
  r(
    'Garlic Morning Glory Stir Fry',
    'Vietnamese',
    'stirFry',
    ['morning glory stems', '500g'],
    ['steamed rice', '3 cups'],
    ['red chile and scallions', '1/2 cup'],
    ['oyster sauce', '2 tbsp'],
    ['fermented bean paste and garlic', '1 tbsp, 5 cloves'],
    ['fried garlic', '2 tbsp'],
    ['Vegetarian', 'Quick Meal', 'Student-friendly'],
  ),

  r(
    'Kimchi Fried Rice with Egg',
    'Korean',
    'stirFry',
    ['chopped napa kimchi', '1 1/2 cups'],
    ['day-old rice', '3 cups'],
    ['onion and peas', '1 1/2 cups'],
    ['kimchi juice and gochujang', '1/3 cup'],
    ['soy sauce and sesame oil', '1 tbsp each'],
    ['fried eggs and sesame seeds', '4 eggs'],
    ['Spicy', 'Quick Meal', 'Student-friendly'],
  ),
  r(
    'Beef Bulgogi Lettuce Bowls',
    'Korean',
    'bowl',
    ['thin sliced beef', '500g'],
    ['short grain rice', '3 cups cooked'],
    ['romaine lettuce and cucumber', '4 cups'],
    ['pear soy marinade', '1/2 cup'],
    ['garlic, ginger, sesame oil', '4 cloves, 1 tsp, 1 tbsp'],
    ['scallions and sesame seeds', '1/2 cup'],
    ['High Protein', 'Family Dinner'],
  ),
  r(
    'Gochujang Tofu Stew',
    'Korean',
    'soup',
    ['firm tofu cubes', '450g'],
    ['short grain rice', '3 cups cooked'],
    ['zucchini, mushroom, and onion', '4 cups'],
    ['anchovy or vegetable broth', '1.5L'],
    ['gochujang and doenjang', '2 tbsp each'],
    ['scallions and sesame oil', '1/3 cup'],
    ['Spicy', 'Vegetarian', 'Soup'],
  ),
  r(
    'Bibimbap Vegetable Rice Bowl',
    'Korean',
    'bowl',
    ['fried eggs', '4'],
    ['short grain rice', '4 cups cooked'],
    ['spinach, carrot, bean sprouts', '5 cups'],
    ['gochujang bibimbap sauce', '1/2 cup'],
    ['sesame oil and soy sauce', '2 tbsp each'],
    ['nori strips and sesame seeds', '1/3 cup'],
    ['Vegetarian', 'Healthy', 'Family Dinner'],
  ),
  r(
    'Spicy Pork Noodle Stir Fry',
    'Korean',
    'noodle',
    ['thin pork shoulder', '500g'],
    ['wheat noodles', '350g'],
    ['cabbage and onion', '4 cups'],
    ['gochujang soy sauce', '1/2 cup'],
    ['ginger, garlic, chile flakes', '1 tbsp total'],
    ['scallions and sesame seeds', '1/2 cup'],
    ['Spicy', 'Comfort Food'],
  ),
  r(
    'Soy Garlic Crispy Chicken',
    'Korean',
    'stirFry',
    ['chicken thigh bites', '600g'],
    ['steamed rice', '3 cups'],
    ['cabbage slaw', '3 cups'],
    ['soy garlic glaze', '1/2 cup'],
    ['rice flour and black pepper', '1/2 cup, 1 tsp'],
    ['sesame seeds and scallions', '1/3 cup'],
    ['High Protein', 'Student-friendly'],
  ),
  r(
    'Korean Seaweed Beef Soup',
    'Korean',
    'soup',
    ['lean beef strips', '300g'],
    ['steamed rice', '3 cups'],
    ['dried seaweed', '25g'],
    ['beef broth', '1.4L'],
    ['garlic, soy sauce, sesame oil', '3 cloves, 2 tbsp, 1 tbsp'],
    ['scallions', '1/3 cup'],
    ['Healthy', 'Soup', 'High Protein'],
  ),
  r(
    'Japchae Glass Noodles',
    'Korean',
    'noodle',
    ['beef strips or tofu', '350g'],
    ['sweet potato glass noodles', '350g'],
    ['spinach, carrot, mushroom', '5 cups'],
    ['soy sesame sauce', '1/2 cup'],
    ['garlic and black pepper', '3 cloves, 1 tsp'],
    ['sesame seeds', '2 tbsp'],
    ['Family Dinner', 'Vegetarian'],
  ),

  r(
    'Salmon Teriyaki Donburi',
    'Japanese',
    'bowl',
    ['salmon fillets', '4 small'],
    ['Japanese rice', '4 cups cooked'],
    ['broccoli and cucumber', '4 cups'],
    ['teriyaki sauce', '1/2 cup'],
    ['ginger and garlic', '1 tbsp each'],
    ['furikake and scallions', '1/3 cup'],
    ['Seafood', 'High Protein', 'Healthy'],
  ),
  r(
    'Chicken Katsu Curry',
    'Japanese',
    'curry',
    ['breaded chicken cutlets', '4'],
    ['Japanese rice', '4 cups cooked'],
    ['potato, carrot, and onion', '4 cups'],
    ['Japanese curry sauce', '3 cups'],
    ['curry powder and soy sauce', '2 tsp, 1 tbsp'],
    ['pickled ginger and scallions', '1/3 cup'],
    ['Comfort Food', 'Family Dinner'],
  ),
  r(
    'Miso Tofu Soup',
    'Japanese',
    'soup',
    ['silken tofu cubes', '350g'],
    ['steamed rice', '3 cups'],
    ['wakame and mushrooms', '2 cups'],
    ['dashi broth', '1.4L'],
    ['white miso paste', '3 tbsp'],
    ['scallions', '1/3 cup'],
    ['Healthy', 'Vegetarian', 'Soup'],
  ),
  r(
    'Tuna Mayo Onigiri Plate',
    'Japanese',
    'bowl',
    ['canned tuna', '2 cans'],
    ['sushi rice', '4 cups cooked'],
    ['cucumber and avocado', '3 cups'],
    ['Japanese mayo', '1/3 cup'],
    ['rice vinegar and soy sauce', '2 tbsp each'],
    ['nori sheets and sesame seeds', '6 sheets'],
    ['Quick Meal', 'Student-friendly'],
  ),
  r(
    'Vegetable Yakisoba',
    'Japanese',
    'noodle',
    ['sliced tofu or pork', '350g'],
    ['yakisoba noodles', '400g'],
    ['cabbage, carrot, onion', '5 cups'],
    ['yakisoba sauce', '1/2 cup'],
    ['ginger and white pepper', '1 tsp each'],
    ['pickled ginger and scallions', '1/3 cup'],
    ['Quick Meal', 'Street Food'],
  ),
  r(
    'Pork Gyoza Rice Plate',
    'Japanese',
    'skillet',
    ['pork gyoza', '24 pieces'],
    ['Japanese rice', '4 cups cooked'],
    ['shredded cabbage', '4 cups'],
    ['ponzu dipping sauce', '1/3 cup'],
    ['sesame oil and ginger', '1 tbsp, 1 tsp'],
    ['scallions and sesame seeds', '1/3 cup'],
    ['Student-friendly', 'Family Dinner'],
  ),
  r(
    'Soba Noodle Sesame Salad',
    'Japanese',
    'salad',
    ['edamame', '1 1/2 cups'],
    ['soba noodles', '300g'],
    ['cucumber, carrot, radish', '4 cups'],
    ['sesame soy dressing', '1/2 cup'],
    ['rice vinegar and wasabi', '2 tbsp, 1 tsp'],
    ['nori strips and sesame', '1/3 cup'],
    ['Healthy', 'Vegetarian', 'Meal Prep'],
  ),
  r(
    'Matcha Chia Pudding',
    'Japanese',
    'dessert',
    ['chia seeds', '1/2 cup'],
    ['oat milk', '2 cups'],
    ['berries', '1 cup'],
    ['maple syrup', '3 tbsp'],
    ['matcha powder and vanilla', '2 tsp, 1 tsp'],
    ['toasted coconut', '1/4 cup'],
    ['Dessert', 'Healthy', 'Vegetarian'],
  ),

  r(
    'Chicken Pad Thai',
    'Thai',
    'stirFry',
    ['chicken breast strips', '450g'],
    ['rice noodles', '350g'],
    ['bean sprouts and garlic chives', '4 cups'],
    ['tamarind fish sauce', '1/2 cup'],
    ['palm sugar and chile flakes', '2 tbsp, 1 tsp'],
    ['peanuts, lime, cilantro', '1/2 cup'],
    ['Quick Meal', 'Street Food'],
    [['eggs', '2']],
  ),
  r(
    'Green Curry Vegetables',
    'Thai',
    'curry',
    ['firm tofu cubes', '450g'],
    ['jasmine rice', '4 cups cooked'],
    ['eggplant, bamboo shoots, peppers', '5 cups'],
    ['coconut milk', '400ml'],
    ['green curry paste and fish sauce', '3 tbsp, 1 tbsp'],
    ['Thai basil and lime', '1 handful'],
    ['Spicy', 'Vegetarian', 'Family Dinner'],
  ),
  r(
    'Tom Yum Shrimp Soup',
    'Thai',
    'soup',
    ['shrimp', '400g'],
    ['jasmine rice', '3 cups cooked'],
    ['mushrooms and tomato', '3 cups'],
    ['lemongrass broth', '1.5L'],
    ['lime leaves, galangal, fish sauce', '6 leaves, 4 slices, 2 tbsp'],
    ['cilantro and lime wedges', '1/2 cup'],
    ['Spicy', 'Seafood', 'Soup'],
  ),
  r(
    'Basil Beef Stir Fry',
    'Thai',
    'stirFry',
    ['ground beef', '500g'],
    ['jasmine rice', '4 cups cooked'],
    ['green beans and bell pepper', '4 cups'],
    ['oyster fish sauce blend', '1/3 cup'],
    ['garlic and Thai chile', '5 cloves, 2 chiles'],
    ['holy basil and fried egg', '1 cup'],
    ['Spicy', 'High Protein', 'Quick Meal'],
  ),
  r(
    'Mango Sticky Rice',
    'Thai',
    'dessert',
    ['ripe mango slices', '3 mangoes'],
    ['sticky rice', '2 cups cooked'],
    ['coconut cream', '1 cup'],
    ['palm sugar syrup', '1/3 cup'],
    ['sea salt and pandan', '1 pinch, 1 leaf'],
    ['toasted sesame seeds', '2 tbsp'],
    ['Dessert', 'Vegetarian'],
  ),
  r(
    'Thai Peanut Chicken Salad',
    'Thai',
    'salad',
    ['grilled chicken breast', '450g'],
    ['rice noodles', '250g cooked'],
    ['cabbage, carrot, cucumber', '5 cups'],
    ['peanut lime dressing', '1/2 cup'],
    ['ginger, garlic, fish sauce', '1 tbsp total'],
    ['mint, cilantro, peanuts', '1/2 cup'],
    ['Healthy', 'High Protein', 'Meal Prep'],
  ),
  r(
    'Pineapple Fried Rice',
    'Thai',
    'stirFry',
    ['shrimp or tofu', '400g'],
    ['day-old jasmine rice', '4 cups'],
    ['pineapple, peas, bell pepper', '4 cups'],
    ['soy fish sauce blend', '1/3 cup'],
    ['curry powder and white pepper', '2 tsp, 1 tsp'],
    ['cashews and cilantro', '1/2 cup'],
    ['Quick Meal', 'Family Dinner'],
  ),
  r(
    'Coconut Pumpkin Soup',
    'Thai',
    'soup',
    ['roasted pumpkin', '700g'],
    ['jasmine rice', '3 cups cooked'],
    ['onion and carrot', '2 cups'],
    ['coconut milk broth', '1.2L'],
    ['red curry paste and lime', '2 tbsp, 1 lime'],
    ['Thai basil and pumpkin seeds', '1/3 cup'],
    ['Vegetarian', 'Soup', 'Comfort Food'],
  ),

  r(
    'Ginger Scallion Chicken Rice',
    'Chinese',
    'bowl',
    ['poached chicken thighs', '600g'],
    ['jasmine rice', '4 cups cooked'],
    ['bok choy', '4 cups'],
    ['ginger scallion oil', '1/2 cup'],
    ['soy sauce and sesame oil', '2 tbsp each'],
    ['cilantro and cucumber', '1 cup'],
    ['High Protein', 'Family Dinner'],
  ),
  r(
    'Mapo Tofu with Mushrooms',
    'Chinese',
    'stirFry',
    ['firm tofu cubes', '500g'],
    ['steamed rice', '4 cups'],
    ['shiitake mushrooms and peas', '3 cups'],
    ['doubanjiang sauce', '1/3 cup'],
    ['Sichuan pepper and garlic', '1 tsp, 4 cloves'],
    ['scallions', '1/2 cup'],
    ['Spicy', 'Vegetarian', 'Comfort Food'],
  ),
  r(
    'Beef and Broccoli Stir Fry',
    'Chinese',
    'stirFry',
    ['flank steak slices', '500g'],
    ['steamed rice', '4 cups'],
    ['broccoli florets', '5 cups'],
    ['oyster soy sauce', '1/2 cup'],
    ['ginger, garlic, cornstarch', '1 tbsp, 4 cloves, 1 tbsp'],
    ['sesame seeds', '2 tbsp'],
    ['High Protein', 'Quick Meal'],
  ),
  r(
    'Tomato Egg Noodle Soup',
    'Chinese',
    'soup',
    ['eggs', '4'],
    ['wheat noodles', '350g'],
    ['ripe tomatoes and spinach', '5 cups'],
    ['chicken or vegetable broth', '1.4L'],
    ['white pepper and soy sauce', '1 tsp, 2 tbsp'],
    ['scallions and cilantro', '1/2 cup'],
    ['Quick Meal', 'Soup', 'Student-friendly'],
  ),
  r(
    'Char Siu Pork Bowls',
    'Chinese',
    'bowl',
    ['char siu pork slices', '500g'],
    ['jasmine rice', '4 cups cooked'],
    ['steamed gai lan', '4 cups'],
    ['hoisin honey glaze', '1/3 cup'],
    ['five spice and garlic', '1 tsp, 3 cloves'],
    ['sesame seeds and scallions', '1/3 cup'],
    ['Family Dinner', 'Meal Prep'],
  ),
  r(
    'Vegetable Chow Mein',
    'Chinese',
    'noodle',
    ['tofu strips', '350g'],
    ['chow mein noodles', '400g'],
    ['cabbage, carrot, snow peas', '5 cups'],
    ['soy oyster mushroom sauce', '1/2 cup'],
    ['garlic and white pepper', '4 cloves, 1 tsp'],
    ['scallions', '1/2 cup'],
    ['Vegetarian', 'Quick Meal'],
  ),
  r(
    'Sesame Cucumber Salad',
    'Chinese',
    'salad',
    ['soft tofu cubes', '300g'],
    ['crisp cucumbers', '4 large'],
    ['cilantro and scallions', '1 cup'],
    ['black vinegar sesame dressing', '1/3 cup'],
    ['garlic, chile crisp, sugar', '2 cloves, 1 tbsp, 1 tsp'],
    ['toasted sesame seeds', '2 tbsp'],
    ['Healthy', 'Quick Meal', 'Vegetarian'],
  ),
  r(
    'Pork Wonton Soup',
    'Chinese',
    'soup',
    ['pork wontons', '24 pieces'],
    ['egg noodles', '250g'],
    ['bok choy and mushrooms', '4 cups'],
    ['clear chicken broth', '1.6L'],
    ['ginger, soy sauce, white pepper', '1 tbsp, 2 tbsp, 1 tsp'],
    ['scallions and fried garlic', '1/3 cup'],
    ['Soup', 'Comfort Food'],
  ),

  r(
    'Butter Chicken Curry',
    'Indian',
    'curry',
    ['chicken thigh pieces', '650g'],
    ['basmati rice', '4 cups cooked'],
    ['tomato and onion puree', '3 cups'],
    ['cream and tomato sauce', '1 1/2 cups'],
    ['garam masala, cumin, paprika', '1 tbsp total'],
    ['cilantro and yogurt', '1/2 cup'],
    ['Comfort Food', 'Family Dinner'],
  ),
  r(
    'Chickpea Chana Masala',
    'Indian',
    'curry',
    ['cooked chickpeas', '3 cups'],
    ['basmati rice', '4 cups cooked'],
    ['tomatoes and onion', '4 cups'],
    ['spiced tomato gravy', '2 cups'],
    ['coriander, cumin, garam masala', '2 tbsp total'],
    ['cilantro and lemon', '1/2 cup'],
    ['Vegetarian', 'Healthy', 'Meal Prep'],
  ),
  r(
    'Palak Paneer Rice Bowl',
    'Indian',
    'bowl',
    ['paneer cubes', '400g'],
    ['basmati rice', '4 cups cooked'],
    ['spinach puree', '4 cups'],
    ['spiced cream sauce', '1 1/2 cups'],
    ['garlic, ginger, garam masala', '1 tbsp total'],
    ['cilantro and toasted cumin', '1/3 cup'],
    ['Vegetarian', 'Comfort Food'],
  ),
  r(
    'Masala Dosa Potato Plate',
    'Indian',
    'skillet',
    ['spiced potato filling', '500g'],
    ['dosa batter', '3 cups'],
    ['onion and curry leaves', '1 cup'],
    ['coconut chutney', '1/2 cup'],
    ['mustard seed, turmeric, chile', '2 tsp total'],
    ['cilantro', '1/3 cup'],
    ['Vegetarian', 'Street Food'],
  ),
  r(
    'Tandoori Cauliflower Bowls',
    'Indian',
    'grill',
    ['cauliflower florets', '700g'],
    ['brown rice', '4 cups cooked'],
    ['cucumber and tomato salad', '4 cups'],
    ['yogurt mint sauce', '1/2 cup'],
    ['tandoori spice and lemon', '2 tbsp, 1 lemon'],
    ['cilantro and pickled onion', '1/2 cup'],
    ['Vegetarian', 'Healthy', 'Meal Prep'],
  ),
  r(
    'Lentil Dal Tadka',
    'Indian',
    'soup',
    ['red lentils', '2 cups'],
    ['basmati rice', '4 cups cooked'],
    ['tomato, onion, and spinach', '4 cups'],
    ['vegetable broth', '1.5L'],
    ['turmeric, cumin, garam masala', '2 tbsp total'],
    ['cilantro and lemon', '1/2 cup'],
    ['Vegetarian', 'Soup', 'Meal Prep'],
  ),
  r(
    'Vegetable Biryani',
    'Indian',
    'bowl',
    ['mixed vegetables', '5 cups'],
    ['basmati rice', '3 cups dry'],
    ['onion, peas, and carrots', '4 cups'],
    ['saffron yogurt sauce', '1/2 cup'],
    ['biryani masala and cardamom', '2 tbsp, 4 pods'],
    ['fried onions and cilantro', '1/2 cup'],
    ['Vegetarian', 'Family Dinner'],
  ),
  r(
    'Mango Lassi',
    'Indian',
    'drink',
    ['ripe mango', '2 cups'],
    ['plain yogurt', '2 cups'],
    ['cardamom milk', '1 cup'],
    ['honey', '2 tbsp'],
    ['ground cardamom and salt', '1/2 tsp, 1 pinch'],
    ['pistachios', '2 tbsp'],
    ['Vegetarian', 'Quick Meal'],
  ),

  r(
    'Tomato Basil Spaghetti',
    'Italian',
    'noodle',
    ['spaghetti', '400g'],
    ['tomato passata', '3 cups'],
    ['cherry tomatoes and basil', '3 cups'],
    ['olive oil tomato sauce', '2 cups'],
    ['garlic, oregano, chile flakes', '1 tbsp total'],
    ['parmesan and basil', '1/2 cup'],
    ['Vegetarian', 'Family Dinner'],
  ),
  r(
    'Chicken Pesto Pasta',
    'Italian',
    'noodle',
    ['grilled chicken strips', '500g'],
    ['short pasta', '400g'],
    ['spinach and peas', '4 cups'],
    ['basil pesto', '2/3 cup'],
    ['garlic and lemon zest', '1 tbsp total'],
    ['parmesan and pine nuts', '1/2 cup'],
    ['High Protein', 'Quick Meal'],
  ),
  r(
    'Mushroom Risotto',
    'Italian',
    'bowl',
    ['mixed mushrooms', '500g'],
    ['arborio rice', '1 1/2 cups'],
    ['shallot and thyme', '1 cup'],
    ['warm vegetable stock', '1.2L'],
    ['white wine and parmesan', '1/2 cup each'],
    ['parsley and lemon zest', '1/3 cup'],
    ['Vegetarian', 'Comfort Food'],
  ),
  r(
    'Margherita Flatbread',
    'Italian',
    'bake',
    ['fresh mozzarella', '250g'],
    ['flatbread bases', '4'],
    ['tomatoes and basil', '3 cups'],
    ['marinara sauce', '1 cup'],
    ['olive oil and dried oregano', '2 tbsp, 1 tsp'],
    ['basil and parmesan', '1/2 cup'],
    ['Vegetarian', 'Quick Meal'],
  ),
  r(
    'Tuscan White Bean Soup',
    'Italian',
    'soup',
    ['cannellini beans', '3 cups'],
    ['crusty bread', '4 slices'],
    ['kale, carrot, celery', '5 cups'],
    ['vegetable broth', '1.5L'],
    ['rosemary, garlic, fennel seed', '1 tbsp total'],
    ['parmesan and parsley', '1/3 cup'],
    ['Vegetarian', 'Soup', 'Healthy'],
  ),
  r(
    'Lemon Shrimp Linguine',
    'Italian',
    'noodle',
    ['shrimp', '450g'],
    ['linguine', '400g'],
    ['zucchini and arugula', '4 cups'],
    ['lemon butter sauce', '1/2 cup'],
    ['garlic, chile flakes, black pepper', '1 tbsp total'],
    ['parsley and parmesan', '1/2 cup'],
    ['Seafood', 'Quick Meal'],
  ),
  r(
    'Caprese Farro Salad',
    'Italian',
    'salad',
    ['fresh mozzarella pearls', '250g'],
    ['cooked farro', '3 cups'],
    ['tomatoes, basil, cucumber', '5 cups'],
    ['balsamic vinaigrette', '1/2 cup'],
    ['garlic and black pepper', '1 tsp each'],
    ['toasted almonds', '1/3 cup'],
    ['Vegetarian', 'Meal Prep', 'Fresh'],
  ),
  r(
    'Tiramisu Overnight Cups',
    'Italian',
    'dessert',
    ['ladyfinger pieces', '150g'],
    ['mascarpone yogurt', '2 cups'],
    ['espresso', '1 cup'],
    ['maple syrup', '3 tbsp'],
    ['cocoa powder and vanilla', '2 tbsp, 1 tsp'],
    ['dark chocolate shavings', '1/4 cup'],
    ['Dessert', 'Meal Prep'],
  ),

  r(
    'Chicken Tinga Tacos',
    'Mexican',
    'skillet',
    ['shredded chicken', '500g'],
    ['corn tortillas', '12'],
    ['onion and cabbage', '3 cups'],
    ['chipotle tomato sauce', '1 1/2 cups'],
    ['cumin, oregano, smoked paprika', '1 tbsp total'],
    ['cilantro, lime, cotija', '1 cup'],
    ['Spicy', 'Street Food', 'Family Dinner'],
  ),
  r(
    'Beef Taco Rice Bowl',
    'Mexican',
    'bowl',
    ['ground beef', '500g'],
    ['cilantro lime rice', '4 cups'],
    ['corn, lettuce, tomato', '5 cups'],
    ['salsa roja', '1 cup'],
    ['taco seasoning', '2 tbsp'],
    ['avocado and cheese', '1 cup'],
    ['High Protein', 'Student-friendly'],
  ),
  r(
    'Black Bean Enchilada Bake',
    'Mexican',
    'bake',
    ['black beans', '3 cups'],
    ['corn tortillas', '12'],
    ['zucchini, corn, onion', '4 cups'],
    ['enchilada sauce', '2 cups'],
    ['cumin and chile powder', '2 tbsp total'],
    ['cheese and cilantro', '1 cup'],
    ['Vegetarian', 'Family Dinner'],
  ),
  r(
    'Shrimp Fajita Skillet',
    'Mexican',
    'stirFry',
    ['shrimp', '500g'],
    ['warm tortillas', '12'],
    ['bell peppers and onion', '5 cups'],
    ['lime crema', '1/2 cup'],
    ['fajita seasoning', '2 tbsp'],
    ['cilantro and avocado', '1 cup'],
    ['Seafood', 'Quick Meal'],
  ),
  r(
    'Pozole Verde Chicken Soup',
    'Mexican',
    'soup',
    ['shredded chicken', '500g'],
    ['hominy', '3 cups'],
    ['tomatillos and poblano', '4 cups'],
    ['green chile broth', '1.5L'],
    ['cumin, oregano, garlic', '1 tbsp total'],
    ['radish, cabbage, lime', '2 cups'],
    ['Soup', 'Family Dinner'],
  ),
  r(
    'Street Corn Salad',
    'Mexican',
    'salad',
    ['grilled corn kernels', '4 cups'],
    ['romaine lettuce', '4 cups'],
    ['red onion and jalapeno', '1 cup'],
    ['lime mayo dressing', '1/2 cup'],
    ['chile powder and smoked paprika', '2 tsp total'],
    ['cotija and cilantro', '1 cup'],
    ['Vegetarian', 'Quick Meal', 'Fresh'],
  ),
  r(
    'Sweet Potato Quesadillas',
    'Mexican',
    'skillet',
    ['roasted sweet potato', '500g'],
    ['flour tortillas', '8'],
    ['black beans and spinach', '3 cups'],
    ['chipotle yogurt sauce', '1/2 cup'],
    ['cumin and garlic powder', '2 tsp total'],
    ['cilantro and lime', '1/2 cup'],
    ['Vegetarian', 'Student-friendly'],
  ),
  r(
    'Cinnamon Horchata',
    'Mexican',
    'drink',
    ['long grain rice', '1 cup'],
    ['milk', '3 cups'],
    ['cinnamon sticks', '2'],
    ['vanilla sugar syrup', '1/3 cup'],
    ['ground cinnamon and salt', '1 tsp, 1 pinch'],
    ['toasted almonds', '2 tbsp'],
    ['Vegetarian', 'Dessert'],
  ),

  r(
    'Greek Chicken Souvlaki Bowls',
    'Mediterranean',
    'grill',
    ['chicken breast cubes', '600g'],
    ['warm pita or rice', '4 portions'],
    ['cucumber, tomato, red onion', '5 cups'],
    ['tzatziki sauce', '1 cup'],
    ['oregano, garlic, lemon zest', '1 tbsp total'],
    ['feta and parsley', '1 cup'],
    ['High Protein', 'Healthy', 'Meal Prep'],
  ),
  r(
    'Falafel Chickpea Salad',
    'Mediterranean',
    'salad',
    ['baked falafel', '16 pieces'],
    ['mixed greens', '5 cups'],
    ['cucumber, tomato, radish', '4 cups'],
    ['tahini lemon dressing', '1/2 cup'],
    ['cumin and coriander', '2 tsp total'],
    ['parsley and pickles', '1 cup'],
    ['Vegetarian', 'Healthy'],
  ),
  r(
    'Lemon Herb Salmon Couscous',
    'Mediterranean',
    'bowl',
    ['salmon fillets', '4 small'],
    ['couscous', '3 cups cooked'],
    ['zucchini and tomatoes', '4 cups'],
    ['lemon herb vinaigrette', '1/2 cup'],
    ['dill, oregano, garlic', '1 tbsp total'],
    ['feta and parsley', '1/2 cup'],
    ['Seafood', 'Healthy', 'High Protein'],
  ),
  r(
    'Turkish Lentil Soup',
    'Mediterranean',
    'soup',
    ['red lentils', '2 cups'],
    ['flatbread', '4 pieces'],
    ['carrot, onion, tomato', '4 cups'],
    ['vegetable broth', '1.6L'],
    ['cumin, paprika, dried mint', '1 tbsp total'],
    ['lemon and parsley', '1/2 cup'],
    ['Vegetarian', 'Soup', 'Meal Prep'],
  ),
  r(
    'Shakshuka Pepper Skillet',
    'Mediterranean',
    'skillet',
    ['eggs', '6'],
    ['crusty bread', '4 slices'],
    ['bell peppers and tomatoes', '5 cups'],
    ['spiced tomato sauce', '2 cups'],
    ['cumin, paprika, harissa', '1 tbsp total'],
    ['feta and cilantro', '1 cup'],
    ['Vegetarian', 'Breakfast'],
  ),
  r(
    'Lamb Kofta Pita Plates',
    'Mediterranean',
    'grill',
    ['ground lamb kofta', '600g'],
    ['pita bread', '4'],
    ['cucumber tomato salad', '4 cups'],
    ['garlic yogurt sauce', '1 cup'],
    ['cumin, allspice, coriander', '1 tbsp total'],
    ['mint and parsley', '1 cup'],
    ['High Protein', 'Family Dinner'],
  ),
  r(
    'Roasted Vegetable Hummus Bowl',
    'Mediterranean',
    'bowl',
    ['hummus', '2 cups'],
    ['quinoa', '3 cups cooked'],
    ['eggplant, pepper, zucchini', '5 cups'],
    ['lemon tahini sauce', '1/2 cup'],
    ['zaatar and garlic', '1 tbsp, 3 cloves'],
    ['parsley and pine nuts', '1/2 cup'],
    ['Vegetarian', 'Healthy', 'Meal Prep'],
  ),
  r(
    'Baklava Yogurt Parfaits',
    'Mediterranean',
    'dessert',
    ['Greek yogurt', '2 cups'],
    ['crushed phyllo crisps', '1 cup'],
    ['honeyed walnuts', '1 cup'],
    ['orange honey syrup', '1/3 cup'],
    ['cinnamon and cardamom', '1 tsp total'],
    ['pistachios', '1/3 cup'],
    ['Dessert', 'Quick Meal'],
  ),

  r(
    'Turkey Meatball Pasta',
    'American',
    'noodle',
    ['turkey meatballs', '20 small'],
    ['penne pasta', '400g'],
    ['spinach and bell pepper', '4 cups'],
    ['marinara sauce', '2 cups'],
    ['Italian seasoning and garlic', '1 tbsp, 3 cloves'],
    ['parmesan and parsley', '1/2 cup'],
    ['High Protein', 'Family Dinner'],
  ),
  r(
    'BBQ Chicken Sheet Pan',
    'American',
    'bake',
    ['chicken drumsticks', '8'],
    ['baby potatoes', '700g'],
    ['green beans and onion', '5 cups'],
    ['barbecue sauce', '3/4 cup'],
    ['smoked paprika and garlic powder', '2 tsp each'],
    ['scallions', '1/3 cup'],
    ['Family Dinner', 'Meal Prep'],
  ),
  r(
    'Classic Beef Burger Bowl',
    'American',
    'bowl',
    ['lean ground beef patties', '500g'],
    ['roasted potato wedges', '700g'],
    ['lettuce, tomato, pickles', '5 cups'],
    ['burger sauce', '1/2 cup'],
    ['mustard powder and black pepper', '2 tsp total'],
    ['cheddar and sesame seeds', '1 cup'],
    ['High Protein', 'Student-friendly'],
  ),
  r(
    'Creamy Corn Chowder',
    'American',
    'soup',
    ['sweet corn kernels', '5 cups'],
    ['diced potatoes', '500g'],
    ['celery, onion, carrot', '4 cups'],
    ['milk and stock', '1.5L'],
    ['thyme and smoked paprika', '2 tsp total'],
    ['chives and cheddar', '1/2 cup'],
    ['Vegetarian', 'Soup', 'Comfort Food'],
  ),
  r(
    'Buffalo Cauliflower Wraps',
    'American',
    'skillet',
    ['cauliflower florets', '700g'],
    ['whole wheat tortillas', '8'],
    ['romaine and celery', '4 cups'],
    ['buffalo yogurt sauce', '1/2 cup'],
    ['garlic powder and paprika', '2 tsp total'],
    ['blue cheese and scallions', '1/2 cup'],
    ['Vegetarian', 'Spicy', 'Student-friendly'],
  ),
  r(
    'Apple Cinnamon Oat Bake',
    'American',
    'bake',
    ['rolled oats', '3 cups'],
    ['milk', '2 1/2 cups'],
    ['apples and raisins', '4 cups'],
    ['maple syrup', '1/3 cup'],
    ['cinnamon and vanilla', '2 tsp, 1 tsp'],
    ['walnuts', '1/2 cup'],
    ['Breakfast', 'Meal Prep', 'Vegetarian'],
  ),
  r(
    'Ranch Chicken Salad',
    'American',
    'salad',
    ['grilled chicken breast', '500g'],
    ['romaine lettuce', '6 cups'],
    ['corn, tomato, cucumber', '4 cups'],
    ['ranch yogurt dressing', '1/2 cup'],
    ['dill, garlic, black pepper', '1 tbsp total'],
    ['cheddar and croutons', '1 cup'],
    ['High Protein', 'Quick Meal'],
  ),
  r(
    'Chocolate Chip Skillet Cookie',
    'American',
    'dessert',
    ['chocolate chips', '1 cup'],
    ['all purpose flour', '1 1/2 cups'],
    ['brown sugar and butter', '1 cup each'],
    ['vanilla egg mixture', '2 eggs'],
    ['baking soda and salt', '1 tsp, 1/2 tsp'],
    ['vanilla ice cream', 'for serving'],
    ['Dessert', 'Family Dinner'],
  ),

  r(
    'Tofu Quinoa Power Bowl',
    'Vegetarian',
    'bowl',
    ['extra firm tofu cubes', '500g'],
    ['quinoa', '3 cups cooked'],
    ['broccoli, carrot, cabbage', '5 cups'],
    ['sesame tahini sauce', '1/2 cup'],
    ['soy sauce and smoked paprika', '2 tbsp, 1 tsp'],
    ['pumpkin seeds and herbs', '1/2 cup'],
    ['Vegetarian', 'Healthy', 'Meal Prep'],
  ),
  r(
    'Lentil Mushroom Shepherd Pie',
    'Vegetarian',
    'bake',
    ['cooked lentils', '3 cups'],
    ['mashed potatoes', '4 cups'],
    ['mushrooms, peas, carrots', '5 cups'],
    ['tomato vegetable gravy', '2 cups'],
    ['thyme, rosemary, garlic', '1 tbsp total'],
    ['parsley', '1/3 cup'],
    ['Vegetarian', 'Comfort Food', 'Family Dinner'],
  ),
  r(
    'Chickpea Spinach Curry',
    'Vegetarian',
    'curry',
    ['cooked chickpeas', '3 cups'],
    ['basmati rice', '4 cups cooked'],
    ['spinach and tomato', '5 cups'],
    ['coconut tomato sauce', '2 cups'],
    ['curry powder, cumin, ginger', '2 tbsp total'],
    ['cilantro and lime', '1/2 cup'],
    ['Vegetarian', 'Meal Prep'],
  ),
  r(
    'Roasted Cauliflower Tacos',
    'Vegetarian',
    'skillet',
    ['roasted cauliflower', '700g'],
    ['corn tortillas', '12'],
    ['cabbage slaw', '4 cups'],
    ['avocado crema', '1/2 cup'],
    ['chile powder and cumin', '2 tbsp total'],
    ['cilantro and pickled onion', '1 cup'],
    ['Vegetarian', 'Street Food'],
  ),
  r(
    'Sweet Potato Black Bean Chili',
    'Vegetarian',
    'soup',
    ['black beans', '3 cups'],
    ['sweet potato cubes', '600g'],
    ['tomato, onion, bell pepper', '5 cups'],
    ['vegetable broth', '1.5L'],
    ['chile powder, cumin, cocoa', '2 tbsp total'],
    ['avocado and cilantro', '1 cup'],
    ['Vegetarian', 'Soup', 'Meal Prep'],
  ),
  r(
    'Pesto White Bean Toast',
    'Vegetarian',
    'sandwich',
    ['white beans', '2 cups'],
    ['sourdough slices', '8'],
    ['arugula and cherry tomato', '4 cups'],
    ['basil pesto', '1/2 cup'],
    ['lemon zest and black pepper', '2 tsp total'],
    ['parmesan and basil', '1/2 cup'],
    ['Vegetarian', 'Quick Meal'],
  ),
  r(
    'Zucchini Noodle Primavera',
    'Vegetarian',
    'stirFry',
    ['zucchini noodles', '700g'],
    ['white beans', '2 cups'],
    ['peas, tomato, bell pepper', '4 cups'],
    ['lemon garlic sauce', '1/3 cup'],
    ['Italian herbs and chile flakes', '2 tsp total'],
    ['parmesan and parsley', '1/2 cup'],
    ['Vegetarian', 'Low Carb', 'Quick Meal'],
  ),
  r(
    'Sesame Edamame Rice Bowl',
    'Vegetarian',
    'bowl',
    ['shelled edamame', '2 cups'],
    ['brown rice', '4 cups cooked'],
    ['cucumber, carrot, cabbage', '5 cups'],
    ['miso sesame dressing', '1/2 cup'],
    ['ginger and rice vinegar', '1 tbsp each'],
    ['nori and sesame seeds', '1/3 cup'],
    ['Vegetarian', 'Healthy', 'Meal Prep'],
  ),

  r(
    'Garlic Butter Shrimp Rice',
    'Seafood',
    'bowl',
    ['shrimp', '500g'],
    ['jasmine rice', '4 cups cooked'],
    ['peas and asparagus', '4 cups'],
    ['garlic butter sauce', '1/2 cup'],
    ['lemon zest and paprika', '2 tsp total'],
    ['parsley and lemon', '1/2 cup'],
    ['Seafood', 'Quick Meal', 'High Protein'],
  ),
  r(
    'Coconut Fish Curry',
    'Seafood',
    'curry',
    ['white fish chunks', '600g'],
    ['jasmine rice', '4 cups cooked'],
    ['eggplant, tomato, spinach', '5 cups'],
    ['coconut curry sauce', '2 cups'],
    ['curry paste and fish sauce', '2 tbsp, 1 tbsp'],
    ['cilantro and lime', '1/2 cup'],
    ['Seafood', 'Family Dinner'],
  ),
  r(
    'Tuna Poke Bowl',
    'Seafood',
    'bowl',
    ['sushi grade tuna cubes', '450g'],
    ['sushi rice', '4 cups cooked'],
    ['avocado, cucumber, edamame', '5 cups'],
    ['soy sesame poke sauce', '1/2 cup'],
    ['ginger and rice vinegar', '1 tbsp each'],
    ['nori, sesame, scallions', '1/2 cup'],
    ['Seafood', 'Healthy', 'Quick Meal'],
  ),
  r(
    'Lemon Dill Cod Bake',
    'Seafood',
    'bake',
    ['cod fillets', '4'],
    ['baby potatoes', '700g'],
    ['green beans and fennel', '5 cups'],
    ['lemon dill butter', '1/2 cup'],
    ['garlic and black pepper', '1 tbsp total'],
    ['parsley and capers', '1/2 cup'],
    ['Seafood', 'Healthy', 'Family Dinner'],
  ),
  r(
    'Crab Corn Fritters',
    'Seafood',
    'skillet',
    ['lump crab meat', '350g'],
    ['cornmeal batter', '2 cups'],
    ['corn kernels and scallions', '2 cups'],
    ['lemon yogurt sauce', '1/2 cup'],
    ['Old Bay seasoning and pepper', '2 tsp total'],
    ['parsley and lemon', '1/2 cup'],
    ['Seafood', 'Student-friendly'],
  ),
  r(
    'Mussel Tomato Stew',
    'Seafood',
    'soup',
    ['cleaned mussels', '1kg'],
    ['crusty bread', '4 slices'],
    ['tomato, fennel, onion', '5 cups'],
    ['white wine tomato broth', '1.5L'],
    ['garlic, thyme, chile flakes', '1 tbsp total'],
    ['parsley and lemon', '1/2 cup'],
    ['Seafood', 'Soup', 'Family Dinner'],
  ),
  r(
    'Salmon Sushi Bake',
    'Seafood',
    'bake',
    ['flaked salmon', '500g'],
    ['sushi rice', '4 cups cooked'],
    ['cucumber and avocado', '4 cups'],
    ['spicy mayo', '1/2 cup'],
    ['furikake and rice vinegar', '2 tbsp each'],
    ['nori sheets and scallions', '8 sheets'],
    ['Seafood', 'Comfort Food'],
  ),
  r(
    'Scallop Pea Risotto',
    'Seafood',
    'bowl',
    ['sea scallops', '500g'],
    ['arborio rice', '1 1/2 cups'],
    ['peas and asparagus', '4 cups'],
    ['warm seafood stock', '1.2L'],
    ['white wine, lemon, parmesan', '1/2 cup, 1 lemon, 1/2 cup'],
    ['chives and parsley', '1/3 cup'],
    ['Seafood', 'Family Dinner'],
  ),

  r(
    'Spinach Feta Egg Muffins',
    'Breakfast',
    'bake',
    ['eggs', '10'],
    ['feta cheese', '1 cup'],
    ['spinach and bell pepper', '4 cups'],
    ['milk', '1/2 cup'],
    ['garlic powder and black pepper', '2 tsp total'],
    ['chives', '1/3 cup'],
    ['Breakfast', 'Meal Prep', 'Vegetarian'],
  ),
  r(
    'Banana Oat Pancakes',
    'Breakfast',
    'skillet',
    ['ripe bananas', '3'],
    ['rolled oats', '2 cups'],
    ['eggs', '3'],
    ['maple yogurt sauce', '1/2 cup'],
    ['cinnamon and baking powder', '2 tsp total'],
    ['berries and walnuts', '1 cup'],
    ['Breakfast', 'Vegetarian', 'Student-friendly'],
  ),
  r(
    'Savory Breakfast Burrito',
    'Breakfast',
    'skillet',
    ['scrambled eggs', '8 eggs'],
    ['large tortillas', '4'],
    ['potato, pepper, onion', '4 cups'],
    ['salsa verde', '1/2 cup'],
    ['cumin and smoked paprika', '2 tsp total'],
    ['cheese and cilantro', '1 cup'],
    ['Breakfast', 'Student-friendly'],
  ),
  r(
    'Berry Yogurt Parfait',
    'Breakfast',
    'dessert',
    ['Greek yogurt', '2 cups'],
    ['granola', '2 cups'],
    ['mixed berries', '3 cups'],
    ['honey', '1/4 cup'],
    ['vanilla and lemon zest', '1 tsp each'],
    ['chia seeds and mint', '1/4 cup'],
    ['Breakfast', 'Quick Meal', 'Vegetarian'],
  ),
  r(
    'Avocado Egg Toast',
    'Breakfast',
    'skillet',
    ['eggs', '4'],
    ['whole grain toast', '4 slices'],
    ['avocado and tomato', '3 cups'],
    ['lemon herb spread', '1/3 cup'],
    ['chile flakes and black pepper', '1 tsp each'],
    ['microgreens', '1 cup'],
    ['Breakfast', 'Quick Meal', 'Vegetarian'],
  ),
  r(
    'Smoked Salmon Bagel Plate',
    'Breakfast',
    'sandwich',
    ['smoked salmon', '250g'],
    ['bagels', '4'],
    ['cucumber, tomato, red onion', '4 cups'],
    ['dill cream cheese', '1 cup'],
    ['capers and black pepper', '2 tbsp, 1 tsp'],
    ['fresh dill and lemon', '1/3 cup'],
    ['Breakfast', 'Seafood', 'Quick Meal'],
  ),
  r(
    'Apple Peanut Butter Overnight Oats',
    'Breakfast',
    'dessert',
    ['rolled oats', '2 cups'],
    ['milk', '2 cups'],
    ['diced apples', '2 cups'],
    ['peanut butter maple sauce', '1/2 cup'],
    ['cinnamon and vanilla', '2 tsp, 1 tsp'],
    ['pumpkin seeds', '1/3 cup'],
    ['Breakfast', 'Meal Prep', 'Vegetarian'],
  ),
  r(
    'Breakfast Fried Rice',
    'Breakfast',
    'stirFry',
    ['eggs and turkey bacon', '4 eggs, 200g'],
    ['day-old rice', '4 cups'],
    ['peas, carrot, spinach', '4 cups'],
    ['soy breakfast sauce', '1/3 cup'],
    ['garlic and white pepper', '1 tbsp total'],
    ['scallions and sesame seeds', '1/3 cup'],
    ['Breakfast', 'Quick Meal'],
  ),

  r(
    'Dark Chocolate Brownies',
    'Dessert',
    'bake',
    ['dark chocolate', '200g'],
    ['all purpose flour', '1 cup'],
    ['eggs and butter', '3 eggs, 170g'],
    ['cocoa sugar mixture', '1 1/2 cups'],
    ['vanilla and espresso powder', '1 tsp each'],
    ['flaky salt', '1 tsp'],
    ['Dessert', 'Family Dinner'],
  ),
  r(
    'Lemon Blueberry Cheesecake Cups',
    'Dessert',
    'dessert',
    ['cream cheese', '450g'],
    ['graham crumbs', '1 1/2 cups'],
    ['blueberries', '2 cups'],
    ['lemon honey syrup', '1/3 cup'],
    ['vanilla and lemon zest', '1 tsp each'],
    ['mint and extra berries', '1/2 cup'],
    ['Dessert', 'Meal Prep'],
  ),
  r(
    'Coconut Mango Sago',
    'Dessert',
    'dessert',
    ['small tapioca pearls', '1 cup'],
    ['coconut milk', '2 cups'],
    ['ripe mango cubes', '3 cups'],
    ['palm sugar syrup', '1/3 cup'],
    ['pandan and salt', '1 leaf, 1 pinch'],
    ['toasted coconut', '1/3 cup'],
    ['Dessert', 'Vegetarian'],
  ),
  r(
    'Strawberry Shortcake Jars',
    'Dessert',
    'dessert',
    ['strawberries', '3 cups'],
    ['pound cake cubes', '3 cups'],
    ['whipped cream', '2 cups'],
    ['vanilla syrup', '1/4 cup'],
    ['lemon zest and salt', '1 tsp, 1 pinch'],
    ['mint leaves', '1/3 cup'],
    ['Dessert', 'Quick Meal'],
  ),
  r(
    'Banana Bread Loaf',
    'Dessert',
    'bake',
    ['ripe bananas', '4'],
    ['all purpose flour', '2 cups'],
    ['eggs and butter', '2 eggs, 115g'],
    ['brown sugar', '3/4 cup'],
    ['cinnamon and baking soda', '2 tsp total'],
    ['walnuts', '1/2 cup'],
    ['Dessert', 'Breakfast'],
  ),
  r(
    'Peanut Butter Energy Bites',
    'Dessert',
    'dessert',
    ['peanut butter', '1 cup'],
    ['rolled oats', '2 cups'],
    ['mini chocolate chips', '1/2 cup'],
    ['honey', '1/3 cup'],
    ['vanilla and cinnamon', '1 tsp each'],
    ['chia seeds', '2 tbsp'],
    ['Dessert', 'Meal Prep', 'Student-friendly'],
  ),
  r(
    'Vietnamese Coffee Flan',
    'Dessert',
    'dessert',
    ['eggs', '5'],
    ['condensed milk', '1 can'],
    ['strong coffee', '1/2 cup'],
    ['caramel syrup', '1/2 cup'],
    ['vanilla and salt', '1 tsp, 1 pinch'],
    ['coffee whipped cream', '1 cup'],
    ['Dessert', 'Family Dinner'],
  ),
  r(
    'Cinnamon Baked Apples',
    'Dessert',
    'bake',
    ['firm apples', '6'],
    ['rolled oats', '1 cup'],
    ['raisins and walnuts', '1 cup'],
    ['maple butter sauce', '1/2 cup'],
    ['cinnamon and nutmeg', '2 tsp total'],
    ['yogurt or ice cream', 'for serving'],
    ['Dessert', 'Vegetarian'],
  ),

  r(
    'Honey Kumquat Iced Tea',
    'Drinks',
    'drink',
    ['black tea bags', '4'],
    ['cold water', '4 cups'],
    ['kumquat juice', '1/2 cup'],
    ['honey syrup', '1/3 cup'],
    ['pinch of salt', '1 pinch'],
    ['kumquat slices and mint', '1/2 cup'],
    ['Drinks', 'Quick Meal'],
  ),
  r(
    'Cucumber Mint Limeade',
    'Drinks',
    'drink',
    ['cucumber', '2 large'],
    ['sparkling water', '4 cups'],
    ['lime juice', '1/2 cup'],
    ['simple syrup', '1/3 cup'],
    ['mint and salt', '1 cup, 1 pinch'],
    ['lime wheels', '8'],
    ['Drinks', 'Healthy'],
  ),
  r(
    'Matcha Oat Latte',
    'Drinks',
    'drink',
    ['matcha powder', '2 tbsp'],
    ['oat milk', '4 cups'],
    ['hot water', '1/2 cup'],
    ['maple syrup', '3 tbsp'],
    ['vanilla and salt', '1 tsp, 1 pinch'],
    ['cinnamon dust', '1 tsp'],
    ['Drinks', 'Vegetarian'],
  ),
  r(
    'Vietnamese Iced Coffee',
    'Drinks',
    'drink',
    ['strong brewed coffee', '2 cups'],
    ['crushed ice', '4 cups'],
    ['condensed milk', '1/2 cup'],
    ['coffee syrup', '2 tbsp'],
    ['vanilla and salt', '1 tsp, 1 pinch'],
    ['cocoa dust', '1 tsp'],
    ['Drinks', 'Dessert'],
  ),
  r(
    'Watermelon Basil Cooler',
    'Drinks',
    'drink',
    ['watermelon cubes', '5 cups'],
    ['cold water', '2 cups'],
    ['lime juice', '1/3 cup'],
    ['agave syrup', '3 tbsp'],
    ['basil and salt', '1 cup, 1 pinch'],
    ['watermelon wedges', '4'],
    ['Drinks', 'Healthy'],
  ),
  r(
    'Ginger Turmeric Tea',
    'Drinks',
    'drink',
    ['fresh ginger slices', '1/2 cup'],
    ['hot water', '4 cups'],
    ['lemon juice', '1/4 cup'],
    ['honey', '1/4 cup'],
    ['turmeric and black pepper', '1 tsp, 1 pinch'],
    ['lemon wheels', '4'],
    ['Drinks', 'Healthy'],
  ),
  r(
    'Strawberry Yogurt Smoothie',
    'Drinks',
    'drink',
    ['strawberries', '3 cups'],
    ['plain yogurt', '2 cups'],
    ['banana', '1 large'],
    ['honey', '2 tbsp'],
    ['vanilla and salt', '1 tsp, 1 pinch'],
    ['granola crumbs', '1/4 cup'],
    ['Drinks', 'Breakfast'],
  ),
  r(
    'Pineapple Coconut Refresher',
    'Drinks',
    'drink',
    ['pineapple chunks', '3 cups'],
    ['coconut water', '4 cups'],
    ['lime juice', '1/4 cup'],
    ['ginger syrup', '3 tbsp'],
    ['mint and salt', '1 cup, 1 pinch'],
    ['toasted coconut', '2 tbsp'],
    ['Drinks', 'Quick Meal'],
  ),

  r(
    'Sheet Pan Chicken and Vegetables',
    'Meal Prep',
    'bake',
    ['chicken breast pieces', '700g'],
    ['baby potatoes', '700g'],
    ['broccoli, carrot, pepper', '6 cups'],
    ['lemon herb marinade', '1/2 cup'],
    ['garlic powder and oregano', '2 tsp each'],
    ['parsley and lemon', '1/2 cup'],
    ['Meal Prep', 'High Protein', 'Family Dinner'],
  ),
  r(
    'Turkey Quinoa Stuffed Peppers',
    'Meal Prep',
    'bake',
    ['ground turkey', '600g'],
    ['quinoa', '3 cups cooked'],
    ['bell peppers', '6 large'],
    ['tomato salsa sauce', '2 cups'],
    ['cumin and smoked paprika', '2 tsp each'],
    ['cheese and cilantro', '1 cup'],
    ['Meal Prep', 'High Protein'],
  ),
  r(
    'Garlic Tofu Rice Boxes',
    'Meal Prep',
    'bowl',
    ['extra firm tofu', '600g'],
    ['brown rice', '4 cups cooked'],
    ['green beans and carrots', '5 cups'],
    ['garlic soy glaze', '1/2 cup'],
    ['ginger and sesame oil', '1 tbsp each'],
    ['sesame seeds and scallions', '1/3 cup'],
    ['Meal Prep', 'Vegetarian', 'Healthy'],
  ),
  r(
    'Beef Burrito Freezer Bowls',
    'Meal Prep',
    'bowl',
    ['seasoned ground beef', '600g'],
    ['cilantro lime rice', '4 cups'],
    ['black beans, corn, peppers', '5 cups'],
    ['tomato salsa', '1 cup'],
    ['taco seasoning', '2 tbsp'],
    ['cheese and cilantro', '1 cup'],
    ['Meal Prep', 'High Protein', 'Student-friendly'],
  ),
  r(
    'Greek Pasta Salad Boxes',
    'Meal Prep',
    'salad',
    ['chickpeas', '3 cups'],
    ['short pasta', '400g cooked'],
    ['cucumber, tomato, olives', '5 cups'],
    ['Greek vinaigrette', '1/2 cup'],
    ['oregano and black pepper', '2 tsp total'],
    ['feta and parsley', '1 cup'],
    ['Meal Prep', 'Vegetarian', 'Fresh'],
  ),
  r(
    'Lentil Soup Batch Pot',
    'Meal Prep',
    'soup',
    ['brown lentils', '2 cups'],
    ['diced potatoes', '500g'],
    ['carrot, celery, onion', '5 cups'],
    ['vegetable broth', '1.8L'],
    ['bay leaf, thyme, garlic', '1 tbsp total'],
    ['parsley and lemon', '1/2 cup'],
    ['Meal Prep', 'Vegetarian', 'Soup'],
  ),
  r(
    'Teriyaki Salmon Lunch Boxes',
    'Meal Prep',
    'bowl',
    ['salmon fillets', '4'],
    ['jasmine rice', '4 cups cooked'],
    ['broccoli and snap peas', '5 cups'],
    ['teriyaki glaze', '1/2 cup'],
    ['ginger and garlic', '1 tbsp each'],
    ['sesame seeds and scallions', '1/3 cup'],
    ['Meal Prep', 'Seafood', 'High Protein'],
  ),
  r(
    'Chickpea Couscous Jars',
    'Meal Prep',
    'salad',
    ['chickpeas', '3 cups'],
    ['couscous', '3 cups cooked'],
    ['cucumber, tomato, spinach', '5 cups'],
    ['lemon tahini dressing', '1/2 cup'],
    ['cumin and sumac', '2 tsp total'],
    ['parsley and pumpkin seeds', '1/2 cup'],
    ['Meal Prep', 'Vegetarian', 'Healthy'],
  ),
]

function hashText(text) {
  return [...text].reduce((total, character) => total + character.charCodeAt(0), 0)
}

export function nutritionFor(recipe) {
  const base = nutritionByStyle[recipe.style] || nutritionByStyle.bowl
  const hash = hashText(recipe.title)

  return {
    calories: Math.max(80, base.calories + (hash % 7) * 25),
    protein: Math.max(0, base.protein + (hash % 5) - 2),
    carbs: Math.max(0, base.carbs + (Math.floor(hash / 5) % 9) - 4),
    fat: Math.max(0, base.fat + (Math.floor(hash / 17) % 7) - 3),
  }
}

function dedupeIngredients(ingredients) {
  const seen = new Set()
  return ingredients.filter((ingredient) => {
    const key = ingredient.name.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function ingredientsFor(recipe) {
  const pantry = (pantryByStyle[recipe.style] || []).map(item)
  return dedupeIngredients([
    recipe.primary,
    recipe.base,
    recipe.produce,
    recipe.sauce,
    recipe.seasoning,
    recipe.garnish,
    ...recipe.extras,
    ...pantry,
  ])
}

function numbered(steps) {
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
}

export function buildInstructions(recipe) {
  const builder = instructionBuilders[recipe.style] || instructionBuilders.bowl
  const sections = builder(recipe)

  return [
    `Preparation:\n${numbered(sections.preparation)}`,
    `Cooking:\n${numbered(sections.cooking)}`,
    `Serving and storage:\n${numbered(sections.serving)}`,
  ].join('\n\n')
}

const instructionBuilders = {
  soup: (recipe) => ({
    preparation: [
      `Rinse and drain ${recipe.base.name}. If it needs cooking, prepare it until just tender, rinse briefly, and keep it separate so it will not turn mushy in the bowl.`,
      `Trim ${recipe.primary.name} into even pieces. Pat it dry, season lightly with ${recipe.seasoning.name}, and keep it chilled while the broth develops flavor.`,
      `Cut ${recipe.produce.name} into bite-size pieces. Measure ${recipe.sauce.name}, then arrange ${recipe.garnish.name} on a small plate for finishing.`,
    ],
    cooking: [
      `Warm a heavy pot over medium heat. Add the aromatics and ${recipe.seasoning.name}; toast for 1 to 2 minutes until fragrant without letting them burn.`,
      `Pour in ${recipe.sauce.name} and enough stock or water to cover the soup base. Simmer gently for 15 to 25 minutes, skimming the surface if needed.`,
      `Add ${recipe.primary.name} and ${recipe.produce.name}. Cook just until the protein is done and the vegetables are tender but still bright, then taste and adjust salt, acidity, or heat.`,
    ],
    serving: [
      `Place ${recipe.base.name} in warm bowls, ladle the hot soup over the top, and finish with ${recipe.garnish.name}.`,
      `Serve immediately while the broth is clear and hot. Store broth, base, and garnish separately for up to 3 days so the texture stays fresh.`,
    ],
  }),
  stirFry: (recipe) => ({
    preparation: [
      `Cut ${recipe.primary.name} into small even pieces so they cook quickly. Pat dry and season with half of ${recipe.seasoning.name}.`,
      `Prepare ${recipe.base.name} before turning on the pan. Day-old rice or cooled noodles work best because they absorb sauce without clumping.`,
      `Slice ${recipe.produce.name} thinly. Stir ${recipe.sauce.name} with the remaining ${recipe.seasoning.name} and keep ${recipe.garnish.name} ready at the stove.`,
    ],
    cooking: [
      `Heat a wok or wide skillet over high heat until a drop of water sizzles. Add oil, then sear ${recipe.primary.name} until browned and nearly cooked through.`,
      `Add ${recipe.produce.name} and stir constantly for 2 to 4 minutes. Keep the food moving so the vegetables stay crisp at the edges.`,
      `Add ${recipe.base.name} and pour ${recipe.sauce.name} around the sides of the pan. Toss until the sauce coats everything and the base is hot.`,
    ],
    serving: [
      `Turn off the heat, fold in ${recipe.garnish.name}, and rest for 2 minutes before serving.`,
      `For meal prep, cool the stir-fry on a tray before packing it so steam does not make the rice or noodles soggy.`,
    ],
  }),
  bowl: (recipe) => ({
    preparation: [
      `Cook or warm ${recipe.base.name} first, then spread it slightly so excess steam escapes and the grains stay separate.`,
      `Season ${recipe.primary.name} with ${recipe.seasoning.name}. Cut ${recipe.produce.name} into similar-size pieces for even cooking and easy eating.`,
      `Whisk ${recipe.sauce.name} until smooth. Taste it before cooking; it should be slightly stronger than you want because the bowl base will soften the flavor.`,
    ],
    cooking: [
      `Cook ${recipe.primary.name} in a hot skillet with a thin film of oil until browned and cooked through. Move it to a plate to rest.`,
      `In the same pan, cook ${recipe.produce.name} until tender-crisp, scraping up any browned bits to build flavor.`,
      `Return ${recipe.primary.name} to the pan with a spoonful of ${recipe.sauce.name}. Toss briefly so the coating is glossy, not watery.`,
    ],
    serving: [
      `Divide ${recipe.base.name} into bowls, add the cooked components, spoon over extra ${recipe.sauce.name}, and top with ${recipe.garnish.name}.`,
      `Pack the sauce separately if storing. The bowl keeps for 3 to 4 days refrigerated and reheats best with a splash of water.`,
    ],
  }),
  braise: (recipe) => ({
    preparation: [
      `Cut ${recipe.primary.name} into sturdy portions and dry them well. Season on all sides with ${recipe.seasoning.name}.`,
      `Prepare ${recipe.produce.name} and ${recipe.base.name} before searing because the braise moves slowly once the pan is hot.`,
      `Measure ${recipe.sauce.name} and keep warm water or stock nearby so the pan can be deglazed cleanly.`,
    ],
    cooking: [
      `Sear ${recipe.primary.name} in a heavy pot until browned on several sides. Work in batches if needed so the meat does not steam.`,
      `Add ${recipe.produce.name}, cook until aromatic, then pour in ${recipe.sauce.name}. Scrape the bottom of the pot to dissolve the browned bits.`,
      `Cover and simmer gently until the protein is tender and the sauce is rich. If the liquid reduces too quickly, add a splash of water and lower the heat.`,
    ],
    serving: [
      `Rest the braise for 10 minutes, skim excess fat, and finish with ${recipe.garnish.name}.`,
      `Serve with ${recipe.base.name}. Braises improve overnight, so cool completely before refrigerating and reheat gently.`,
    ],
  }),
  noodle: (recipe) => ({
    preparation: [
      `Cook ${recipe.base.name} until just shy of tender. Reserve some cooking water, then rinse or oil the noodles if the style needs separation.`,
      `Prepare ${recipe.primary.name} and ${recipe.produce.name} in bite-size pieces. Keep the vegetables dry so the sauce will cling.`,
      `Whisk ${recipe.sauce.name} with ${recipe.seasoning.name}. Set ${recipe.garnish.name} near the serving bowls.`,
    ],
    cooking: [
      `Sear or saute ${recipe.primary.name} until cooked through. Remove it briefly if it will overcook while the vegetables soften.`,
      `Cook ${recipe.produce.name} until bright and tender. Add the noodles and toss with tongs to loosen every strand.`,
      `Pour in ${recipe.sauce.name}, adding reserved noodle water a spoonful at a time until the sauce coats the noodles evenly.`,
    ],
    serving: [
      `Return ${recipe.primary.name} to the pan, toss once more, and finish with ${recipe.garnish.name}.`,
      `Serve hot or warm. If storing, undercook the noodles slightly and refresh with a splash of water when reheating.`,
    ],
  }),
  sandwich: (recipe) => ({
    preparation: [
      `Prepare ${recipe.primary.name} first and keep it warm. Toast or warm ${recipe.base.name} so it can hold the filling without becoming soggy.`,
      `Slice ${recipe.produce.name} thinly and pat wet ingredients dry. This keeps every bite crisp and prevents the sauce from watering down.`,
      `Mix ${recipe.sauce.name} with ${recipe.seasoning.name}. Taste for salt, heat, and acidity before assembling.`,
    ],
    cooking: [
      `Heat a skillet and crisp or warm ${recipe.primary.name} until the edges are browned.`,
      `Brush the inside of ${recipe.base.name} with a thin layer of ${recipe.sauce.name}, then layer in ${recipe.produce.name}.`,
      `Add the warm filling and press gently so the sandwich holds together without crushing the bread.`,
    ],
    serving: [
      `Finish with ${recipe.garnish.name}. Slice and serve while the bread is still warm and crisp.`,
      `For packed lunches, keep the sauce separate and assemble close to eating time.`,
    ],
  }),
  curry: (recipe) => ({
    preparation: [
      `Cut ${recipe.primary.name} and ${recipe.produce.name} into similar-size pieces so they finish cooking together.`,
      `Cook or warm ${recipe.base.name}. Curries are best when the base is ready before the sauce reaches its final texture.`,
      `Measure ${recipe.sauce.name} and ${recipe.seasoning.name}; curry spices can burn quickly, so keep them beside the pot.`,
    ],
    cooking: [
      `Heat oil in a deep pan, add aromatics, then bloom ${recipe.seasoning.name} for 30 to 60 seconds until fragrant.`,
      `Add ${recipe.primary.name} and ${recipe.produce.name}. Stir until coated, then pour in ${recipe.sauce.name}.`,
      `Simmer gently until the sauce thickens and the main ingredient is cooked through. Adjust with water for a lighter curry or simmer longer for a richer one.`,
    ],
    serving: [
      `Rest the curry for 5 minutes, then finish with ${recipe.garnish.name}.`,
      `Serve with ${recipe.base.name}. Store in shallow containers; the flavor deepens after one night in the refrigerator.`,
    ],
  }),
  salad: (recipe) => ({
    preparation: [
      `Wash and dry ${recipe.produce.name} thoroughly. Dry greens and vegetables make the dressing cling instead of pooling at the bottom.`,
      `Prepare ${recipe.primary.name} and ${recipe.base.name}. Cool any hot components before mixing so the salad stays crisp.`,
      `Shake or whisk ${recipe.sauce.name} with ${recipe.seasoning.name}. Taste for a clear balance of salt, acidity, and sweetness.`,
    ],
    cooking: [
      `If ${recipe.primary.name} needs cooking, sear, grill, or warm it until done, then rest before slicing.`,
      `Combine ${recipe.base.name} with ${recipe.produce.name} in a wide bowl and toss with a small amount of dressing first.`,
      `Add ${recipe.primary.name} and enough extra dressing to coat without making the salad heavy.`,
    ],
    serving: [
      `Top with ${recipe.garnish.name} just before serving so crunchy pieces stay crisp.`,
      `For meal prep, layer dressing on the bottom, sturdy ingredients in the middle, and greens on top.`,
    ],
  }),
  bake: (recipe) => ({
    preparation: [
      `Preheat the oven to 190 C / 375 F. Grease the baking dish or line a tray before handling the ingredients.`,
      `Cut ${recipe.primary.name}, ${recipe.base.name}, and ${recipe.produce.name} into even pieces. Toss with ${recipe.sauce.name} and ${recipe.seasoning.name}.`,
      `Spread everything in a single layer or level dish. Crowded trays steam, so use two trays if the pieces overlap heavily.`,
    ],
    cooking: [
      `Bake until the thickest pieces are tender and the edges are browned. Rotate the tray halfway through for even color.`,
      `If the top browns too quickly, cover loosely with foil. If it looks pale, uncover for the final 5 to 10 minutes.`,
      `Check seasoning while hot; baked dishes often need a small splash of sauce or a pinch of salt at the end.`,
    ],
    serving: [
      `Rest for 5 to 10 minutes, then finish with ${recipe.garnish.name}.`,
      `Cool leftovers before covering. Most baked dishes keep for 3 days and reheat best uncovered so the edges regain texture.`,
    ],
  }),
  grill: (recipe) => ({
    preparation: [
      `Soak skewers if using wood. Cut ${recipe.primary.name} and ${recipe.produce.name} into grill-friendly pieces that will not fall through the grate.`,
      `Coat with ${recipe.sauce.name} and ${recipe.seasoning.name}. Let it marinate for at least 15 minutes while the grill preheats.`,
      `Prepare ${recipe.base.name} and arrange ${recipe.garnish.name} before grilling because the hot food should be served quickly.`,
    ],
    cooking: [
      `Heat the grill or grill pan to medium-high. Oil the grate, then cook ${recipe.primary.name} until marked and cooked through.`,
      `Grill ${recipe.produce.name} until charred in spots but still juicy. Move pieces to a cooler area if they darken too fast.`,
      `Brush with a small amount of ${recipe.sauce.name} during the final minute so it glazes instead of burning.`,
    ],
    serving: [
      `Rest grilled items for 5 minutes. Serve over or beside ${recipe.base.name} and finish with ${recipe.garnish.name}.`,
      `Store grilled components separately from fresh garnish for the best texture.`,
    ],
  }),
  skillet: (recipe) => ({
    preparation: [
      `Prepare ${recipe.primary.name}, ${recipe.base.name}, and ${recipe.produce.name} before heating the pan. Skillet recipes move quickly once started.`,
      `Season the main ingredient with ${recipe.seasoning.name}. Keep ${recipe.sauce.name} measured and ready.`,
      `Warm plates or tortillas if needed, and set ${recipe.garnish.name} aside for the end.`,
    ],
    cooking: [
      `Heat a wide skillet over medium-high heat. Add oil, then cook ${recipe.primary.name} until browned and nearly done.`,
      `Add ${recipe.produce.name} and cook until softened. Stir in ${recipe.base.name} if it needs heating or crisping.`,
      `Lower the heat, add ${recipe.sauce.name}, and stir until everything is coated and hot throughout.`,
    ],
    serving: [
      `Finish with ${recipe.garnish.name} and serve directly from the skillet or divide into portions.`,
      `If packing leftovers, cool uncovered for 10 minutes first so condensation does not soften the texture.`,
    ],
  }),
  dessert: (recipe) => ({
    preparation: [
      `Set out ${recipe.primary.name}, ${recipe.base.name}, and ${recipe.produce.name}. Bring chilled dairy or eggs close to room temperature when the recipe uses them.`,
      `Measure ${recipe.sauce.name} and ${recipe.seasoning.name} accurately. Dessert texture depends on clean measurements and even mixing.`,
      `Prepare serving cups, jars, or a tray before mixing so the dessert can be assembled while the textures are fresh.`,
    ],
    cooking: [
      `Combine ${recipe.primary.name} with ${recipe.base.name} until evenly mixed. Fold in ${recipe.produce.name} gently so it stays distinct.`,
      `Add ${recipe.sauce.name} gradually, tasting as you go. The mixture should be slightly sweeter before chilling because cold dulls sweetness.`,
      `Bake, simmer, or chill as needed until the dessert sets and the center is no longer loose.`,
    ],
    serving: [
      `Finish with ${recipe.garnish.name} just before serving.`,
      `Cover and refrigerate leftovers. Chilled desserts usually taste best after at least 30 minutes of resting.`,
    ],
  }),
  drink: (recipe) => ({
    preparation: [
      `Prepare ${recipe.primary.name} first. If brewing, steep fully and cool slightly; if blending fruit, remove seeds, tough peel, or fibrous parts.`,
      `Chill ${recipe.base.name} and serving glasses. Cold ingredients reduce the amount of ice needed and keep the drink from tasting diluted.`,
      `Measure ${recipe.sauce.name} and ${recipe.seasoning.name}. Start with less sweetener than you think you need because it can always be added later.`,
    ],
    cooking: [
      `Combine ${recipe.primary.name}, ${recipe.base.name}, and ${recipe.produce.name} in a pitcher or blender.`,
      `Add ${recipe.sauce.name} and ${recipe.seasoning.name}, then blend, shake, or stir until fully combined.`,
      `Taste and adjust with more water for a lighter drink, more sweetener for balance, or more citrus for brightness.`,
    ],
    serving: [
      `Pour over fresh ice and finish with ${recipe.garnish.name}.`,
      `Serve immediately for the brightest flavor. Store without ice for up to 2 days and shake before pouring.`,
    ],
  }),
}

export function descriptionFor(recipe) {
  const style = styleLabels[recipe.style] || 'complete recipe'
  return `${recipe.title} is a ${style} built around ${recipe.primary.name}, ${recipe.base.name}, and ${recipe.produce.name}. The seed data includes measured ingredients, preparation notes, cooking cues, finishing guidance, and storage advice so the recipe detail page has realistic content.`
}

function chunk(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function upsertNames(connection, table, names) {
  for (const name of names) {
    await connection.execute(
      `INSERT INTO ${table} (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [name],
    )
  }
}

async function fetchNameIdMap(connection, table, names) {
  const idMap = new Map()
  for (const nameChunk of chunk(names, 50)) {
    const placeholders = nameChunk.map(() => '?').join(', ')
    const [rows] = await connection.execute(
      `SELECT id, name FROM ${table} WHERE name IN (${placeholders})`,
      nameChunk,
    )
    rows.forEach((row) => idMap.set(row.name, row.id))
  }
  return idMap
}

async function deleteExistingSeedRecipes(connection) {
  const titles = recipes.map((recipe) => recipe.title)
  for (const titleChunk of chunk(titles, 40)) {
    const placeholders = titleChunk.map(() => '?').join(', ')
    await connection.execute(`DELETE FROM recipes WHERE title IN (${placeholders})`, titleChunk)
  }
}

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function sqlTuple(values) {
  return `  (${values.map(sqlString).join(', ')})`
}

function buildRecipeSeedSql() {
  const categoryNames = [...new Set(recipes.map((recipe) => recipe.category))]
  const tagNames = [...new Set(recipes.flatMap((recipe) => recipe.tags))]
  const lines = [
    '-- FoodStory generated recipe seed.',
    '-- image_url is intentionally blank so you can paste your own image URL for each recipe.',
    '-- Re-running this file replaces recipes whose titles match the generated seed titles.',
    'USE foodstory;',
    '',
    'START TRANSACTION;',
    '',
    'INSERT INTO categories (name) VALUES',
    `${categoryNames.map((name) => sqlTuple([name])).join(',\n')}`,
    'ON DUPLICATE KEY UPDATE name = VALUES(name);',
    '',
    'INSERT INTO tags (name) VALUES',
    `${tagNames.map((name) => sqlTuple([name])).join(',\n')}`,
    'ON DUPLICATE KEY UPDATE name = VALUES(name);',
    '',
    `DELETE FROM recipes WHERE title IN (${recipes.map((recipe) => sqlString(recipe.title)).join(', ')});`,
  ]

  for (const recipe of recipes) {
    const nutrition = nutritionFor(recipe)
    const ingredients = ingredientsFor(recipe)
    lines.push(
      '',
      `-- ${recipe.title}`,
      `INSERT INTO recipes
  (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
VALUES
  (
    (SELECT id FROM categories WHERE name = ${sqlString(recipe.category)}),
    ${sqlString(recipe.title)},
    ${sqlString(seedImageUrl)},
    ${sqlString(buildInstructions(recipe))},
    ${sqlString(descriptionFor(recipe))},
    ${nutrition.calories},
    ${nutrition.protein},
    ${nutrition.carbs},
    ${nutrition.fat}
  );`,
      'SET @recipe_id = LAST_INSERT_ID();',
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
${ingredients.map((ingredient) => `  (@recipe_id, ${sqlString(ingredient.name)}, ${sqlString(ingredient.quantity)})`).join(',\n')};`,
      `INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT @recipe_id, id
FROM tags
WHERE name IN (${recipe.tags.map(sqlString).join(', ')});`,
    )
  }

  lines.push('', 'COMMIT;', '')
  return lines.join('\n')
}

async function writeRecipeSeedSql() {
  const outputUrl = new URL('./seedRecipes.sql', import.meta.url)
  await fs.writeFile(outputUrl, buildRecipeSeedSql(), 'utf8')
  console.log(`Wrote SQL seed for ${recipes.length} recipes to database/seedRecipes.sql.`)
}

async function seedRecipes() {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const categoryNames = [...new Set(recipes.map((recipe) => recipe.category))]
    const tagNames = [...new Set(recipes.flatMap((recipe) => recipe.tags))]

    await upsertNames(connection, 'categories', categoryNames)
    await upsertNames(connection, 'tags', tagNames)

    const categoryIds = await fetchNameIdMap(connection, 'categories', categoryNames)
    const tagIds = await fetchNameIdMap(connection, 'tags', tagNames)

    await deleteExistingSeedRecipes(connection)

    for (const recipe of recipes) {
      const nutrition = nutritionFor(recipe)
      const [result] = await connection.execute(
        `INSERT INTO recipes
           (category_id, title, image_url, instructions, description, calories, protein, carbs, fat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          categoryIds.get(recipe.category),
          recipe.title,
          seedImageUrl,
          buildInstructions(recipe),
          descriptionFor(recipe),
          nutrition.calories,
          nutrition.protein,
          nutrition.carbs,
          nutrition.fat,
        ],
      )

      const recipeId = result.insertId
      for (const ingredient of ingredientsFor(recipe)) {
        await connection.execute(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity)
           VALUES (?, ?, ?)`,
          [recipeId, ingredient.name, ingredient.quantity],
        )
      }

      for (const tagName of recipe.tags) {
        await connection.execute(
          'INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
          [recipeId, tagIds.get(tagName)],
        )
      }
    }

    await connection.commit()

    console.log(`Seeded ${recipes.length} detailed recipes.`)
    console.log(`Categories: ${categoryNames.length}`)
    console.log(`Tags: ${tagNames.length}`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

async function main() {
  if (process.argv.includes('--write-sql')) {
    await writeRecipeSeedSql()
    await pool.end()
    return
  }

  await seedRecipes()
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().catch(async (error) => {
    console.error('Failed to seed recipes:', error.message)
    await pool.end().catch(() => {})
    process.exit(1)
  })
}
