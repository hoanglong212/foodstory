UPDATE news
SET
  title = CASE title
    WHEN 'Hướng Dẫn Làm Chả Giò Giòn Tan Không Bị Mềm' THEN 'How to Make Crispy Spring Rolls That Stay Crunchy'
    WHEN 'Cơm Tấm Sài Gòn: Linh Hồn Của Bữa Sáng Phương Nam' THEN 'Saigon Broken Rice: The Soul of a Southern Breakfast'
    WHEN 'Năm Quán Bún Bò Huế Đáng Thử Khi Ghé Miền Trung' THEN 'Five Hue Beef Noodle Soup Shops Worth Trying'
    WHEN 'Cà Phê Trứng Hà Nội Trở Lại Trong Menu Quán Trẻ' THEN 'Hanoi Egg Coffee Returns to Modern Cafe Menus'
    WHEN 'Mâm Cơm Gia Đình Việt Và Cách Cân Bằng Dinh Dưỡng' THEN 'Balancing Nutrition in a Vietnamese Family Meal'
    WHEN 'Bí Quyết Nấu Nước Lẩu Thái Chua Cay Đậm Vị' THEN 'The Secret to a Bold Sweet-and-Sour Thai Hot Pot Broth'
    WHEN 'Bánh Mì Việt Nam Được Yêu Thích Trong Lễ Hội Ẩm Thực' THEN 'Vietnamese Banh Mi Shines at Food Festivals'
    WHEN 'Cách Bảo Quản Rau Thơm Luôn Tươi Trong Tủ Lạnh' THEN 'How to Keep Fresh Herbs Crisp in the Refrigerator'
    WHEN 'Ăn Vặt Sinh Viên: Những Món Ngon Dễ Tìm Gần Trường' THEN 'Student Snacks: Easy Favorites Near Campus'
    WHEN 'Nước Mắm Chấm: Tỉ Lệ Cơ Bản Cho Người Mới Nấu' THEN 'Vietnamese Dipping Sauce: A Simple Ratio for Beginners'
    WHEN 'Gỏi Cuốn Và Lựa Chọn Bữa Trưa Nhẹ Cho Dân Văn Phòng' THEN 'Fresh Spring Rolls as a Light Office Lunch'
    WHEN 'Xu Hướng Chụp Ảnh Món Ăn Tối Giản Trên Mạng Xã Hội' THEN 'The Minimalist Food Photography Trend on Social Media'
    ELSE title
  END,
  content = CASE title
    WHEN 'Hướng Dẫn Làm Chả Giò Giòn Tan Không Bị Mềm' THEN 'The key is to fry them twice so the wrappers turn evenly golden, stay crisp longer, and absorb less oil.'
    WHEN 'Cơm Tấm Sài Gòn: Linh Hồn Của Bữa Sáng Phương Nam' THEN 'Broken rice with grilled pork, shredded pork skin, egg loaf, and sweet-sour fish sauce is an essential southern favorite.'
    WHEN 'Năm Quán Bún Bò Huế Đáng Thử Khi Ghé Miền Trung' THEN 'From fragrant spicy broth to springy crab cakes, each place preserves a distinct taste of Hue.'
    WHEN 'Cà Phê Trứng Hà Nội Trở Lại Trong Menu Quán Trẻ' THEN 'The rich, silky egg cream is being reinvented with cocoa, matcha, and sea salt for modern tastes.'
    WHEN 'Mâm Cơm Gia Đình Việt Và Cách Cân Bằng Dinh Dưỡng' THEN 'A meal with vegetables, protein, soup, and a savory main course makes dinner satisfying and practical for a busy schedule.'
    WHEN 'Bí Quyết Nấu Nước Lẩu Thái Chua Cay Đậm Vị' THEN 'Lemongrass, galangal, lime leaves, and tamarind create a fragrant broth without requiring complicated seasoning.'
    WHEN 'Bánh Mì Việt Nam Được Yêu Thích Trong Lễ Hội Ẩm Thực' THEN 'Crisp baguettes, varied fillings, and fresh herbs keep banh mi among the most recognizable street foods.'
    WHEN 'Cách Bảo Quản Rau Thơm Luôn Tươi Trong Tủ Lạnh' THEN 'Wash and dry the herbs, wrap them in paper towels, and store them in an airtight container to preserve their aroma for days.'
    WHEN 'Ăn Vặt Sinh Viên: Những Món Ngon Dễ Tìm Gần Trường' THEN 'Mixed rice paper, fried fish balls, and kumquat tea remain a familiar trio for afternoon study sessions.'
    WHEN 'Nước Mắm Chấm: Tỉ Lệ Cơ Bản Cho Người Mới Nấu' THEN 'One part fish sauce, one part sugar, one part lime juice, and four parts water is an easy base to adjust to taste.'
    WHEN 'Gỏi Cuốn Và Lựa Chọn Bữa Trưa Nhẹ Cho Dân Văn Phòng' THEN 'Fresh spring rolls combine herbs, rice noodles, shrimp, pork, and peanut sauce for a quick yet balanced lunch.'
    WHEN 'Xu Hướng Chụp Ảnh Món Ăn Tối Giản Trên Mạng Xã Hội' THEN 'Natural light, clean wooden backgrounds, and close angles make everyday dishes look more appealing.'
    ELSE content
  END,
  category = CASE category
    WHEN 'Công Thức' THEN 'Recipes'
    WHEN 'Ẩm Thực Việt' THEN 'Vietnamese Cuisine'
    WHEN 'Địa Điểm' THEN 'Places'
    WHEN 'Xu Hướng' THEN 'Trends'
    WHEN 'Đường Phố' THEN 'Street Food'
    WHEN 'Nguyên Liệu' THEN 'Ingredients'
    ELSE category
  END
