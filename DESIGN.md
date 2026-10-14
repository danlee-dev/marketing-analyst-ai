# DESIGN.md

레퍼런스 보관함의 디자인 규칙. 색·간격·반경은 `src/app/globals.css` 토큰이 단일 출처.
기준: Vercel(getdesign) 의 중립 잉크 톤 + NEXT 15기 디자인 디테일 가이드.

## 색
- 중립 잉크 한 계열. 남색 배경, 그라데이션, 반투명 상자 쓰지 않음
- 토큰: `--bg` `--surface` `--surface-2` `--surface-3` `--ink` `--ink-2` `--mute` `--on-ink` `--song` `--music` `--danger`
- 글자색 세 단계: ink(제목) / ink-2(본문) / mute(보조). mute 도 surface 위 4.5:1 이상
- 라이트·다크 모두 토큰으로 정의 (`.dark` 클래스, next-themes)
- 강조는 한 화면에 하나: 잉크 버튼 하나

## 글꼴
- Pretendard Variable (`next/font/local`, weight "45 920"), 숫자·타임스탬프만 Geist Mono
- 본문 자간 0, 줄 간격 1.6, `word-break: keep-all` + `overflow-wrap: anywhere`
- 제목 자간 -0.02em, 줄 간격 1.25
- 크기: 13 · 14 · 15 · 17 · 20 · 24/28 · 36. 굵기: 400 / 600 / 700

## 모서리
- 토큰: xl 28 (시트·큰 카드) / lg 20 (썸네일·입력 묶음) / md 14 (버튼·입력) / sm 8 (칩·안쪽 최소)
- 안쪽 radius = 바깥 radius - 여백 (예: lg 20 상자 안 p-1.5 → 버튼 md 14)
- `corner-shape: squircle` 지원 브라우저에서는 연속 곡선(Apple 식), 값은 1.4배

## 간격
- 4의 배수. 묶음 안 8, 카드 사이 16, 섹션 사이 40 이상
- 구분선·테두리 대신 여백과 면 색 차이로 묶음을 나눔

## 모션
- transform · opacity 만 움직임
- 작은 변화 0.15~0.2s, 시트·메뉴 0.25~0.4s, 화면 진입 0.45s
- 곡선: 감속 `cubic-bezier(0.05, 0.7, 0.1, 1)` (Material 3 emphasized decelerate). 나갈 때는 짧게
- 누르는 요소는 `.press` (scale 0.97)
- `prefers-reduced-motion` 이면 전부 끔 (CSS + MotionConfig reducedMotion="user")

## 피할 것
- 작은 글씨 섹션 라벨(eyebrow), 장식용 구분선, 반투명 배경 + 색 테두리 조합, 이모지

## 로고
- 마크: 4:5 게시물 카드 + 음각 북마크 리본(저장해 둔 레퍼런스), 뒤 카드 가장자리(모음). `src/components/ui/Logo.tsx`
- 워드마크: "레퍼런스 보관함" Pretendard 800, 자간 -0.03em, 실제 텍스트로 렌더 (본문 400 과 굵기 차로 구분)
- 변형: `brand/logo/icon.svg`(라이트) / `icon-reverse.svg`(다크) / `icon-mono.svg`(단색), 파비콘 `src/app/icon.svg` 는 시스템 테마 따라 반전, `apple-icon` 은 불투명 잉크 배경
- 금지: 회전, 비율 변경, 그라데이션·그림자 추가, 리본 색 바꾸기
