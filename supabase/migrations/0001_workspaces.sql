-- 워크스페이스 > 프로젝트 > 폴더 > 게시물. 모든 접근은 워크스페이스 멤버십으로 판정한다.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);
-- 멤버 목록에 이름·이메일을 붙여 읽으려고 profiles 로도 연결 (PostgREST embed)
alter table public.workspace_members
  add constraint workspace_members_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  role text not null default 'member' check (role in ('owner', 'member')),
  created_by uuid not null default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  revoked boolean not null default false
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  position double precision not null default extract(epoch from now()),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index on public.projects (workspace_id);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  parent_id uuid references public.folders on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now()
);
create index on public.folders (project_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  folder_id uuid references public.folders on delete set null,
  shortcode text not null,
  url text not null,
  title text not null,
  account jsonb not null,
  caption text not null default '',
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  taken_at timestamptz not null,
  type text not null check (type in ('image', 'video', 'carousel')),
  likes bigint,
  comments bigint,
  views bigint,
  music text,
  location text,
  media jsonb not null default '[]',
  thumb_path text,
  transcripts jsonb not null default '[]',
  attachments jsonb not null default '[]',
  note text not null default '',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, shortcode)
);
create index on public.posts (project_id, created_at desc);
create index on public.posts (folder_id);

-- 멤버십 판정. RLS 안에서 재귀를 피하려고 security definer.
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function public.is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner');
$$;

-- 가입 시 프로필, 워크스페이스 생성 시 만든 사람을 owner 로
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_new_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into workspace_members (workspace_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger on_workspace_created after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- 폴더·게시물의 workspace_id 는 프로젝트에서 가져온다 (다른 워크스페이스 프로젝트에 끼워 넣기 방지)
create or replace function public.sync_workspace_from_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select workspace_id into new.workspace_id from projects where id = new.project_id;
  if new.workspace_id is null then raise exception 'project not found'; end if;
  if tg_table_name = 'posts' and new.folder_id is not null
     and not exists (select 1 from folders where id = new.folder_id and project_id = new.project_id) then
    raise exception 'folder not in project';
  end if;
  if tg_table_name = 'folders' and new.parent_id is not null
     and not exists (select 1 from folders where id = new.parent_id and project_id = new.project_id) then
    raise exception 'parent folder not in project';
  end if;
  return new;
end $$;
create trigger folders_sync_ws before insert or update on public.folders
  for each row execute function public.sync_workspace_from_project();
create trigger posts_sync_ws before insert or update on public.posts
  for each row execute function public.sync_workspace_from_project();

-- 초대 링크: 토큰으로 워크스페이스 이름 미리보기, 수락
create or replace function public.invite_info(invite_token text)
returns table (workspace_id uuid, workspace_name text, valid boolean)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, (not i.revoked and i.expires_at > now())
  from workspace_invites i join workspaces w on w.id = i.workspace_id
  where i.token = invite_token;
$$;

create or replace function public.accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv workspace_invites;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into inv from workspace_invites where token = invite_token;
  if inv.id is null or inv.revoked or inv.expires_at < now() then
    raise exception 'invalid invite';
  end if;
  insert into workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do nothing;
  return inv.workspace_id;
end $$;

-- public 스키마 함수는 anon 에도 기본 grant 되므로 명시적으로 걷어낸다
revoke all on function public.is_member(uuid), public.is_owner(uuid), public.invite_info(text), public.accept_invite(text),
  public.handle_new_user(), public.handle_new_workspace(), public.sync_workspace_from_project() from public, anon;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.invite_info(text), public.accept_invite(text)
  to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.projects enable row level security;
alter table public.folders enable row level security;
alter table public.posts enable row level security;

-- 같은 워크스페이스 사람끼리 이름·이메일을 볼 수 있다
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from workspace_members a join workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

create policy ws_select on public.workspaces for select to authenticated using (public.is_member(id));
create policy ws_insert on public.workspaces for insert to authenticated with check (created_by = auth.uid());
create policy ws_update on public.workspaces for update to authenticated using (public.is_owner(id));
create policy ws_delete on public.workspaces for delete to authenticated using (public.is_owner(id));

create policy wm_select on public.workspace_members for select to authenticated using (public.is_member(workspace_id));
create policy wm_update on public.workspace_members for update to authenticated using (public.is_owner(workspace_id));
create policy wm_delete on public.workspace_members for delete to authenticated
  using (public.is_owner(workspace_id) or user_id = auth.uid());

create policy wi_select on public.workspace_invites for select to authenticated using (public.is_member(workspace_id));
create policy wi_insert on public.workspace_invites for insert to authenticated
  with check (public.is_member(workspace_id) and created_by = auth.uid() and (role = 'member' or public.is_owner(workspace_id)));
create policy wi_update on public.workspace_invites for update to authenticated using (public.is_member(workspace_id));

create policy pj_all on public.projects for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy fd_all on public.folders for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy po_all on public.posts for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- 비로그인(anon) 은 아무 테이블도 못 본다
revoke all on all tables in schema public from anon;
