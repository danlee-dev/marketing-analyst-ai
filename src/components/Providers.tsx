"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { EASE, OverlayHost } from "./ui/overlay";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: EASE }}>
        {children}
        <OverlayHost />
      </MotionConfig>
    </ThemeProvider>
  );
}
