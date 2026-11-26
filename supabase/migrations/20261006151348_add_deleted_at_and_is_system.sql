-- raw_logs.deleted_at: xoá mềm. DELETE /logs/{id} ghi thời điểm xoá vào đây,
-- các endpoint khác bỏ qua log có deleted_at khác null.
ALTER TABLE "public"."raw_logs"
  ADD COLUMN "deleted_at" timestamp with time zone;

-- Hầu hết truy vấn chỉ lấy log chưa xoá của 1 user
CREATE INDEX raw_logs_user_id_not_deleted_idx
  ON public.raw_logs USING btree (user_id)
  WHERE deleted_at IS NULL;

-- skills.is_system: skill có sẵn của hệ thống, mọi user đều dùng được.
-- Skill hệ thống không thuộc user nào nên user_id được phép null.
ALTER TABLE "public"."skills"
  ADD COLUMN "is_system" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."skills"
  ALTER COLUMN "user_id" DROP NOT NULL;

-- Skill thường phải có chủ; skill hệ thống thì không có chủ
ALTER TABLE "public"."skills"
  ADD CONSTRAINT "skills_owner_check"
  CHECK ((is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL));
