-- 인스타 외 출처(YouTube, X, TikTok, 웹 페이지, 직접 업로드·메모)를 같은 posts 테이블에 담는다.
-- shortcode 는 출처 안의 외부 id 로 쓴다 (유튜브 video id, 트윗 id, URL 해시 등).

alter table public.posts
  add column source text not null default 'instagram'
    check (source in ('instagram', 'youtube', 'x', 'tiktok', 'web', 'upload')),
  add column format text not null default 'image'
    check (format in ('video', 'image', 'carousel', 'text', 'article', 'page', 'note')),
  add column body text not null default '',
  add column site text;

-- 기존 인스타 행의 형식 채우기
update public.posts set format = type where type in ('video', 'image', 'carousel');

alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts add constraint posts_type_check
  check (type in ('image', 'video', 'carousel', 'text', 'article', 'page', 'note'));

alter table public.posts drop constraint if exists posts_project_id_shortcode_key;
alter table public.posts add constraint posts_project_source_shortcode_key unique (project_id, source, shortcode);

create index if not exists posts_project_format_idx on public.posts (project_id, format);