WHERE title IN (
  'Hướng Dẫn Làm Chả Giò Giòn Tan Không Bị Mềm',
  'Cơm Tấm Sài Gòn: Linh Hồn Của Bữa Sáng Phương Nam',
  'Năm Quán Bún Bò Huế Đáng Thử Khi Ghé Miền Trung',
  'Cà Phê Trứng Hà Nội Trở Lại Trong Menu Quán Trẻ',
  'Mâm Cơm Gia Đình Việt Và Cách Cân Bằng Dinh Dưỡng',
  'Bí Quyết Nấu Nước Lẩu Thái Chua Cay Đậm Vị',
  'Bánh Mì Việt Nam Được Yêu Thích Trong Lễ Hội Ẩm Thực',
  'Cách Bảo Quản Rau Thơm Luôn Tươi Trong Tủ Lạnh',
  'Ăn Vặt Sinh Viên: Những Món Ngon Dễ Tìm Gần Trường',
  'Nước Mắm Chấm: Tỉ Lệ Cơ Bản Cho Người Mới Nấu',
  'Gỏi Cuốn Và Lựa Chọn Bữa Trưa Nhẹ Cho Dân Văn Phòng',
  'Xu Hướng Chụp Ảnh Món Ăn Tối Giản Trên Mạng Xã Hội'
);

