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
    'Phở Bò Hà Nội',
    'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=900&q=80',
    'Nướng gừng và hành cho thơm. Ninh xương bò với hồi, quế và thảo quả. Chần bánh phở, xếp thịt bò thái mỏng, chan nước dùng nóng và dùng cùng rau thơm.',
    520,
    34,
    62,
    14
  ),
  (
    2,
    1,
    'Bánh Mì Pate Sinh Viên',
    'https://images.unsplash.com/photo-1600454309261-3dc9b7597637?auto=format&fit=crop&w=900&q=80',
    'Làm nóng bánh mì cho giòn. Phết pate, thêm chả lụa, dưa leo, đồ chua, rau mùi và tương ớt. Ép nhẹ để nhân bám đều.',
    430,
    18,
    55,
    15
  ),
  (
    3,
    1,
    'Gỏi Cuốn Tôm Thịt',
    'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80',
    'Làm mềm bánh tráng. Xếp rau sống, bún, tôm, thịt luộc và cuộn chặt tay. Dùng cùng nước chấm đậu phộng hoặc mắm chua ngọt.',
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
    'Xào kimchi với hành, thêm cơm nguội và tương ớt Hàn Quốc. Đảo đến khi cơm săn, đặt trứng ốp la lên trên và rắc mè rang.',
    480,
    16,
    68,
    16
  ),
  (
    5,
    2,
    'Bibimbap Rau Củ',
    'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=900&q=80',
    'Chuẩn bị cơm nóng, rau củ xào riêng, trứng và sốt gochujang. Xếp từng phần vào tô rồi trộn đều trước khi ăn.',
    560,
    21,
    82,
    15
  ),
  (
    6,
    3,
    'Onigiri Cá Ngừ Mayo',
    'https://images.unsplash.com/photo-1615361200141-f45040f367be?auto=format&fit=crop&w=900&q=80',
    'Trộn cá ngừ với sốt mayo và tiêu. Nắm cơm thành tam giác, cho nhân vào giữa, bọc rong biển ngay trước khi dùng.',
    360,
    17,
    52,
    9
  ),
  (
    7,
    3,
    'Miso Soup Nấm Đậu Hũ',
    'https://images.unsplash.com/photo-1607301405390-d831c242f59b?auto=format&fit=crop&w=900&q=80',
    'Đun nước dùng dashi nhẹ, thêm nấm, đậu hũ và rong biển. Tắt bếp rồi hòa miso để giữ mùi thơm.',
    180,
    12,
    18,
    6
  ),
  (
    8,
    4,
    'Chè Xoài Sữa Dừa',
    'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80',
    'Xay một phần xoài với sữa dừa. Cắt xoài hạt lựu, thêm trân châu nhỏ và làm lạnh trước khi dùng.',
    340,
    5,
    58,
    11
  ),
  (
    9,
    4,
    'Bánh Flan Cà Phê',
    'https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=900&q=80',
    'Thắng caramel, trộn trứng sữa với cà phê hòa tan. Hấp nhỏ lửa đến khi mặt bánh mịn, làm lạnh ít nhất hai giờ.',
    290,
    8,
    36,
    12
  ),
  (
    10,
    5,
    'Trà Tắc Mật Ong',
    'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80',
    'Ủ trà đen, để nguội nhẹ rồi thêm mật ong và nước tắc. Lắc với đá để hương vị hòa quyện.',
    120,
    1,
    30,
    0
  );

INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES
  (1, 'Bánh phở', '400g'),
  (1, 'Thịt bò tái', '300g'),
  (1, 'Xương bò', '1kg'),
  (1, 'Hồi quế gừng hành', '1 phần'),
  (2, 'Bánh mì', '2 ổ'),
  (2, 'Pate', '80g'),
  (2, 'Chả lụa', '120g'),
  (2, 'Đồ chua', '1 chén'),
  (3, 'Bánh tráng', '8 cái'),
  (3, 'Tôm luộc', '200g'),
  (3, 'Thịt luộc', '150g'),
  (3, 'Rau sống và bún', '1 phần'),
  (4, 'Cơm nguội', '2 chén'),
  (4, 'Kimchi', '1 chén'),
  (4, 'Trứng', '2 quả'),
  (4, 'Gochujang', '1 muỗng canh'),
  (5, 'Cơm trắng', '2 chén'),
  (5, 'Rau củ theo mùa', '300g'),
  (5, 'Trứng', '2 quả'),
  (5, 'Sốt gochujang', '2 muỗng canh'),
  (6, 'Cơm Nhật', '2 chén'),
  (6, 'Cá ngừ hộp', '120g'),
  (6, 'Mayonnaise', '2 muỗng canh'),
  (6, 'Rong biển', '4 lá'),
  (7, 'Đậu hũ non', '200g'),
  (7, 'Miso', '2 muỗng canh'),
  (7, 'Nấm', '120g'),
  (7, 'Rong biển wakame', '1 muỗng canh'),
  (8, 'Xoài chín', '2 quả'),
  (8, 'Sữa dừa', '250ml'),
  (8, 'Trân châu nhỏ', '80g'),
  (9, 'Trứng gà', '4 quả'),
  (9, 'Sữa tươi', '400ml'),
  (9, 'Cà phê hòa tan', '1 gói'),
  (9, 'Đường', '80g'),
  (10, 'Trà đen', '2 túi'),
  (10, 'Tắc', '5 quả'),
  (10, 'Mật ong', '2 muỗng canh');

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
