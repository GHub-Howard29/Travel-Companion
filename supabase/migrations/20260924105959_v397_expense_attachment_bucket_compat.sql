-- The attachment client contract already writes this field. Older local
-- baselines can have attachment_path without its bucket discriminator.

begin;

alter table public.expenses
  add column if not exists attachment_path text,
  add column if not exists attachment_bucket text;

update public.expenses
set attachment_bucket = 'expense-attachments'
where attachment_bucket is null and attachment_path is not null;

alter table public.expenses
  alter column attachment_bucket set default 'expense-attachments';

alter table public.expenses
  drop constraint if exists expenses_attachment_bucket_check;

alter table public.expenses
  add constraint expenses_attachment_bucket_check check (
    attachment_bucket is null or attachment_bucket = 'expense-attachments'
  );

commit;