UPDATE news
SET content = CASE title
  WHEN 'How to Make Crispy Spring Rolls That Stay Crunchy' THEN 'The key is to fry them twice so the wrappers turn evenly golden, stay crisp longer, and absorb less oil.'
  WHEN 'Saigon Broken Rice: The Soul of a Southern Breakfast' THEN 'Broken rice with grilled pork, shredded pork skin, egg loaf, and sweet-sour fish sauce is an essential southern favorite.'
  WHEN 'Five Hue Beef Noodle Soup Shops Worth Trying' THEN 'From fragrant spicy broth to springy crab cakes, each place preserves a distinct taste of Hue.'
  WHEN 'Hanoi Egg Coffee Returns to Modern Cafe Menus' THEN 'The rich, silky egg cream is being reinvented with cocoa, matcha, and sea salt for modern tastes.'
  WHEN 'Balancing Nutrition in a Vietnamese Family Meal' THEN 'A meal with vegetables, protein, soup, and a savory main course makes dinner satisfying and practical for a busy schedule.'
  WHEN 'The Secret to a Bold Sweet-and-Sour Thai Hot Pot Broth' THEN 'Lemongrass, galangal, lime leaves, and tamarind create a fragrant broth without requiring complicated seasoning.'
  WHEN 'Vietnamese Banh Mi Shines at Food Festivals' THEN 'Crisp baguettes, varied fillings, and fresh herbs keep banh mi among the most recognizable street foods.'
  WHEN 'How to Keep Fresh Herbs Crisp in the Refrigerator' THEN 'Wash and dry the herbs, wrap them in paper towels, and store them in an airtight container to preserve their aroma for days.'
  WHEN 'Student Snacks: Easy Favorites Near Campus' THEN 'Mixed rice paper, fried fish balls, and kumquat tea remain a familiar trio for afternoon study sessions.'
  WHEN 'Vietnamese Dipping Sauce: A Simple Ratio for Beginners' THEN 'One part fish sauce, one part sugar, one part lime juice, and four parts water is an easy base to adjust to taste.'
  WHEN 'Fresh Spring Rolls as a Light Office Lunch' THEN 'Fresh spring rolls combine herbs, rice noodles, shrimp, pork, and peanut sauce for a quick yet balanced lunch.'
  WHEN 'The Minimalist Food Photography Trend on Social Media' THEN 'Natural light, clean wooden backgrounds, and close angles make everyday dishes look more appealing.'
  ELSE content
END;

UPDATE recipes
SET
  title = CASE title
    WHEN 'Phở Bò Hà Nội' THEN 'Hanoi Beef Pho'
    WHEN 'Bánh Mì Pate Sinh Viên' THEN 'Student-Style Pate Banh Mi'
    WHEN 'Gỏi Cuốn Tôm Thịt' THEN 'Shrimp and Pork Fresh Spring Rolls'
    WHEN 'Bibimbap Rau Củ' THEN 'Vegetable Bibimbap'
    WHEN 'Onigiri Cá Ngừ Mayo' THEN 'Tuna Mayo Onigiri'
    WHEN 'Miso Soup Nấm Đậu Hũ' THEN 'Mushroom and Tofu Miso Soup'
    WHEN 'Chè Xoài Sữa Dừa' THEN 'Mango Coconut Dessert'
    WHEN 'Bánh Flan Cà Phê' THEN 'Coffee Creme Caramel'
    WHEN 'Trà Tắc Mật Ong' THEN 'Honey Kumquat Tea'
    ELSE title
  END,
  instructions = CASE title
    WHEN 'Phở Bò Hà Nội' THEN 'Char the ginger and onion until fragrant. Simmer beef bones with star anise, cinnamon, and black cardamom. Blanch the rice noodles, add thinly sliced beef, pour over the hot broth, and serve with fresh herbs.'
    WHEN 'Bánh Mì Pate Sinh Viên' THEN 'Warm the baguette until crisp. Spread the pate, then add Vietnamese pork sausage, cucumber, pickles, cilantro, and chili sauce. Press gently to hold the filling together.'
    WHEN 'Gỏi Cuốn Tôm Thịt' THEN 'Soften the rice paper. Add herbs, rice vermicelli, shrimp, and cooked pork, then roll tightly. Serve with peanut sauce or sweet-and-sour fish sauce.'
    WHEN 'Kimchi Fried Rice' THEN 'Stir-fry kimchi with onion, then add chilled rice and gochujang. Cook until the rice is firm, top with a fried egg, and finish with toasted sesame seeds.'
    WHEN 'Bibimbap Rau Củ' THEN 'Prepare hot rice, separately sauteed vegetables, an egg, and gochujang sauce. Arrange everything in a bowl and mix well before eating.'
    WHEN 'Onigiri Cá Ngừ Mayo' THEN 'Mix tuna with mayonnaise and pepper. Shape the rice into triangles with the filling in the center, then wrap with seaweed just before serving.'
    WHEN 'Miso Soup Nấm Đậu Hũ' THEN 'Gently heat the dashi broth, then add mushrooms, tofu, and seaweed. Turn off the heat before stirring in the miso to preserve its aroma.'
    WHEN 'Chè Xoài Sữa Dừa' THEN 'Blend part of the mango with coconut milk. Dice the remaining mango, add small tapioca pearls, and chill before serving.'
    WHEN 'Bánh Flan Cà Phê' THEN 'Prepare the caramel, then mix eggs and milk with instant coffee. Steam gently until smooth and chill for at least two hours.'
    WHEN 'Trà Tắc Mật Ong' THEN 'Brew black tea and let it cool slightly before adding honey and kumquat juice. Shake with ice until well combined.'
    ELSE instructions
  END
