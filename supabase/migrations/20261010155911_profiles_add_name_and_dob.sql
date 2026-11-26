-- add thêm các trường first_name, last_name, date_of_birth vào profile table
ALTER TABLE "public"."profiles"
    ADD COLUMN IF NOT EXISTS "first_name" text,
    ADD COLUMN IF NOT EXISTS "last_name" text,
    ADD COLUMN IF NOT EXISTS "date_of_birth" date;