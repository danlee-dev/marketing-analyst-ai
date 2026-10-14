import { Suspense } from "react";
import { Shell } from "@/components/workspace/Shell";

// Shell 이하가 useParams 로 URL 을 읽으므로 Suspense 경계 안에서 스트리밍
export default function WorkspaceLayout({ children }: LayoutProps<"/w/[ws]">) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