WHERE title IN (
  'Phở Bò Hà Nội',
  'Bánh Mì Pate Sinh Viên',
  'Gỏi Cuốn Tôm Thịt',
  'Kimchi Fried Rice',
  'Bibimbap Rau Củ',
  'Onigiri Cá Ngừ Mayo',
  'Miso Soup Nấm Đậu Hũ',
  'Chè Xoài Sữa Dừa',
  'Bánh Flan Cà Phê',
  'Trà Tắc Mật Ong'
);

UPDATE recipes
SET instructions = CASE title
  WHEN 'Hanoi Beef Pho' THEN 'Char the ginger and onion until fragrant. Simmer beef bones with star anise, cinnamon, and black cardamom. Blanch the rice noodles, add thinly sliced beef, pour over the hot broth, and serve with fresh herbs.'
  WHEN 'Student-Style Pate Banh Mi' THEN 'Warm the baguette until crisp. Spread the pate, then add Vietnamese pork sausage, cucumber, pickles, cilantro, and chili sauce. Press gently to hold the filling together.'
  WHEN 'Shrimp and Pork Fresh Spring Rolls' THEN 'Soften the rice paper. Add herbs, rice vermicelli, shrimp, and cooked pork, then roll tightly. Serve with peanut sauce or sweet-and-sour fish sauce.'
  WHEN 'Kimchi Fried Rice' THEN 'Stir-fry kimchi with onion, then add chilled rice and gochujang. Cook until the rice is firm, top with a fried egg, and finish with toasted sesame seeds.'
  WHEN 'Vegetable Bibimbap' THEN 'Prepare hot rice, separately sauteed vegetables, an egg, and gochujang sauce. Arrange everything in a bowl and mix well before eating.'
  WHEN 'Tuna Mayo Onigiri' THEN 'Mix tuna with mayonnaise and pepper. Shape the rice into triangles with the filling in the center, then wrap with seaweed just before serving.'
  WHEN 'Mushroom and Tofu Miso Soup' THEN 'Gently heat the dashi broth, then add mushrooms, tofu, and seaweed. Turn off the heat before stirring in the miso to preserve its aroma.'
  WHEN 'Mango Coconut Dessert' THEN 'Blend part of the mango with coconut milk. Dice the remaining mango, add small tapioca pearls, and chill before serving.'
  WHEN 'Coffee Creme Caramel' THEN 'Prepare the caramel, then mix eggs and milk with instant coffee. Steam gently until smooth and chill for at least two hours.'
  WHEN 'Honey Kumquat Tea' THEN 'Brew black tea and let it cool slightly before adding honey and kumquat juice. Shake with ice until well combined.'
  ELSE instructions
END;

