-- Dữ liệu mẫu cho database local.
-- Tự chạy sau migrations khi `supabase db reset` (xem [db.seed] trong config.toml).
-- Chạy được nhiều lần: id cố định + ON CONFLICT DO NOTHING.
--
-- Tài khoản test (mật khẩu: password123):
--   test1@kowabowa.local  -> có goals, skills, logs
--   test2@kowabowa.local  -> user khác, dùng để test không xem/sửa được dữ liệu của test1

-- =====================================================================
-- USERS
-- =====================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'test1@kowabowa.local',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'test2@kowabowa.local',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Identity để đăng nhập bằng email + mật khẩu
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'email',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"test1@kowabowa.local","email_verified":true}',
   now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'email',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"test2@kowabowa.local","email_verified":true}',
   now(), now(), now())
ON CONFLICT DO NOTHING;

-- Thường trigger on_auth_user_created tự tạo profile, nhưng local có thể không có trigger
-- trên auth.users, nên tạo luôn ở đây cho chắc.
INSERT INTO public.profiles (id, email, display_name, username)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'test1@kowabowa.local', 'Test One', 'test1'),
  ('22222222-2222-2222-2222-222222222222', 'test2@kowabowa.local', 'Test Two', 'test2')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, username = EXCLUDED.username;

-- =====================================================================
-- GOALS
-- =====================================================================

INSERT INTO public.goals (id, user_id, title, description, start_date, end_date)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Học TypeScript', 'Nắm vững TypeScript trong quý này', '2026-09-01', '2026-12-31'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Chạy bộ 10km', NULL, '2026-09-15', '2026-11-30'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   'Goal của test2', NULL, '2026-09-01', '2026-12-31')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- SKILLS
-- =====================================================================

INSERT INTO public.skills (id, user_id, title, description, is_system)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Lập trình', NULL, false),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Thể lực', NULL, false),
  ('bbbbbbbb-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Skill của test2', NULL, false),
  -- Skill hệ thống: không thuộc user nào, ai cũng dùng được
  ('bbbbbbbb-0000-0000-0000-000000000004', NULL, 'Giao tiếp', NULL, true),
  ('bbbbbbbb-0000-0000-0000-000000000005', NULL, 'Quản lý thời gian', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- LOGS
-- =====================================================================

INSERT INTO public.raw_logs (id, user_id, goal_id, skill_id, title, description, is_achievement, logged_at)
VALUES
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'Đọc chương Generics', 'Hiểu được generic constraints', false, '2026-09-26T16:00:00+07:00'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'Hoàn thành project nhỏ đầu tiên', NULL, true, '2026-09-28T20:30:00+07:00'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', NULL,
   'Xem video về utility types', NULL, false, '2026-10-01T09:00:00+07:00'),
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'Chạy 5km', NULL, false, '2026-09-20T06:00:00+07:00'),
  ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'Lần đầu chạy được 8km', 'Không nghỉ giữa chừng', true, '2026-10-04T06:00:00+07:00'),
  ('cccccccc-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003',
   'Log của test2', NULL, false, '2026-10-02T10:00:00+07:00'),
  ('cccccccc-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000004',
   'Thuyết trình về TypeScript', NULL, false, '2026-10-05T14:00:00+07:00')
ON CONFLICT (id) DO NOTHING;

-- Log đã xoá mềm: API phải trả 404 và không tính vào bộ đếm
INSERT INTO public.raw_logs (id, user_id, goal_id, title, is_achievement, logged_at, deleted_at)
VALUES
  ('cccccccc-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Log đã xoá', true,
   '2026-09-30T08:00:00+07:00', '2026-10-01T08:00:00+07:00')
ON CONFLICT (id) DO NOTHING;
