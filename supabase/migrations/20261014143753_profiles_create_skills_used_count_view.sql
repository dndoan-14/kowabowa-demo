-- View đếm số skill khác nhau mỗi user đã dùng trong log chưa xóa
-- GET /profiles đọc view này để trả skills_count cho FE (FE không gọi thẳng view)
create view skills_used_count with (security_invoker = true) as
select user_id,
  count(distinct skill_id) as skills_count
from raw_logs
where deleted_at is null
group by user_id;
