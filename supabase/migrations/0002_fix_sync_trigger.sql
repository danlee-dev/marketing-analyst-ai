-- 0001 의 sync_workspace_from_project 가 folders 에서 new.folder_id 를 참조해 실패하던 문제.
-- plpgsql 은 "tg_table_name = 'posts' and new.folder_id ..." 를 한 식으로 계획하므로 테이블별로 IF 를 나눈다.
create or replace function public.sync_workspace_from_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select workspace_id into new.workspace_id from projects where id = new.project_id;
  if new.workspace_id is null then raise exception 'project not found'; end if;
  if tg_table_name = 'posts' then
    if new.folder_id is not null
       and not exists (select 1 from folders where id = new.folder_id and project_id = new.project_id) then
      raise exception 'folder not in project';
    end if;
  elsif tg_table_name = 'folders' then
    if new.parent_id is not null
       and not exists (select 1 from folders where id = new.parent_id and project_id = new.project_id) then
      raise exception 'parent folder not in project';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.sync_workspace_from_project() from public, anon, authenticated;
