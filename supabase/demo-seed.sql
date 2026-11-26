-- Kowabowa demo: dữ liệu mẫu cho tài khoản demo.
-- Cách dùng: Supabase (project kowabowa-demo) → SQL Editor → dán toàn bộ file → Run.
-- 1. Đổi email ở dòng demo_email bên dưới nếu anh đăng ký bằng email khác.
-- 2. Chạy lại bất cứ lúc nào để đưa dữ liệu demo về trạng thái ban đầu
--    (script xoá goal, log, skill cũ của RIÊNG tài khoản này rồi tạo lại).

DO $$
DECLARE
  demo_email text := 'vn.duongdoan+kowabowa@gmail.com';
  uid uuid;
  g1 uuid; g2 uuid; g3 uuid;
  s_research uuid; s_data uuid; s_comm uuid; s_lead uuid; s_ai uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = demo_email;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản %. Hãy đăng ký trên app trước, hoặc sửa demo_email.', demo_email;
  END IF;

  -- Hồ sơ: tạo nếu thiếu (tài khoản đăng ký trước khi có database), bỏ qua onboarding
  INSERT INTO public.profiles (id, email) VALUES (uid, demo_email) ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles
     SET first_name = 'Demo', last_name = 'User', display_name = 'Demo User', obd_completed = true
   WHERE id = uid;

  -- Xoá dữ liệu cũ của riêng tài khoản demo
  DELETE FROM public.raw_logs WHERE user_id = uid;
  DELETE FROM public.goals    WHERE user_id = uid;
  DELETE FROM public.skills   WHERE user_id = uid;

  -- Skills
  INSERT INTO public.skills (user_id, title, description, is_system) VALUES
    (uid, 'User research', 'Interviews, usability tests, synthesis', false) RETURNING id INTO s_research;
  INSERT INTO public.skills (user_id, title, description, is_system) VALUES
    (uid, 'Product analytics', 'Funnels, cohorts, Mixpanel', false) RETURNING id INTO s_data;
  INSERT INTO public.skills (user_id, title, description, is_system) VALUES
    (uid, 'Stakeholder communication', NULL, false) RETURNING id INTO s_comm;
  INSERT INTO public.skills (user_id, title, description, is_system) VALUES
    (uid, 'Team leadership', NULL, false) RETURNING id INTO s_lead;
  INSERT INTO public.skills (user_id, title, description, is_system) VALUES
    (uid, 'AI-assisted building', 'Claude Code, prompts, automation', false) RETURNING id INTO s_ai;

  -- Goals
  INSERT INTO public.goals (user_id, title, description, start_date, end_date) VALUES
    (uid, 'Improve new-user onboarding', 'Lift D1 adoption for new sign-ups this quarter',
     (current_date - 60), (current_date + 30)) RETURNING id INTO g1;
  INSERT INTO public.goals (user_id, title, description, start_date, end_date) VALUES
    (uid, 'Get confident with SQL for product analytics', 'Answer my own data questions without waiting for engineers',
     (current_date - 45), (current_date + 45)) RETURNING id INTO g2;
  INSERT INTO public.goals (user_id, title, description, start_date, end_date) VALUES
    (uid, 'Ship an internal tool with AI', 'Build and hand over one small tool that teammates actually use',
     (current_date - 30), (current_date + 60)) RETURNING id INTO g3;

  -- Logs (một vài log là achievement)
  INSERT INTO public.raw_logs (user_id, goal_id, skill_id, title, description, is_achievement, logged_at) VALUES
    (uid, g1, s_data,     'Mapped the onboarding funnel in Mixpanel', 'Found the biggest drop between account creation and first plan', false, now() - interval '55 days'),
    (uid, g1, s_research, 'Interviewed 4 users who dropped after day 1', 'Three said they did not understand why planning matters', false, now() - interval '48 days'),
    (uid, g1, s_comm,     'Presented findings and onboarding options to the founder', NULL, false, now() - interval '40 days'),
    (uid, g1, s_lead,     'Ran a design critique on the new onboarding flow', NULL, false, now() - interval '33 days'),
    (uid, g1, s_data,     'New onboarding lifted D1 adoption in the first cohort', 'Kept activation as a guardrail metric', true, now() - interval '12 days'),
    (uid, g2, s_data,     'Finished a SQL course module on joins', NULL, false, now() - interval '40 days'),
    (uid, g2, s_data,     'Wrote my first retention query on Supabase', NULL, true, now() - interval '21 days'),
    (uid, g2, s_data,     'Answered a weekly metrics question without engineering help', NULL, false, now() - interval '6 days'),
    (uid, g3, s_ai,       'Listed the three most repetitive tasks in the team', NULL, false, now() - interval '28 days'),
    (uid, g3, s_ai,       'Built a UAT checklist generator with Claude', 'Design team started using it for releases', true, now() - interval '15 days'),
    (uid, g3, s_comm,     'Wrote a one-page playbook for the new checklist', NULL, false, now() - interval '9 days'),
    (uid, g3, s_ai,       'Collected feedback and shipped v2 of the checklist', NULL, false, now() - interval '2 days');
END $$;
