SET local check_function_bodies = off;
CREATE TABLE "public"."goals" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "title"       text                     NOT NULL,
  "description" text,
  "start_date"  date                     NOT NULL,
  "end_date"    date                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "goals_check" CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))),
  CONSTRAINT "goals_pkey" PRIMARY KEY (id)
);
CREATE TABLE "public"."profiles" (
  "id"           uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "display_name" text,
  "email"        text                     NOT NULL,
  "username"     text,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_username_key" UNIQUE (username)
);
CREATE TABLE "public"."raw_logs" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid                     NOT NULL,
  "goal_id"        uuid,
  "skill_id"       uuid,
  "title"          text                     NOT NULL,
  "description"    text,
  "is_achievement" boolean                  NOT NULL DEFAULT false,
  "done_at"        timestamp with time zone,
  "logged_at"      timestamp with time zone NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "raw_logs_check" CHECK ((is_achievement OR (done_at IS NULL))),
  CONSTRAINT "raw_logs_pkey" PRIMARY KEY (id)
);
CREATE TABLE "public"."skills" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "title"       text                     NOT NULL,
  "description" text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "skills_pkey" PRIMARY KEY (id)
);
CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;$function$;
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id);
ALTER TABLE "public"."goals"
  ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."raw_logs"
  ADD CONSTRAINT "raw_logs_goal_id_fkey" FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;
ALTER TABLE "public"."raw_logs"
  ADD CONSTRAINT "raw_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."raw_logs"
  ADD CONSTRAINT "raw_logs_skill_id_fkey" FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE SET NULL;
ALTER TABLE "public"."skills"
  ADD CONSTRAINT "skills_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE INDEX goals_user_id_idx ON public.goals USING btree (user_id);
CREATE INDEX raw_logs_goal_id_idx ON public.raw_logs USING btree (goal_id);
CREATE INDEX raw_logs_skill_id_idx ON public.raw_logs USING btree (skill_id);
CREATE INDEX raw_logs_user_id_idx ON public.raw_logs USING btree (user_id);
CREATE INDEX skills_user_id_idx ON public.skills USING btree (user_id);
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_for_new_user();
GRANT EXECUTE ON FUNCTION "public"."create_profile_for_new_user"() TO PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."create_profile_for_new_user"() FROM "postgres";
GRANT EXECUTE ON FUNCTION "public"."create_profile_for_new_user"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."create_profile_for_new_user"() TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."goals" TO "anon", "authenticated";
REVOKE ALL ON TABLE "public"."goals" FROM "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."goals" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."goals" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";
REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."raw_logs" TO "anon", "authenticated";
REVOKE ALL ON TABLE "public"."raw_logs" FROM "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."raw_logs" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."raw_logs" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."skills" TO "anon", "authenticated";
REVOKE ALL ON TABLE "public"."skills" FROM "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."skills" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."skills" TO "service_role";
