# 레퍼런스 보관함 (marketing-analyst-ai)

인스타·YouTube·X·TikTok·웹 레퍼런스를 워크스페이스/프로젝트/폴더로 모으고, zip 으로 내려받거나 내 Claude 에 MCP 로 연결해 분석하는 팀 도구.

- 링크를 붙여넣으면 사진·영상, 캡션, 계정 정보, 원본 링크를 저장
- 영상은 Soniox 로 전사하고, 브라우저에서 YAMNet 으로 각 줄을 말 / 노래 / 말+배경음악으로 표시
- DM 으로 받은 파일을 게시물에 첨부 (카드나 상세 화면에 끌어 놓기)
- 여러 게시물을 골라 `날짜_계정_제목/` 폴더 구조의 zip 으로 받기 (post.md, caption.txt, transcript.txt, meta.json, media/, attachments/, INDEX.md)

## 구조

- Next.js 16 (App Router) on Vercel, 별도 백엔드 없음
- 저장: Vercel Blob (private). 게시물마다 `posts/<shortcode>/meta.json`
- 인스타 조회: 비로그인 단일 게시물 GraphQL (instaloader 방식). `src/lib/instagram.ts`
- 전사: Soniox async, 줄 나누기는 lectranscribe 튜닝값. `src/lib/soniox.ts`
- 말/노래 판별: YAMNet tfjs (`public/models/yamnet`, Apache 2.0) 브라우저 실행. `src/lib/client/audio.ts`, `src/lib/classify.ts`
- 접근: `APP_PASSWORD` 하나로 잠금 (`src/proxy.ts`)

## 환경변수

`BLOB_READ_WRITE_TOKEN`, `SONIOX_API_KEY`, `APP_PASSWORD`, `AUTH_SECRET` (선택: `SONIOX_MODEL`)

```bash
vercel env pull .env.local
pnpm dev
```

## 출처별 수집

| 출처 | 저장 내용 | 방식 |
|---|---|---|
| Instagram | 사진·영상, 캡션, 계정, 지표 | 비로그인 doc_id GraphQL |
| YouTube | 제목, 채널, 썸네일, 자막 | oEmbed + Supadata (`SUPADATA_API_KEY`) |
| X | 글, 사진·영상, 작성자, 지표 | 공개 syndication 엔드포인트 |
| TikTok | 제목, 작성자, 썸네일 | oEmbed |
| 웹 | 본문 마크다운, 대표 이미지 | Readability + turndown (내부망 주소 차단) |
| 직접 추가 | 캡처·파일·메모 | Blob 업로드 |

## 내 Claude 연결 (MCP)

사이트 사이드바의 "내 Claude 연결"에서 토큰을 만든 뒤:

```bash
claude mcp add --scope user --transport http reference-box https://<도메인>/api/mcp --header "Authorization: Bearer <토큰>"
```

도구: `list_workspaces`, `list_projects`, `list_references`, `get_reference`(본문·전사·이미지), `get_media_links`(원본 영상·사진 임시 링크), `search_references`, `save_note`, `add_reference`.

영상 화면 분석: Claude Code 가 `get_media_links` 로 받은 서명 링크(`/api/dl`, 기본 1시간, HMAC)로 영상을 내려받아 로컬 ffmpeg 로 프레임을 나눠 본다. 서버는 파일만 내준다.
분석은 사용자 쪽 Claude 가 하므로 서버에서 Claude API 를 호출하지 않는다. 토큰은 sha256 만 저장(`api_tokens`), 모든 도구는 워크스페이스 멤버십으로 범위를 제한한다.
