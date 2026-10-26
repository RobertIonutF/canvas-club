import { Suspense } from "react";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
export default async function SavedStudio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={<main style={{ padding: 40 }}>Opening your canvas…</main>}
    >
      <StudioWorkspace projectId={id} />
    </Suspense>
  );
}
