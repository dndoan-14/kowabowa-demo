-- Kowabowa demo: khách chưa đăng nhập không đọc view skills_used_count.
-- View dùng security_invoker nên vẫn theo RLS của raw_logs cho user đã đăng nhập.
REVOKE ALL ON TABLE public.skills_used_count FROM anon;
