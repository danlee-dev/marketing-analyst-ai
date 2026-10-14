import { Suspense } from "react";
import { InviteView } from "@/components/invite/InviteView";

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteView />
    </Suspense>
  );
}
