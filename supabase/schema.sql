-- Love Bites family backend. Run once in the Supabase SQL editor.
-- Sign-ups are switched off in the dashboard, so every signed-in user is an invited family member.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  updated_at timestamptz not null default now()
);

-- Each person's own cookbook, plan, pantry and lists: the same shape as a backup file.
create table if not exists public.user_state (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null check (pg_column_size(data) < 8000000),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recipe_id text not null,
  title text not null check (char_length(title) <= 200),
  image text,
  -- Only for recipes someone imported or wrote themselves; catalogue recipes are already in everyone's app.
  recipe jsonb check (recipe is null or pg_column_size(recipe) < 200000),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now()
);
create index if not exists family_shares_created on public.family_shares (created_at desc);

create table if not exists public.family_loves (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recipe_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.family_shares enable row level security;
alter table public.family_loves enable row level security;

grant select, insert, update, delete on public.profiles, public.user_state, public.family_shares, public.family_loves to authenticated;
revoke all on public.profiles, public.user_state, public.family_shares, public.family_loves from anon;

-- Family can see each other's names, shares and loves. Everyone changes only their own rows.
create policy "family reads profiles" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own state only" on public.user_state for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "family reads shares" on public.family_shares for select to authenticated using (true);
create policy "own shares insert" on public.family_shares for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own shares delete" on public.family_shares for delete to authenticated using (user_id = (select auth.uid()));

create policy "family reads loves" on public.family_loves for select to authenticated using (true);
create policy "own loves insert" on public.family_loves for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own loves delete" on public.family_loves for delete to authenticated using (user_id = (select auth.uid()));
