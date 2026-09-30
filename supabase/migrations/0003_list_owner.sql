-- Record the maker of each shared list. Existing rows remain editable for compatibility.
alter table public.shared_lists add column if not exists created_by text;