UPDATE recipe_ingredients
SET
  ingredient_name = CASE ingredient_name
    WHEN 'Bánh phở' THEN 'Rice noodles'
    WHEN 'Thịt bò tái' THEN 'Rare beef'
    WHEN 'Xương bò' THEN 'Beef bones'
    WHEN 'Hồi quế gừng hành' THEN 'Star anise, cinnamon, ginger, and onion'
    WHEN 'Bánh mì' THEN 'Baguettes'
    WHEN 'Chả lụa' THEN 'Vietnamese pork sausage'
    WHEN 'Đồ chua' THEN 'Pickled vegetables'
    WHEN 'Bánh tráng' THEN 'Rice paper wrappers'
    WHEN 'Tôm luộc' THEN 'Cooked shrimp'
    WHEN 'Thịt luộc' THEN 'Cooked pork'
    WHEN 'Rau sống và bún' THEN 'Fresh herbs and rice vermicelli'
    WHEN 'Cơm nguội' THEN 'Chilled rice'
    WHEN 'Trứng' THEN 'Eggs'
    WHEN 'Cơm trắng' THEN 'Steamed rice'
    WHEN 'Rau củ theo mùa' THEN 'Seasonal vegetables'
    WHEN 'Sốt gochujang' THEN 'Gochujang sauce'
    WHEN 'Cơm Nhật' THEN 'Japanese short-grain rice'
    WHEN 'Cá ngừ hộp' THEN 'Canned tuna'
    WHEN 'Rong biển' THEN 'Seaweed sheets'
    WHEN 'Đậu hũ non' THEN 'Silken tofu'
    WHEN 'Nấm' THEN 'Mushrooms'
    WHEN 'Rong biển wakame' THEN 'Wakame seaweed'
    WHEN 'Xoài chín' THEN 'Ripe mangoes'
    WHEN 'Sữa dừa' THEN 'Coconut milk'
    WHEN 'Trân châu nhỏ' THEN 'Small tapioca pearls'
    WHEN 'Trứng gà' THEN 'Eggs'
    WHEN 'Sữa tươi' THEN 'Fresh milk'
    WHEN 'Cà phê hòa tan' THEN 'Instant coffee'
    WHEN 'Đường' THEN 'Sugar'
    WHEN 'Trà đen' THEN 'Black tea bags'
    WHEN 'Tắc' THEN 'Kumquats'
    WHEN 'Mật ong' THEN 'Honey'
    ELSE ingredient_name
  END,
  quantity = CASE quantity
    WHEN '1 phần' THEN '1 portion'
    WHEN '2 ổ' THEN '2'
    WHEN '1 chén' THEN '1 cup'
    WHEN '8 cái' THEN '8'
    WHEN '2 chén' THEN '2 cups'
    WHEN '2 quả' THEN '2'
    WHEN '1 muỗng canh' THEN '1 tablespoon'
    WHEN '2 muỗng canh' THEN '2 tablespoons'
    WHEN '4 lá' THEN '4'
    WHEN '2 quả' THEN '2'
    WHEN '4 quả' THEN '4'
    WHEN '1 gói' THEN '1 packet'
    WHEN '2 túi' THEN '2'
    WHEN '5 quả' THEN '5'
    ELSE quantity
  END;

