import type { PaintingDocument } from "./painting";
export type LocalDraft = {
  key: string;
  document: PaintingDocument;
  title: string;
  description: string;
  medium: "manual" | "assisted" | "generated";
  updatedAt: number;
  cloudVersion: number;
  pending: boolean;
  projectId?: string;
  /** User-applied proposals awaiting a durable server decision must not be added twice. */
  appliedImageJobs?: string[];
};
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("canvas-club-drafts", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("drafts"))
        request.result.createObjectStore("drafts", { keyPath: "key" });
    };
    request.onerror = () =>
      reject(
        new Error(
          "Local backup is unavailable. Download your project to keep a copy.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error("Close another Canvas Club tab to enable local backup."),
      );
    request.onsuccess = () => resolve(request.result);
  });
}
export async function readLocalDraft(
  key: string,
): Promise<LocalDraft | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly"),
      request = tx.objectStore("drafts").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("Your device copy could not be read."));
    };
    tx.oncomplete = () => db.close();
  });
}
export async function writeLocalDraft(draft: LocalDraft): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const existing = store.get(draft.key);
    let wrote = false;
    existing.onsuccess = () => {
      const previous = existing.result as LocalDraft | undefined;
      // A delayed debounce or an older tab must not overwrite a newer durable snapshot.
      if (!previous || previous.updatedAt <= draft.updatedAt) {
        // A drawing captured while the first cloud project is being created can
        // finish after the ID-bearing backup. Keep that same draft's association.
        store.put({
          ...draft,
          projectId: draft.projectId ?? previous?.projectId,
        });
        wrote = true;
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(wrote);
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Local backup is full or unavailable. Download your project to keep a copy.",
        ),
      );
    };
    tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Local backup did not finish. Download your project to keep a copy.",
        ),
      );
    };
  });
}
export function downloadProject(document: PaintingDocument, title: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ format: "canvas-club", title, document })], {
      type: "application/json",
    }),
  );
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9-]/gi, "-").slice(0, 60) || "my-canvas"}.canvas-club.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This image could not be opened."));
    reader.readAsDataURL(blob);
  });
}
export async function starterDataUrl(slug: string): Promise<string> {
  if (
    ![
      "sunday-lemons",
      "moon-garden",
      "little-cabin",
      "tea-time",
      "friendly-monster",
      "wildflowers",
    ].includes(slug)
  )
    throw new Error("Starter unavailable.");
  const response = await fetch(`/art/${slug}.svg`);
  if (!response.ok) throw new Error("The starter could not be loaded.");
  const svg = await response.blob(),
    url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;
    canvas.getContext("2d")!.drawImage(image, 0, 0, 1024, 768);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
