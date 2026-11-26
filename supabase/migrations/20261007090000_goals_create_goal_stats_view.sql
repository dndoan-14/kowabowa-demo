create or replace view goal_stats with (security_invoker = true) as
select g.*,
  count(l.id) filter (where l.deleted_at is null)                      as logs_count,
  count(l.id) filter (where l.deleted_at is null and l.is_achievement) as achievements_count
from goals g
left join raw_logs l on l.goal_id = g.id
group by g.id;