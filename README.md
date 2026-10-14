# 레퍼런스 보관함 (marketing-analyst-ai)

인스타그램 공개 게시물을 링크로 모아 두고, 분석용 묶음(zip)으로 내려받는 1인용 도구.

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
