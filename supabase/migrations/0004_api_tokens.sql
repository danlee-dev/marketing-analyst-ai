-- 로컬 Claude(Claude Code / Desktop)가 MCP 로 붙을 때 쓰는 개인 토큰. 원문은 저장하지 않고 sha256 만.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Claude' check (char_length(name) between 1 and 40),
  token_hash text not null unique,
  prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;
create policy tok_select on public.api_tokens for select to authenticated using (user_id = auth.uid());
create policy tok_insert on public.api_tokens for insert to authenticated with check (user_id = auth.uid());
create policy tok_delete on public.api_tokens for delete to authenticated using (user_id = auth.uid());
revoke all on public.api_tokens from anon;
