-- Remove legacy topics + topic_queries schema (replaced by episode plans).

drop trigger if exists seed_topics_on_user_created on auth.users;
drop function if exists public.seed_topics_for_new_user();

alter table if exists public.onboarding_transcripts
  drop column if exists extracted_topics;

drop table if exists public.topic_queries;

drop index if exists public.idx_llm_usage_events_topic_id;
alter table if exists public.llm_usage_events
  drop column if exists topic_id;

drop table if exists public.topics;