UPDATE checklist_items checklist
JOIN recipe_ingredients ingredient
  ON ingredient.ingredient_name = CASE checklist.ingredient_name
    WHEN 'Bánh phở' THEN 'Rice noodles'
    WHEN 'Thịt bò tái' THEN 'Rare beef'
    WHEN 'Xương bò' THEN 'Beef bones'
    WHEN 'Hồi quế gừng hành' THEN 'Star anise, cinnamon, ginger, and onion'
    WHEN 'Bánh mì' THEN 'Baguettes'
    WHEN 'Chả lụa' THEN 'Vietnamese pork sausage'
    WHEN 'Đồ chua' THEN 'Pickled vegetables'
    WHEN 'Bánh tráng' THEN 'Rice paper wrappers'
    WHEN 'Tôm luộc' THEN 'Cooked shrimp'
    WHEN 'Thịt luộc' THEN 'Cooked pork'
    WHEN 'Rau sống và bún' THEN 'Fresh herbs and rice vermicelli'
    WHEN 'Cơm nguội' THEN 'Chilled rice'
    WHEN 'Trứng' THEN 'Eggs'
    WHEN 'Cơm trắng' THEN 'Steamed rice'
    WHEN 'Rau củ theo mùa' THEN 'Seasonal vegetables'
    WHEN 'Sốt gochujang' THEN 'Gochujang sauce'
    WHEN 'Cơm Nhật' THEN 'Japanese short-grain rice'
    WHEN 'Cá ngừ hộp' THEN 'Canned tuna'
    WHEN 'Rong biển' THEN 'Seaweed sheets'
    WHEN 'Đậu hũ non' THEN 'Silken tofu'
    WHEN 'Nấm' THEN 'Mushrooms'
    WHEN 'Rong biển wakame' THEN 'Wakame seaweed'
    WHEN 'Xoài chín' THEN 'Ripe mangoes'
    WHEN 'Sữa dừa' THEN 'Coconut milk'
    WHEN 'Trân châu nhỏ' THEN 'Small tapioca pearls'
    WHEN 'Trứng gà' THEN 'Eggs'
    WHEN 'Sữa tươi' THEN 'Fresh milk'
    WHEN 'Cà phê hòa tan' THEN 'Instant coffee'
    WHEN 'Đường' THEN 'Sugar'
    WHEN 'Trà đen' THEN 'Black tea bags'
    WHEN 'Tắc' THEN 'Kumquats'
    WHEN 'Mật ong' THEN 'Honey'
    ELSE checklist.ingredient_name
  END
SET
  checklist.ingredient_name = ingredient.ingredient_name,
  checklist.quantity = CASE checklist.quantity
    WHEN '1 phần' THEN '1 portion'
    WHEN '2 ổ' THEN '2'
    WHEN '1 chén' THEN '1 cup'
    WHEN '8 cái' THEN '8'
    WHEN '2 chén' THEN '2 cups'
    WHEN '2 quả' THEN '2'
    WHEN '1 muỗng canh' THEN '1 tablespoon'
    WHEN '2 muỗng canh' THEN '2 tablespoons'
    WHEN '4 lá' THEN '4'
    WHEN '4 quả' THEN '4'
    WHEN '1 gói' THEN '1 packet'
    WHEN '2 túi' THEN '2'
    WHEN '5 quả' THEN '5'
    ELSE checklist.quantity
  END;

UPDATE food_spots
SET
  category = CASE category
    WHEN 'Phở' THEN 'Pho'
    WHEN 'Bánh Mì' THEN 'Banh Mi'
    WHEN 'Cơm' THEN 'Rice'
    WHEN 'Bún' THEN 'Rice Vermicelli'
    WHEN 'Hải Sản' THEN 'Seafood'
    WHEN 'Café' THEN 'Cafe'
    WHEN 'Tráng Miệng' THEN 'Dessert'
    WHEN 'Khác' THEN 'Other'
    ELSE category
  END,
  district = CASE district
    WHEN 'Quận 1' THEN 'District 1'
    WHEN 'Quận 2' THEN 'District 2'
    WHEN 'Quận 3' THEN 'District 3'
    WHEN 'Quận 4' THEN 'District 4'
    WHEN 'Quận 5' THEN 'District 5'
    WHEN 'Quận 6' THEN 'District 6'
    WHEN 'Quận 7' THEN 'District 7'
    WHEN 'Quận 8' THEN 'District 8'
    WHEN 'Quận 9' THEN 'District 9'
    WHEN 'Quận 10' THEN 'District 10'
    WHEN 'Quận 11' THEN 'District 11'
    WHEN 'Quận 12' THEN 'District 12'
    WHEN 'Bình Thạnh' THEN 'Binh Thanh'
    WHEN 'Bình Tân' THEN 'Binh Tan'
    WHEN 'Gò Vấp' THEN 'Go Vap'
    WHEN 'Phú Nhuận' THEN 'Phu Nhuan'
    WHEN 'Tân Bình' THEN 'Tan Binh'
    WHEN 'Tân Phú' THEN 'Tan Phu'
    WHEN 'Thủ Đức' THEN 'Thu Duc'
    WHEN 'Thành phố Thủ Đức' THEN 'Thu Duc City'
    WHEN 'Bình Chánh' THEN 'Binh Chanh'
    WHEN 'Cần Giờ' THEN 'Can Gio'
    WHEN 'Củ Chi' THEN 'Cu Chi'
    WHEN 'Hóc Môn' THEN 'Hoc Mon'
    WHEN 'Nhà Bè' THEN 'Nha Be'
    ELSE district
  END;

