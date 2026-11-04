# 인스타 게시물: 로그인된 탭에서 가져오기

상태: 설계 (2026-11-05)

## 배경

- 서버의 `fetchIgPost`(`src/lib/instagram.ts`)는 로그인 없이 인스타 GraphQL(doc_id)을 호출한다.
- 2026-11-05 확인: 같은 요청이 모든 게시물에서 401 `{"message":"Please wait a few minutes before you try again.","require_login":true}`. 전에 잘 저장된 게시물(DeeYVP8NpCk, DeEPgsQkdR3)도 같다. 비로그인으로 연 게시물 페이지도 메타 태그 없는 로그인 벽만 온다.
- 일시 제한인지 정책 변경인지는 모른다. 어느 쪽이든 서버 단독 조회에 기대면 언제든 다시 막힌다.
- 사용자는 브라우저에서 로그인한 채 게시물을 보고 있다. 그런데 익스텐션이 URL 문자열만 서버로 보내서 그 로그인이 쓰이지 않는다.

## 결정

인스타 게시물 정보(item JSON)는 익스텐션이 사용자의 인스타 탭 안에서 조회하고, 서버는 받은 item 을 파싱하고 미디어를 내려받아 저장하는 일만 한다. 조회는 instagram.com 에 이미 주입되는 content script(`extension/content/instagram.js`)가 같은 출처 fetch 로 한다. 그래서 브라우저가 로그인 쿠키를 알아서 붙이고, 매니페스트 권한은 늘지 않는다. 서버의 비로그인 조회는 item 이 없을 때만 쓰는 fallback 으로 남기되, 401 에서는 재시도하지 않는다.

서버로 보내는 건 정규화한 결과가 아니라 인스타가 준 원본 item 이다. 파싱은 지금처럼 서버 한 곳(`parseIgItem`)에서만 한다. 익스텐션과 서버에 파서가 두 벌 생기면 인스타 응답이 바뀔 때 둘이 어긋난다.

## 흐름

```
[인스타 탭] content/instagram.js
   같은 출처 fetch (브라우저가 로그인 쿠키를 붙임)
   -> item JSON
        | chrome.runtime 메시지
        v
[background.js] saveOne({ url, igItem })
        | POST /api/ext/save { url, igItem, note, screenshot, transcribe }
        v
[서버] ingestLink(..., igItem)
   parseIgItem(item) -> Collected
   미디어(CDN 서명 URL) 다운로드 -> Blob
   posts insert, 영상 전사
```

## 바뀌는 곳

서버

- `src/lib/instagram.ts`: `fetchIgPost` 를 `fetchIgItem(shortcode)`(네트워크)와 `parseIgItem(item)`(순수 함수)로 나눈다. 401 / `require_login` 은 재시도 없이 바로 실패하고, 응답 상태 코드와 문구의 숫자를 맞춘다.
- `src/lib/sources/collect.ts`: `instagram(code, item?)`. item 이 있으면 파싱만 한다.
- `src/lib/ingest.ts`: `ingestLink` 에 선택 인자 `igItem`.
- `src/app/api/ext/save/route.ts`: `body.igItem` 을 받는다. 검증 두 가지.
  - `item.code` 가 URL 의 shortcode 와 같아야 한다.
  - 미디어, 썸네일, 프로필 사진 URL 호스트가 `*.cdninstagram.com` 또는 `*.fbcdn.net` 이어야 한다. 기존 `assertPublicUrl` 에 더해 건다.

익스텐션

- `content/instagram.js`: `{ type: "ig-item", code }` 메시지를 받아 조회하고 `{ item }` 또는 `{ error }` 를 돌려준다.
- `background.js`
  - `igItemFrom(tabId, url)`: 저장을 누른 탭에 item 을 요청한다. 그 탭이 인스타가 아니면(응답할 스크립트가 없으면) item 없이 서버로 보낸다(fallback).
  - `saveOne`: 인스타 URL 이면 먼저 item 을 받는다. 팝업, 플로팅 버튼, 우클릭, 단축키가 모두 이 함수를 거친다. 일괄 가져오기 큐도 이 함수를 쓰지만 탭을 넘기지 않아서 PR 2 전까지는 서버 조회로 간다. 간격 조절 없이 로그인 계정 요청이 몰리지 않게 하려는 것.
  - `fab-save`: 실제 결과(`{ ok, error, title }`)를 돌려준다. 지금은 실패해도 항상 `{ ok: true }` 라 버튼에 "요청 보냄"이 뜬다.
