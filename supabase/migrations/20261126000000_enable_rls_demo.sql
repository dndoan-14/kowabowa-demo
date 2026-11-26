-- Kowabowa demo: bật Row Level Security cho bản deploy riêng.
-- Mỗi user chỉ đọc/ghi được dữ liệu của chính mình; skill hệ thống (is_system) ai cũng đọc được.
-- Edge Functions gọi DB bằng token của user (role authenticated) nên vẫn chạy bình thường.
-- Riêng function skills dùng service_role nên không bị RLS chặn; nó tự lọc theo user.id.

-- Khách chưa đăng nhập (anon) không được đụng vào bảng nào.
REVOKE ALL ON TABLE public.goals, public.raw_logs, public.skills, public.profiles, public.goal_stats FROM anon;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills   ENABLE ROW LEVEL SECURITY;

-- profiles: dòng được tạo bởi trigger khi đăng ký; user chỉ xem và sửa hồ sơ của mình
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- goals
CREATE POLICY "goals_own" ON public.goals
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- raw_logs
CREATE POLICY "raw_logs_own" ON public.raw_logs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- skills: đọc của mình + skill hệ thống; ghi chỉ skill của mình
CREATE POLICY "skills_select_own_or_system" ON public.skills
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_system);
CREATE POLICY "skills_write_own" ON public.skills
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND NOT is_system);
CREATE POLICY "skills_update_own" ON public.skills
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND NOT is_system);
CREATE POLICY "skills_delete_own" ON public.skills
  FOR DELETE TO authenticated USING (user_id = auth.uid());
