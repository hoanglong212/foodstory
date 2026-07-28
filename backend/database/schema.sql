CREATE DATABASE IF NOT EXISTS foodstory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE foodstory;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('guest','user','admin') DEFAULT 'user',
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_users_role_banned (role, is_banned)
);

CREATE TABLE IF NOT EXISTS news (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  published_date DATE NOT NULL,
  KEY idx_news_published_date (published_date),
  KEY idx_news_category (category),
  UNIQUE KEY unique_news_title_date (title, published_date)
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  submitted_by INT DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  rejection_reason VARCHAR(500) DEFAULT NULL,
  moderated_by INT DEFAULT NULL,
  moderated_at DATETIME DEFAULT NULL,
  image_url VARCHAR(500) NOT NULL,
  instructions TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  prep_time INT NOT NULL DEFAULT 0,
  cook_time INT NOT NULL DEFAULT 0,
  servings INT DEFAULT NULL,
  difficulty VARCHAR(30) DEFAULT NULL,
  calories INT NOT NULL DEFAULT 0,
  protein INT NOT NULL DEFAULT 0,
  carbs INT NOT NULL DEFAULT 0,
  fat INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_recipes_category_created (category_id, created_at),
  KEY idx_recipes_created (created_at),
  KEY idx_recipes_status_created (status, created_at),
  KEY idx_recipes_submitted_by (submitted_by),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_recipes_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_recipes_moderated_by FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT NOT NULL,
  ingredient_name VARCHAR(150) NOT NULL,
  quantity VARCHAR(50) DEFAULT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  recipe_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_comments_recipe_created (recipe_id, created_at),
  KEY idx_comments_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INT NOT NULL,
  recipe_id INT NOT NULL,
  PRIMARY KEY (user_id, recipe_id),
  KEY idx_favorites_recipe (recipe_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  recipe_id INT NOT NULL,
  rating_value TINYINT NOT NULL CHECK (rating_value BETWEEN 1 AND 5),
  UNIQUE KEY unique_user_recipe (user_id, recipe_id),
  KEY idx_ratings_recipe (recipe_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  recipe_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_recipe_checklist (user_id, recipe_id),
  KEY idx_checklists_recipe (recipe_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  checklist_id INT NOT NULL,
  ingredient_name VARCHAR(150) NOT NULL,
  quantity VARCHAR(50) DEFAULT NULL,
  is_checked BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS food_spots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  recipe_id INT DEFAULT NULL,
  name VARCHAR(150) NOT NULL,
  dish_name VARCHAR(150) DEFAULT NULL,
  category VARCHAR(80) DEFAULT NULL,
  district VARCHAR(80) DEFAULT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  rating TINYINT DEFAULT NULL CHECK (rating BETWEEN 1 AND 5),
  notes TEXT DEFAULT NULL,
  tags VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_food_spots_user (user_id),
  KEY idx_food_spots_recipe (recipe_id),
  KEY idx_food_spots_coordinates (latitude, longitude),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS restaurants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) DEFAULT NULL,
  district VARCHAR(80) DEFAULT NULL,
  category VARCHAR(80) DEFAULT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  avg_rating DECIMAL(2,1) NOT NULL DEFAULT 0 CHECK (avg_rating BETWEEN 0 AND 5),
  price_range VARCHAR(20) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  featured_dish VARCHAR(255) DEFAULT NULL,
  image_url VARCHAR(2048) DEFAULT NULL,
  image_attribution VARCHAR(255) DEFAULT NULL,
  source_url VARCHAR(2048) DEFAULT NULL,
  verified_at DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_restaurants_district (district),
  KEY idx_restaurants_category (category),
  KEY idx_restaurants_rating (avg_rating),
  KEY idx_restaurants_coordinates (latitude, longitude)
);
