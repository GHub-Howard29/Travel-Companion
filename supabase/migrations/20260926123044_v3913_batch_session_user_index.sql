begin;

create index commons_candidate_batch_sessions_user_id_idx
  on public.commons_candidate_batch_sessions (user_id);

commit;
