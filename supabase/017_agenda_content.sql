-- Add an optional image to each agenda item. Run once.

alter table public.agenda_items
  add column if not exists image_url text;

alter table public.agenda_items
  drop constraint if exists agenda_items_image_url_format;

alter table public.agenda_items
  add constraint agenda_items_image_url_format check (
    image_url is null or image_url ~ '^https?://'
  );

select id, meeting_id, agenda_no, title, description, image_url, requires_vote, sort_order
from public.agenda_items
order by meeting_id, sort_order;
