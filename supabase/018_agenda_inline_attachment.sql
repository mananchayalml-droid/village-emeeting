-- Let an agenda contain one inline image or PDF summary.

alter table public.agenda_items
  add column if not exists image_url text,
  add column if not exists content_type text,
  add column if not exists content_url text;

update public.agenda_items
set content_type = 'image',
    content_url = image_url
where image_url is not null
  and content_url is null;

alter table public.agenda_items
  drop constraint if exists agenda_items_content_type_check,
  drop constraint if exists agenda_items_content_url_format,
  drop constraint if exists agenda_items_content_pair_check;

alter table public.agenda_items
  add constraint agenda_items_content_type_check check (
    content_type is null or content_type in ('image', 'pdf')
  ),
  add constraint agenda_items_content_url_format check (
    content_url is null or content_url ~ '^https?://'
  ),
  add constraint agenda_items_content_pair_check check (
    (content_type is null and content_url is null)
    or (content_type is not null and content_url is not null)
  );

select id, meeting_id, agenda_no, title, content_type, content_url
from public.agenda_items
order by meeting_id, sort_order;
