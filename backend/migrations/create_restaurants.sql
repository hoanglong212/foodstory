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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_restaurants_district (district),
  KEY idx_restaurants_category (category),
  KEY idx_restaurants_rating (avg_rating),
  KEY idx_restaurants_coordinates (latitude, longitude)
);
