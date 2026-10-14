// 마크: 4:5 게시물 카드에 북마크 리본을 음각으로 (저장해 둔 레퍼런스) + 뒤 카드 가장자리 (모음).
// 색은 토큰을 따라 라이트에선 잉크 타일, 다크에선 밝은 타일로 뒤집힌다.
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="18" fill="var(--ink)" />
      <rect x="20" y="12" width="28" height="36" rx="5.5" fill="var(--logo-back)" />
      <rect x="15" y="17" width="28" height="36" rx="5.5" fill="var(--on-ink)" />
      <path d="M31 17h8v14.5l-4-3.2-4 3.2Z" fill="var(--ink)" />
    </svg>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="font-[800] tracking-[-0.03em]" style={{ fontSize: size * 0.6 }}>
        레퍼런스 보관함
      </span>
    </span>
  );
}
