-- SAVE LIST AS and "last modified by" for the TEAM ELITE PH TSHIRT tally.
--
-- Run this once in the Supabase SQL Editor after 0001_shared_lists.sql.
-- Safe to re-run. Until it has run, the site still works: shared-store.js
-- falls back to the three original columns, so lists save but carry no
-- name or editor.

alter table public.shared_lists add column if not exists name text;
alter table public.shared_lists add column if not exists updated_by text;

update public.shared_lists set name = 'Shared list' where id = 'main' and name is null;

-- Lets the lists page delete a saved list.
drop policy if exists "shared delete" on public.shared_lists;
create policy "shared delete" on public.shared_lists for delete to anon using (true);

-- The three policies from 0001 already allow anon select / insert / update
-- on every row, which is what lets SAVE LIST AS add rows and everyone open
-- them. If you applied the tightened "id = 'main'" policies, widen them again:
--
--   drop policy if exists "shared read"   on public.shared_lists;
--   drop policy if exists "shared insert" on public.shared_lists;
--   drop policy if exists "shared update" on public.shared_lists;
--   create policy "shared read"   on public.shared_lists for select to anon using (true);
--   create policy "shared insert" on public.shared_lists for insert to anon with check (true);
--   create policy "shared update" on public.shared_lists for update to anon using (true) with check (true);
