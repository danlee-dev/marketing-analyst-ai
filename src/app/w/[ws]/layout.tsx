import { Shell } from "@/components/workspace/Shell";

export default function WorkspaceLayout({ children }: LayoutProps<"/w/[ws]">) {
  return <Shell>{children}</Shell>;
}