- `content/instagram.js` 플로팅 버튼: "저장했어요" 또는 실제 에러 문구를 보여 준다.
- 일괄 가져오기 큐 (PR 2): content script 가 로드될 때 자기 탭을 등록하고, 큐는 등록된 인스타 탭에서 조회한다. 인스타 조회만 한 줄로 세우고 3~6초 무작위 간격을 둔다. 조회가 401/429 면 큐를 10분 멈추고 팝업에 이유를 보여 준다. 서버 저장(다운로드, 전사)은 지금처럼 2개까지 동시에 한다.

## 구현 전에 확인할 것 (spike)

1. 로그인된 인스타 탭의 같은 출처 fetch 로 item 을 주는 엔드포인트가 무엇인가. 후보는 지금 쓰는 doc_id GraphQL(+ `document.cookie` 의 csrftoken)과 `/api/v1/media/{media_id}/info/`. 둘 다 같은 item 모양이라 `parseIgItem` 은 그대로 쓴다.
   - 결과 (2026-11-05, DWVj0GPEamS): `v1info` 200 + item 있음 (video, 미디어 1개). `graphql` 은 200 이지만 item 경로가 비어 있음.
   - 결정: 익스텐션은 `/api/v1/media/{media_id}/info/` 를 쓴다. media_id 는 shortcode 앞 11자를 base64url 로 풀어 만든다. 11자보다 긴 shortcode(비공개 계정 게시물)는 PR 1 에서 따로 확인한다.
2. 그 item 의 CDN URL 을 서버(Vercel)에서 쿠키 없이 받을 수 있는가. 안 되면 "서버가 다운로드" 부분을 다시 정한다(익스텐션이 받아서 업로드).
   - 결과: 로컬 Mac 에서 `saveRemote` 와 같은 조건(서버 UA, 쿠키 없음)으로 200, `video/mp4` 2.2MB, h264 720x1280 + aac, 17.8초. 서버 다운로드 방식을 유지한다.
   - Vercel IP 에서도 되는지는 PR 1 preview 배포에서 확인한다.
3. CDN URL 만료 시각(`oe` 파라미터)이 큐 대기 시간보다 충분히 긴가.
   - 결과: 조회 시점부터 약 2061분(34시간). 큐 대기(분 단위)보다 충분히 길다.

## 위험

- 조회가 사용자 인스타 계정으로 나간다. 단건 저장은 사람이 보는 속도라 괜찮지만, 수백 개를 한꺼번에 가져오면 계정이 일시 제한될 수 있다. 간격과 차단 시 정지로 막고, 팝업에 한 줄로 알린다.
- 인스타 내부 API 라 doc_id 와 헤더가 예고 없이 바뀐다. 지금도 같은 위험을 지고 있다. 조회 코드를 content script 한 곳에 모아 고칠 곳을 하나로 둔다.
- 서버가 클라이언트가 준 URL 을 내려받는다. 호스트 화이트리스트와 `assertPublicUrl` 로 SSRF 를 막는다. 캡션 같은 item 내용은 그 사용자 워크스페이스에만 들어가므로, 신뢰 수준은 토큰 주인과 같다.

## 이번 범위 밖

- 웹 화면 링크 붙여넣기, MCP `add_reference`: 여전히 서버가 조회한다. 로그인이 필요하다는 응답이면 "인스타 링크는 익스텐션으로 저장해 주세요"라고 안내만 한다. 다음 단계에서 사이트, `bridge.js`, 익스텐션을 거치는 경로를 검토한다.

## 작업 순서

1. spike: 위 세 가지 확인 (코드 변경 없음)
2. PR 1: 서버 parse/fetch 분리, igItem 수신·검증, 401 재시도 제거, 단건 저장 경로, 플로팅 버튼 결과 표시
3. PR 2: 일괄 가져오기 큐 간격, 차단 시 정지
4. 나중: 웹 붙여넣기를 익스텐션 경유로

## 완료 조건

- [ ] 로그인된 인스타 탭에서 플로팅 버튼과 팝업으로 DWVj0GPEamS 가 저장된다 (영상과 전사 포함)
- [ ] 서버 비로그인 조회가 막혀 있어도 위가 된다
- [ ] 실패하면 플로팅 버튼에 실제 에러가 보이고, 20초 대기가 없다
- [ ] 인스타 CDN 이 아닌 호스트 URL 이 든 igItem 은 400 으로 거절된다
- [ ] 일괄 가져오기 중 401 이 나면 큐가 멈추고 이유가 보인다
