alter table public.other_info_items
  add column if not exists self_guided_sort_order integer null;

comment on column public.other_info_items.self_guided_sort_order is
  '排序位置於「自駕租車須知」的唯讀映射視圖；不影響原始 folder_id 與 sort_order。';
