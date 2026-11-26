ALTER TABLE "public"."raw_logs"
  DROP CONSTRAINT "raw_logs_check";

ALTER TABLE "public"."raw_logs"
  DROP COLUMN "done_at";

ALTER TABLE "public"."profiles"
  ADD COLUMN "obd_completed" boolean;

ALTER TABLE "public"."raw_logs"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp WITH time zone;

ALTER TABLE "public"."skills"
  ADD COLUMN IF NOT EXISTS "is_system" boolean;

ALTER TABLE "public"."skills"
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE VIEW "public"."goal_stats" WITH (security_invoker=true) AS  SELECT g.id,
    g.user_id,
    g.title,
    g.description,
    g.start_date,
    g.end_date,
    g.created_at,
    count(l.id) FILTER (WHERE (l.deleted_at IS NULL)) AS logs_count,
    count(l.id) FILTER (WHERE ((l.deleted_at IS NULL) AND l.is_achievement)) AS achievements_count
   FROM (public.goals g
     LEFT JOIN public.raw_logs l ON ((l.goal_id = g.id)))
  GROUP BY g.id;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."goal_stats" TO "anon", "authenticated", "postgres", "service_role";