UPDATE restaurants
SET
  category = CASE category
    WHEN 'Ăn Vặt' THEN 'Snacks'
    WHEN 'Bánh Canh' THEN 'Thick Noodle Soup'
    WHEN 'Bánh Cuốn' THEN 'Steamed Rice Rolls'
    WHEN 'Bánh Mì' THEN 'Banh Mi'
    WHEN 'Bánh Xèo' THEN 'Savory Pancakes'
    WHEN 'Bò' THEN 'Beef'
    WHEN 'Bún' THEN 'Rice Vermicelli'
    WHEN 'Bún Bò' THEN 'Beef Noodle Soup'
    WHEN 'Bún Đậu' THEN 'Tofu Vermicelli'
    WHEN 'Café' THEN 'Cafe'
    WHEN 'Cháo' THEN 'Congee'
    WHEN 'Chè' THEN 'Sweet Soup'
    WHEN 'Cơm' THEN 'Rice'
    WHEN 'Cơm Gà' THEN 'Chicken Rice'
    WHEN 'Cơm Tấm' THEN 'Broken Rice'
    WHEN 'Dimsum' THEN 'Dim Sum'
    WHEN 'Đặc Sản' THEN 'Specialties'
    WHEN 'Gà Nướng' THEN 'Grilled Chicken'
    WHEN 'Hải Sản' THEN 'Seafood'
    WHEN 'Hủ Tiếu' THEN 'Hu Tieu'
    WHEN 'Lẩu' THEN 'Hot Pot'
    WHEN 'Mì' THEN 'Noodles'
    WHEN 'Nem Nướng' THEN 'Grilled Pork Rolls'
    WHEN 'Nhà Hàng' THEN 'Restaurant'
    WHEN 'Phở' THEN 'Pho'
    WHEN 'Tráng Miệng' THEN 'Dessert'
    WHEN 'Xôi' THEN 'Sticky Rice'
    ELSE category
  END,
  district = CASE district
    WHEN 'Quận 1' THEN 'District 1'
    WHEN 'Quận 2' THEN 'District 2'
    WHEN 'Quận 3' THEN 'District 3'
    WHEN 'Quận 4' THEN 'District 4'
    WHEN 'Quận 5' THEN 'District 5'
    WHEN 'Quận 6' THEN 'District 6'
    WHEN 'Quận 7' THEN 'District 7'
    WHEN 'Quận 8' THEN 'District 8'
    WHEN 'Quận 9' THEN 'District 9'
    WHEN 'Quận 10' THEN 'District 10'
    WHEN 'Quận 11' THEN 'District 11'
    WHEN 'Quận 12' THEN 'District 12'
    WHEN 'Bình Thạnh' THEN 'Binh Thanh'
    WHEN 'Bình Tân' THEN 'Binh Tan'
    WHEN 'Gò Vấp' THEN 'Go Vap'
    WHEN 'Phú Nhuận' THEN 'Phu Nhuan'
    WHEN 'Tân Bình' THEN 'Tan Binh'
    WHEN 'Tân Phú' THEN 'Tan Phu'
    WHEN 'Thủ Đức' THEN 'Thu Duc'
    WHEN 'Thành phố Thủ Đức' THEN 'Thu Duc City'
    WHEN 'Bình Chánh' THEN 'Binh Chanh'
    WHEN 'Cần Giờ' THEN 'Can Gio'
    WHEN 'Củ Chi' THEN 'Cu Chi'
    WHEN 'Hóc Môn' THEN 'Hoc Mon'
    WHEN 'Nhà Bè' THEN 'Nha Be'
    ELSE district
  END;
