-- Shared list backend for the TEAM ELITE PH TSHIRT tally.
--
-- Run this once in the Supabase SQL Editor of the project named in
-- supabase-config.js. It is the canonical copy of the schema: README.md points
-- here rather than carrying its own block, so the two cannot drift.
--
-- Safe to re-run: the table is created only if missing, the seed row only if
-- absent, and each policy is dropped and recreated.

create table if not exists public.shared_lists (
  id text primary key,
  people jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

insert into public.shared_lists (id, people)
  values ('main', '[]')
  on conflict (id) do nothing;

alter table public.shared_lists enable row level security;

drop policy if exists "shared read"   on public.shared_lists;
drop policy if exists "shared insert" on public.shared_lists;
drop policy if exists "shared update" on public.shared_lists;

create policy "shared read"   on public.shared_lists for select to anon using (true);
create policy "shared insert" on public.shared_lists for insert to anon with check (true);
create policy "shared update" on public.shared_lists for update to anon using (true) with check (true);

-- Tighten later, if the list should stop being open to every visitor.
-- These three replace the ones above and confine the anon role to the one row
-- the site actually uses (supabase-config.js → listId), so a stranger cannot
-- read or write any other row even if one is ever added:
--
--   drop policy if exists "shared read"   on public.shared_lists;
--   drop policy if exists "shared insert" on public.shared_lists;
--   drop policy if exists "shared update" on public.shared_lists;
--
--   create policy "shared read"   on public.shared_lists for select to anon
--     using (id = 'main');
--   create policy "shared insert" on public.shared_lists for insert to anon
--     with check (id = 'main');
--   create policy "shared update" on public.shared_lists for update to anon
--     using (id = 'main') with check (id = 'main');
--
-- Real per-person privacy needs Supabase Auth plus policies on auth.uid(),
-- which is a separate piece of work; see README.md → "Shared list (Supabase)".
