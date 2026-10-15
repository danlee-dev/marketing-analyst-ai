"use client";

import { ArrowUpRight, Download, X } from "lucide-react";
import { Modal } from "../ui/overlay";
import { useWorkspace } from "./context";

const FEATURES = [
  ["툴바 아이콘", "지금 보는 인스타·YouTube·X·TikTok·웹 페이지를 고른 프로젝트·폴더에 저장. 메모, 화면 캡처, 영상 자동 전사까지."],
  ["한 번에 가져오기", "인스타 저장됨 컬렉션, 프로필, YouTube 채널·재생목록, X 북마크를 끝까지 내리며 모아 새 것만 가져와요."],
  ["인스타 버튼", "게시물 화면 오른쪽 아래 버튼으로 바로 저장, 컬렉션 화면에서는 목록 전체 가져오기."],
  ["우클릭 메뉴", "링크 저장, 화면 캡처해서 저장, 선택한 문구를 메모로 저장."],
  ["단축키", "Alt+Shift+S 로 지금 페이지를 마지막 저장 위치에 저장."],
];

export function ExtensionDialog() {
  const w = useWorkspace();
  return (
    <Modal open={w.extOpen} onClose={() => w.setExtOpen(false)} width={560}>
      {w.extOpen && (
        <div className="relative p-6 sm:p-8">
          <button aria-label="닫기" onClick={() => w.setExtOpen(false)} className="press absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <X size={18} />
          </button>
          <h2 className="text-[22px] font-bold">크롬 확장</h2>
          <p className="mt-2 pr-6 text-[15px] text-ink-2">보던 화면에서 바로 보관함으로 저장해요. 인스타 저장됨 컬렉션도 통째로 가져와요.</p>

          <ul className="mt-6 flex flex-col gap-3">
            {FEATURES.map(([t, d]) => (
              <li key={t} className="grid grid-cols-[6.5rem_1fr] gap-3 text-[14px]">
                <span className="font-semibold">{t}</span>
                <span className="text-ink-2">{d}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-8 text-[16px] font-bold">설치</h3>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[14px] text-ink-2">
            <li>아래 버튼으로 zip 을 받아 압축을 풀어요.</li>
            <li>
              크롬 주소창에 <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">chrome://extensions</code> 를 열고 오른쪽 위 개발자 모드를 켜요.
            </li>
            <li>압축해제된 확장 프로그램을 로드합니다 → 푼 폴더를 골라요.</li>
            <li>연결하기를 눌러 이 계정과 이어요.</li>
          </ol>

          <div className="mt-6 flex flex-wrap gap-2">
            <a href="/reference-box-extension.zip" download className="press flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink">
              <Download size={16} /> zip 받기
            </a>
            <a href="/extension/connect" target="_blank" className="press flex h-11 items-center gap-2 rounded-md bg-surface-2 px-5 text-[15px] font-semibold hover:bg-surface-3">
              <ArrowUpRight size={16} /> 연결하기
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
