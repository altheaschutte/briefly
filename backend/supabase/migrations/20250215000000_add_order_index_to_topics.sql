-- Add order_index to topics for user-controlled ordering
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topics'
      and column_name = 'order_index'
  ) then
    alter table public.topics add column order_index integer not null default 0;

    -- Seed order_index based on creation order per user
    update public.topics t
    set order_index = sub.rn - 1
    from (
      select id, row_number() over (partition by user_id order by created_at) as rn
      from public.topics
    ) sub
    where sub.id = t.id;

    create index if not exists idx_topics_user_order on public.topics (user_id, order_index);
  end if;
end $$;
