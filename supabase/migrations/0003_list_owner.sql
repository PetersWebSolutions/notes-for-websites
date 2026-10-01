-- Record the maker of each shared list for the owner-only UI.
-- Existing rows have no reliable creator history, so created_by remains NULL
-- until an administrator assigns the correct owner. The site treats NULL as
-- view-only; it never grants editing because ownership is unknown.
alter table public.shared_lists add column if not exists created_by text;
