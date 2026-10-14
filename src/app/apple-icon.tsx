import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS 홈 화면 아이콘은 투명을 못 쓰므로 잉크 배경을 꽉 채운다 (모서리는 iOS 가 깎음)
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#161616" }}>
        <svg width="180" height="180" viewBox="6 6 52 52">
          <rect x="20" y="12" width="28" height="36" rx="5.5" fill="#5c5c59" />
          <rect x="15" y="17" width="28" height="36" rx="5.5" fill="#ffffff" />
          <path d="M31 17h8v14.5l-4-3.2-4 3.2Z" fill="#161616" />
        </svg>
      </div>
    ),
    size,
  );
}
