-- Add per-user topic ordering to control episode flow
alter table public.topics
  add column if not exists order_index integer not null default 0;

-- Backfill existing topics with stable order based on created_at
update public.topics t
set order_index = sub.rn - 1
from (
  select id, row_number() over (partition by user_id order by created_at asc) as rn
  from public.topics
) sub
where sub.id = t.id
  and t.order_index = 0;

create index if not exists idx_topics_user_order on public.topics (user_id, order_index);
