Recipe cleaned package
======================

Files:
- recipe_cleaned.csv: same schema as the uploaded CSV, ready for DB import.
- recipe-images/: 121 SVG cover images. Each image path in image_url starts with /recipe-images/...

How to use in a Vite/Vue project:
1. Copy the folder recipe-images into your frontend public folder: frontend/public/recipe-images/
2. Import recipe_cleaned.csv into your database.
3. In the frontend, use image_url directly in <img :src="recipe.image_url">.

Notes:
- Text fields were rewritten so recipe_notes, blog_intro, description, and instructions match the title.
- Images are generated local SVG covers, not external stock-photo links, so they will not randomly change or break.
