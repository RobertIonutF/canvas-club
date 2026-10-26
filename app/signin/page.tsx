"use client";
import { AuthDialog } from "@/components/auth-dialog";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
export default function SignInPage() {
  const router = useRouter();
  const close = useCallback(() => router.push("/gallery"), [router]);
  return (
    <main style={{ minHeight: "100dvh", background: "var(--paper)" }}>
      <AuthDialog
        open
        onClose={close}
        reason="Your own little corner of the club starts here."
      />
    </main>
  );
}
