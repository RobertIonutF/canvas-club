import { Suspense } from "react";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
export default function NewStudio() {
  return (
    <Suspense
      fallback={<main style={{ padding: 40 }}>Opening your canvas…</main>}
    >
      <StudioWorkspace />
    </Suspense>
  );
}
