"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAction,
  useConvex,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Check,
  Cloud,
  Download,
  Flower2,
  History,
  Loader2,
  Lock,
  Share2,
  Sparkles,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthDialog } from "@/components/auth-dialog";
import { PaintingStudio } from "./painting-studio";
import {
  createPaintingDocument,
  normalizePaintingDocument,
  type PaintingDocument,
  type PaintingSnapshot,
  type PaintingStudioHandle,
} from "@/lib/painting";
import {
  blobDataUrl,
  downloadProject,
  readLocalDraft,
  starterDataUrl,
  writeLocalDraft,
  type LocalDraft,
} from "@/lib/local-drafts";
import { errorMessage } from "@/lib/presentation";
import styles from "./studio-workspace.module.css";

type Medium = "manual" | "assisted" | "generated";
type SaveOptions = { silent?: boolean; navigate?: boolean };
type Panel = "assist" | "history" | "share" | null;
type CanvasMetadata = { title: string; description: string; medium: Medium };
type BackupContext = CanvasMetadata & {
  key: string;
  projectId?: Id<"projects">;
  cloudVersion: number;
  updatedAt: number;
  appliedImageJobs: string[];
};
type ImageProposal = {
  jobId: Id<"imageJobs">;
  projectId: Id<"projects">;
  imageUrl: string;
  operation: "generate" | "edit";
};
const sameDocument = (a: PaintingDocument | undefined, b: PaintingDocument) =>
  !!a &&
  a.width === b.width &&
  a.height === b.height &&
  a.background === b.background &&
  a.activeLayerId === b.activeLayerId &&
  a.layers.length === b.layers.length &&
  a.layers.every(
    (l, i) =>
      l.dataUrl === b.layers[i].dataUrl &&
      l.visible === b.layers[i].visible &&
      l.opacity === b.layers[i].opacity &&
      l.name === b.layers[i].name,
  );

export function StudioWorkspace({
  projectId: routeProjectId,
}: {
  projectId?: string;
}) {
  const router = useRouter(),
    search = useSearchParams(),
    convex = useConvex();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const profile = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [activeProjectId, setActiveProjectId] = useState<
    Id<"projects"> | undefined
  >(routeProjectId as Id<"projects"> | undefined);
  const project = useQuery(
    api.projects.get,
    isAuthenticated && activeProjectId
      ? { projectId: activeProjectId }
      : "skip",
  );
  const revisions = useQuery(
    api.projects.revisions,
    isAuthenticated && activeProjectId
      ? { projectId: activeProjectId }
      : "skip",
  );
  const prompts = useQuery(api.challenges.list, {}),
    quota = useQuery(api.quota.usage, isAuthenticated ? {} : "skip");
  const latestImageJob = useQuery(
    api.quota.latest,
    isAuthenticated && activeProjectId
      ? { projectId: activeProjectId }
      : "skip",
  );
  const ensureProfile = useMutation(api.users.ensureProfile),
    createProject = useMutation(api.projects.create),
    saveProject = useMutation(api.projects.save),
    createUpload = useMutation(api.files.createUpload),
    commitUpload = useAction(api.files.commitUpload),
    setVisibility = useAction(api.projects.setVisibility),
    restoreRevision = useMutation(api.projects.restoreRevision),
    completeChallenge = useMutation(api.challenges.complete),
    requestImage = useAction(api.images.request),
    decideImage = useMutation(api.quota.decide);
  const editor = useRef<PaintingStudioHandle>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const [initialDocument, setInitialDocument] = useState<PaintingDocument>(),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("Untitled sketch"),
    [description, setDescription] = useState(""),
    [medium, setMedium] = useState<Medium>("manual"),
    [editorEpoch, setEditorEpoch] = useState(0);
  const [dirty, setDirty] = useState(false),
    [editTick, setEditTick] = useState(0),
    [saveEpoch, setSaveEpoch] = useState(0),
    [saving, setSaving] = useState(false),
    [cloudError, setCloudError] = useState(""),
    [autoPaused, setAutoPaused] = useState(false),
    [switchingDocument, setSwitchingDocument] = useState(false);
  const [localStatus, setLocalStatus] = useState("Preparing device backup…"),
    [panel, setPanel] = useState<Panel>(null),
    [authOpen, setAuthOpen] = useState(false),
    [authReason, setAuthReason] = useState("");
  const [operation, setOperation] = useState<"generate" | "edit">("edit"),
    [prompt, setPrompt] = useState(""),
    [imageStyle, setImageStyle] = useState("natural"),
    [aiBusy, setAiBusy] = useState(false),
    [aiError, setAiError] = useState(""),
    [aiResult, setAiResult] = useState<ImageProposal>(),
    [applying, setApplying] = useState(false);
  const [shareBusy, setShareBusy] = useState(false),
    [publicArtworkId, setPublicArtworkId] = useState<string>(),
    [completeBusy, setCompleteBusy] = useState(false),
    [localConflict, setLocalConflict] = useState<LocalDraft>();
  const version = useRef(0),
    currentId = useRef(activeProjectId),
    latest = useRef<PaintingSnapshot | undefined>(undefined),
    baseline = useRef<PaintingDocument | undefined>(undefined),
    dirtyRef = useRef(false),
    sequence = useRef(0),
    savePromise = useRef<Promise<Id<"projects"> | undefined> | null>(null),
    loadedKey = useRef(""),
    metadata = useRef({ title, description, medium });
  const appliedImageJobs = useRef(new Set<string>()),
    decidedImageJobs = useRef(new Set<string>()),
    applyingImage = useRef(false),
    backupClock = useRef(0),
    aiActivity = useRef(false),
    previousRoute = useRef(routeProjectId);
  const localTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    localSequence = useRef(0);
  const pendingLocalWrite = useRef<
    { snapshot: PaintingSnapshot; context: BackupContext } | undefined
  >(undefined);
  const challengeId = search.get("challenge"),
    starter = search.get("starter"),
    fresh = search.get("fresh");
  const challenge = prompts?.find((p) => p.id === challengeId);
  const ownerKey = profile?.userId ? `artist:${profile.userId}` : "guest";
  const draftKey = routeProjectId
    ? `${ownerKey}:project:${routeProjectId}`
    : `${ownerKey}:new:${fresh ?? starter ?? "latest"}`;
  const draftKeyRef = useRef(draftKey);
  const ownerRef = useRef(ownerKey);
  const previousOwner = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const imagePending = aiBusy || latestImageJob?.state === "pending";
  aiActivity.current = imagePending || !!aiResult || applying;
  useEffect(() => {
    if (routeProjectId || fresh) return;
    const parameters = new URLSearchParams(search.toString());
    parameters.set("fresh", crypto.randomUUID());
    router.replace(`/studio/new?${parameters.toString()}`, { scroll: false });
  }, [routeProjectId, fresh, router, search]);
  useEffect(() => {
    draftKeyRef.current = draftKey;
    metadata.current = { title, description, medium };
    currentId.current = activeProjectId;
  }, [draftKey, title, description, medium, activeProjectId]);
  useEffect(() => {
    if (isAuthenticated && profile && !profile.handle)
      void ensureProfile({}).catch(() => {});
  }, [isAuthenticated, profile, ensureProfile]);
  const askAuth = useCallback((reason: string) => {
    setAuthReason(reason);
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const captureBackupContext = useCallback(
    (overrides: Partial<BackupContext> = {}): BackupContext => {
      backupClock.current = Math.max(Date.now(), backupClock.current + 1);
      return {
        key: draftKeyRef.current,
        ...metadata.current,
        projectId: currentId.current,
        cloudVersion: version.current,
        updatedAt: backupClock.current,
        appliedImageJobs: [...appliedImageJobs.current],
        ...overrides,
      };
    },
    [],
  );
  const cancelLocalTimer = useCallback(() => {
    if (localTimer.current) clearTimeout(localTimer.current);
    localTimer.current = undefined;
    pendingLocalWrite.current = undefined;
  }, []);

  const backup = useCallback(
    async (
      snapshot: PaintingSnapshot,
      pending: boolean,
      cloudVersion = version.current,
      context = captureBackupContext(),
    ) => {
      const serial = ++localSequence.current;
      const entry: LocalDraft = {
        ...context,
        document: snapshot.document,
        cloudVersion,
        pending,
      };
      try {
        const kept = await writeLocalDraft(entry);
        if (
          serial === localSequence.current &&
          entry.key === draftKeyRef.current
        )
          setLocalStatus(
            kept
              ? "Saved on this device"
              : "A newer device copy was kept — download this canvas to keep both",
          );
        return kept;
      } catch (cause) {
        if (
          serial === localSequence.current &&
          entry.key === draftKeyRef.current
        )
          setLocalStatus(
            errorMessage(
              cause,
              "Local backup unavailable — download your project",
            ),
          );
        return false;
      }
    },
    [captureBackupContext],
  );
  const flushLocalTimer = useCallback(() => {
    const pending = pendingLocalWrite.current;
    cancelLocalTimer();
    if (pending)
      void backup(
        pending.snapshot,
        true,
        pending.context.cloudVersion,
        pending.context,
      );
  }, [backup, cancelLocalTimer]);
  const installDocument = useCallback(
    (doc: PaintingDocument, meta: CanvasMetadata, pending: boolean) => {
      cancelLocalTimer();
      const snapshot = { document: doc, previewDataUrl: "" };
      latest.current = snapshot;
      baseline.current = doc;
      metadata.current = { ...meta };
      sequence.current++;
      dirtyRef.current = pending;
      setDirty(pending);
      setTitle(meta.title);
      setDescription(meta.description);
      setMedium(meta.medium);
      setInitialDocument(doc);
      setEditorEpoch((n) => n + 1);
      setEditTick((n) => n + 1);
      return snapshot;
    },
    [cancelLocalTimer],
  );
  useEffect(() => {
    if (previousRoute.current === routeProjectId) return;
    previousRoute.current = routeProjectId;
    flushLocalTimer();
    currentId.current = routeProjectId as Id<"projects"> | undefined;
    setActiveProjectId(currentId.current);
    setAiResult(undefined);
    setAiError("");
    loadedKey.current = "";
    setReady(false);
  }, [routeProjectId, flushLocalTimer]);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    sequence.current++;
    setDirty(true);
    setEditTick((n) => n + 1);
  }, []);
  const onChange = useCallback(
    (snapshot: PaintingSnapshot) => {
      latest.current = snapshot;
      if (
        sameDocument(baseline.current, snapshot.document) &&
        !dirtyRef.current
      )
        return;
      markDirty();
      setLocalStatus("Saving on this device…");
      cancelLocalTimer();
      const context = captureBackupContext();
      pendingLocalWrite.current = { snapshot, context };
      localTimer.current = setTimeout(() => {
        pendingLocalWrite.current = undefined;
        localTimer.current = undefined;
        void backup(snapshot, true, context.cloudVersion, context);
      }, 550);
    },
    [backup, cancelLocalTimer, captureBackupContext, markDirty],
  );

  useEffect(() => {
    if (previousOwner.current === ownerKey) return;
    const from = previousOwner.current;
    previousOwner.current = ownerKey;
    flushLocalTimer();
    if (
      from === "guest" &&
      ownerKey.startsWith("artist:") &&
      !routeProjectId &&
      ready &&
      latest.current
    ) {
      // Joining keeps the live guest painting; subsequent cloud saves use this signed-in owner.
      void backup(
        latest.current,
        dirtyRef.current,
        version.current,
        captureBackupContext({ key: draftKey }),
      );
    } else {
      loadedKey.current = "";
      currentId.current = routeProjectId as Id<"projects"> | undefined;
      setActiveProjectId(currentId.current);
      setAiResult(undefined);
      setReady(false);
    }
  }, [
    ownerKey,
    routeProjectId,
    ready,
    draftKey,
    backup,
    captureBackupContext,
    flushLocalTimer,
  ]);

  useEffect(() => {
    if (authLoading || (isAuthenticated && !profile)) return;
    if (
      routeProjectId &&
      (!isAuthenticated || !project || activeProjectId !== routeProjectId)
    )
      return;
    if (!routeProjectId && !fresh) return;
    const key = routeProjectId
      ? `${routeProjectId}:${profile?.userId ?? ""}`
      : `new:${fresh ?? ""}:${starter ?? ""}`;
    if (loadedKey.current === key) return;
    let cancelled = false;
    const scopeOwner = ownerKey;
    flushLocalTimer();
    setReady(false);
    setLoadError("");
    void (async () => {
      try {
        let doc = createPaintingDocument(),
          name = "Untitled sketch",
          desc = "",
          kind: Medium = "manual",
          pending = false;
        const [local, storedConflict] = await Promise.all([
          readLocalDraft(draftKey).catch(() => undefined),
          readLocalDraft(`${draftKey}:conflict`).catch(() => undefined),
        ]);
        let cloud = routeProjectId ? project : undefined;
        let resolvedId = routeProjectId as Id<"projects"> | undefined;
        let cloudVersion = 0;
        let conflict = storedConflict;
        let usedLocal = false;
        if (!routeProjectId && isAuthenticated && local?.projectId) {
          // Device data is never authority to select another user's cloud project.
          try {
            const owned = await convex.query(api.projects.get, {
              projectId: local.projectId as Id<"projects">,
            });
            cloud = owned;
            resolvedId = owned._id;
          } catch {
            resolvedId = undefined;
          }
        }
        if (cancelled || ownerRef.current !== scopeOwner) return;
        if (cloud) {
          if (cloud.deletedAt)
            throw new Error(
              "This project is in your trash. Restore it from your collection first.",
            );
          cloudVersion = cloud.version;
          name = cloud.title;
          desc = cloud.description;
          kind = cloud.medium;
          if (cloud.snapshotUrl) {
            const response = await fetch(cloud.snapshotUrl);
            if (!response.ok)
              throw new Error(
                "Your saved project couldn't be opened. Try again without replacing it.",
              );
            doc = normalizePaintingDocument(await response.json());
          }
          if (local?.pending && local.cloudVersion === cloud.version) {
            doc = normalizePaintingDocument(local.document);
            name = local.title;
            desc = local.description;
            kind = local.medium;
            pending = true;
            usedLocal = true;
          } else if (local?.pending) {
            // Persist the recoverable copy BEFORE replacing the primary draft with cloud data.
            await writeLocalDraft({ ...local, key: `${draftKey}:conflict` });
            conflict = await readLocalDraft(`${draftKey}:conflict`);
          }
        } else if (local) {
          doc = normalizePaintingDocument(local.document);
          name = local.title;
          desc = local.description;
          kind = local.medium;
          pending = true;
          usedLocal = true;
        } else if (starter) {
          const dataUrl = await starterDataUrl(starter);
          doc.height = 768;
          doc.layers[0].dataUrl = dataUrl;
          doc.layers[0].name = "Starter illustration";
          const id = crypto.randomUUID();
          doc.layers.push({
            id,
            name: "Make it yours",
            visible: true,
            opacity: 1,
            dataUrl: "",
          });
          doc.activeLayerId = id;
          name = starter
            .split("-")
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(" ");
          pending = true;
        }
        if (cancelled || ownerRef.current !== scopeOwner) return;
        version.current = cloudVersion;
        appliedImageJobs.current = new Set(
          usedLocal ? (local?.appliedImageJobs ?? []) : [],
        );
        const meta = { title: name, description: desc, medium: kind };
        const snapshot = installDocument(doc, meta, pending);
        setLocalConflict(conflict);
        setCloudError("");
        setAutoPaused(false);
        await backup(
          snapshot,
          pending,
          cloudVersion,
          captureBackupContext({
            key: draftKey,
            projectId: resolvedId,
            cloudVersion,
            ...meta,
          }),
        );
        if (!cancelled && ownerRef.current === scopeOwner) {
          currentId.current = resolvedId;
          setActiveProjectId(resolvedId);
          loadedKey.current = key;
          setReady(true);
        }
      } catch (cause) {
        if (!cancelled)
          setLoadError(errorMessage(cause, "Your canvas could not be opened."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    routeProjectId,
    activeProjectId,
    isAuthenticated,
    profile?.userId,
    project,
    authLoading,
    draftKey,
    fresh,
    starter,
    profile,
    backup,
    captureBackupContext,
    convex,
    flushLocalTimer,
    installDocument,
    ownerKey,
  ]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirtyRef.current && !localStatus.startsWith("Saved on this device")) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [localStatus]);
  useEffect(
    () => () => {
      const pending = pendingLocalWrite.current;
      cancelLocalTimer();
      if (pending)
        void backup(
          pending.snapshot,
          true,
          pending.context.cloudVersion,
          pending.context,
        );
      else if (latest.current && loadedKey.current) {
        const context = captureBackupContext();
        void backup(
          latest.current,
          dirtyRef.current,
          context.cloudVersion,
          context,
        );
      }
    },
    [backup, cancelLocalTimer, captureBackupContext],
  );

  const upload = useCallback(
    async (blob: Blob, kind: "snapshot" | "preview") => {
      const bytes = await blob.arrayBuffer(),
        digest = await crypto.subtle.digest("SHA-256", bytes),
        sha256 = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      const grant = await createUpload({ kind, sha256, size: blob.size });
      const response = await fetch(grant.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!response.ok)
        throw new Error(
          "The upload was interrupted. Your local backup is safe; try saving again.",
        );
      const result = (await response.json()) as { storageId: Id<"_storage"> };
      return (
        await commitUpload({
          grantId: grant.grantId,
          storageId: result.storageId,
        })
      ).storageId;
    },
    [createUpload, commitUpload],
  );

  const saveCloud = useCallback(
    async function save(
      options: SaveOptions = {},
    ): Promise<Id<"projects"> | undefined> {
      if (!ready || !editor.current) return;
      if (!isAuthenticated) {
        const snapshot = editor.current.getSnapshot();
        await backup(snapshot, true);
        if (!options.silent)
          askAuth(
            "Your drawing is saved on this device. Join to keep a cloud backup and share it.",
          );
        return;
      }
      if (savePromise.current) {
        await savePromise.current;
        return await save(options);
      }
      if (currentId.current && !dirtyRef.current) return currentId.current;
      const captured = editor.current.getSnapshot(),
        started = sequence.current,
        meta = { ...metadata.current },
        originKey = draftKeyRef.current,
        originOwner = ownerRef.current,
        context = captureBackupContext();
      let expectedVersion = version.current;
      latest.current = captured;
      setSaving(true);
      setCloudError("");
      const task = (async () => {
        let id = currentId.current;
        if (!id) {
          id = await createProject({
            title: meta.title.trim() || "Untitled sketch",
            width: captured.document.width,
            height: captured.document.height,
          });
          if (
            draftKeyRef.current === originKey &&
            ownerRef.current === originOwner
          ) {
            currentId.current = id;
            setActiveProjectId(id);
            version.current = 0;
          }
          expectedVersion = 0;
        }
        await backup(captured, true, expectedVersion, {
          ...context,
          projectId: id,
        });
        const file = new Blob([JSON.stringify(captured.document)], {
          type: "application/json",
        });
        if (file.size > 40 * 1024 * 1024)
          throw new Error(
            "This layered project exceeds the 40 MB cloud limit. Download a project backup to keep every layer.",
          );
        const snapshotStorageId = await upload(file, "snapshot");
        const previewBlob = await (await fetch(captured.previewDataUrl)).blob();
        const previewStorageId = await upload(
          new Blob([previewBlob], { type: "image/png" }),
          "preview",
        );
        const result = await saveProject({
          projectId: id,
          title: meta.title.trim() || "Untitled sketch",
          description: meta.description,
          snapshotStorageId,
          previewStorageId,
          medium: meta.medium,
          expectedVersion,
        });
        if (
          draftKeyRef.current !== originKey ||
          ownerRef.current !== originOwner
        )
          return id;
        version.current = result.version;
        baseline.current = captured.document;
        const changed = sequence.current !== started;
        dirtyRef.current = changed;
        setDirty(changed);
        setAutoPaused(false);
        cancelLocalTimer();
        await backup(
          changed && latest.current ? latest.current : captured,
          changed,
          result.version,
        );
        if (!options.silent) toast.success("Your canvas is saved.");
        if (
          !routeProjectId &&
          !changed &&
          options.navigate !== false &&
          !aiActivity.current
        ) {
          router.replace(
            `/studio/${id}${challengeId ? `?challenge=${encodeURIComponent(challengeId)}` : ""}`,
          );
        }
        return id;
      })();
      savePromise.current = task;
      try {
        return await task;
      } catch (cause) {
        const message = errorMessage(
          cause,
          "Cloud save couldn't finish. Your local backup is unchanged.",
        );
        setCloudError(message);
        setAutoPaused(true);
        if (!options.silent) toast.error(message);
        throw cause;
      } finally {
        savePromise.current = null;
        setSaving(false);
        setSaveEpoch((n) => n + 1);
      }
    },
    [
      ready,
      isAuthenticated,
      backup,
      askAuth,
      createProject,
      upload,
      saveProject,
      cancelLocalTimer,
      captureBackupContext,
      routeProjectId,
      router,
      challengeId,
    ],
  );

  useEffect(() => {
    if (!ready || !dirty || !isAuthenticated || autoPaused || switchingDocument)
      return;
    const timer = setTimeout(
      () => void saveCloud({ silent: true, navigate: false }).catch(() => {}),
      8000,
    );
    return () => clearTimeout(timer);
  }, [
    ready,
    dirty,
    isAuthenticated,
    autoPaused,
    switchingDocument,
    editTick,
    saveEpoch,
    saveCloud,
  ]);

  function changeTitle(value: string) {
    setTitle(value);
    metadata.current.title = value;
    markDirty();
    cancelLocalTimer();
    setLocalStatus("Saving on this device…");
    if (latest.current) void backup(latest.current, true);
  }
  function changeDescription(value: string) {
    setDescription(value);
    metadata.current.description = value;
    markDirty();
    cancelLocalTimer();
    setLocalStatus("Saving on this device…");
    if (latest.current) void backup(latest.current, true);
  }
  useEffect(() => {
    if (
      !ready ||
      !isAuthenticated ||
      !activeProjectId ||
      latestImageJob === undefined
    )
      return;
    const job = latestImageJob;
    if (!job || job.decision || decidedImageJobs.current.has(job.jobId)) {
      setAiResult(undefined);
      return;
    }
    if (job.state === "completed" && job.imageUrl) {
      setAiResult({
        jobId: job.jobId,
        projectId: activeProjectId,
        imageUrl: job.imageUrl,
        operation: job.operation,
      });
      setPanel("assist");
      setAiError("");
    } else if (job.state === "pending") {
      setAiResult(undefined);
      setPanel("assist");
    } else if (job.state === "failed") {
      setAiResult(undefined);
      setAiError(
        job.error ||
          "That image request could not be completed. Your painting is unchanged.",
      );
    }
  }, [ready, isAuthenticated, activeProjectId, latestImageJob]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (aiActivity.current) return;
    if (!isAuthenticated) {
      askAuth("Join to try optional AI help with your own saved canvas.");
      return;
    }
    setAiError("");
    aiActivity.current = true;
    setAiBusy(true);
    const originKey = draftKeyRef.current,
      originOwner = ownerRef.current;
    try {
      const id = await saveCloud({ silent: true, navigate: false });
      if (!id) return;
      if (draftKeyRef.current !== originKey || ownerRef.current !== originOwner)
        return;
      const result = await requestImage({
        projectId: id,
        operation,
        prompt,
        style: imageStyle,
      });
      if (
        currentId.current === id &&
        draftKeyRef.current === originKey &&
        ownerRef.current === originOwner
      ) {
        setAiResult({ ...result, projectId: id });
      }
    } catch (cause) {
      setAiError(
        errorMessage(
          cause,
          "The image could not be made. Your painting is unchanged.",
        ),
      );
    } finally {
      setAiBusy(false);
    }
  }
  async function applyImage() {
    const proposal = aiResult,
      handle = editor.current;
    if (
      !proposal ||
      !handle ||
      applyingImage.current ||
      currentId.current !== proposal.projectId
    )
      return;
    const originKey = draftKeyRef.current,
      originOwner = ownerRef.current;
    const sameOrigin = () =>
      editor.current === handle &&
      currentId.current === proposal.projectId &&
      draftKeyRef.current === originKey &&
      ownerRef.current === originOwner;
    applyingImage.current = true;
    setAiError("");
    setApplying(true);
    try {
      if (!appliedImageJobs.current.has(proposal.jobId)) {
        const response = await fetch(proposal.imageUrl);
        if (!response.ok)
          throw new Error("Image unavailable. Please try opening it again.");
        const dataUrl = await blobDataUrl(await response.blob());
        if (!sameOrigin())
          throw new Error(
            "Your canvas changed while the image opened. The proposal is still available in its original project.",
          );
        const wasBlank = !handle
          .getSnapshot()
          .document.layers.some((l) => l.dataUrl);
        await handle.addImage(
          dataUrl,
          proposal.operation === "generate" ? "AI starter" : "AI proposal",
        );
        if (!sameOrigin())
          throw new Error(
            "Your canvas changed before the proposal could be kept. Reopen its original project to continue.",
          );
        const kind: Medium =
          wasBlank && proposal.operation === "generate"
            ? "generated"
            : "assisted";
        setMedium(kind);
        metadata.current.medium = kind;
        appliedImageJobs.current.add(proposal.jobId);
        markDirty();
      }
      cancelLocalTimer();
      const snapshot = handle.getSnapshot();
      latest.current = snapshot;
      setLocalStatus("Keeping your proposal on this device…");
      const context = captureBackupContext();
      if (!(await backup(snapshot, true, context.cloudVersion, context))) {
        throw new Error(
          "Your proposal is on the canvas, but device backup failed. Download a project backup, then retry keeping it. It has not been marked accepted.",
        );
      }
      await decideImage({ jobId: proposal.jobId, decision: "accepted" });
      decidedImageJobs.current.add(proposal.jobId);
      if (sameOrigin()) {
        setAiResult(undefined);
        toast.success(
          "Kept as a new layer and backed up on this device. Your original is underneath.",
        );
      }
    } catch (cause) {
      if (sameOrigin()) setAiError(errorMessage(cause));
      else toast.error(errorMessage(cause));
    } finally {
      applyingImage.current = false;
      setApplying(false);
    }
  }
  async function discardImage() {
    const proposal = aiResult;
    if (
      !proposal ||
      applyingImage.current ||
      currentId.current !== proposal.projectId
    )
      return;
    applyingImage.current = true;
    setApplying(true);
    try {
      await decideImage({ jobId: proposal.jobId, decision: "discarded" });
      decidedImageJobs.current.add(proposal.jobId);
      setAiResult((current) =>
        current?.jobId === proposal.jobId ? undefined : current,
      );
      setAiError("");
    } catch (cause) {
      setAiError(errorMessage(cause));
    } finally {
      applyingImage.current = false;
      setApplying(false);
    }
  }
  async function publish() {
    setShareBusy(true);
    try {
      const id = await saveCloud({ silent: true, navigate: false });
      if (!id) return;
      const result = await setVisibility({
        projectId: id,
        visibility: "public",
      });
      if (result.artworkId) setPublicArtworkId(result.artworkId);
      toast.success("Your finished preview is now shared with the club.");
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setShareBusy(false);
    }
  }
  async function unpublish() {
    if (!activeProjectId) return;
    setShareBusy(true);
    try {
      await setVisibility({
        projectId: activeProjectId,
        visibility: "private",
      });
      setPublicArtworkId(undefined);
      toast.success("This piece is private again.");
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setShareBusy(false);
    }
  }
  async function finishChallenge() {
    if (!challenge) return;
    if (!isAuthenticated) {
      askAuth("Join to keep your creative XP and complete this prompt.");
      return;
    }
    setCompleteBusy(true);
    try {
      const id = await saveCloud({ silent: true, navigate: false });
      if (!id) return;
      const result = await completeChallenge({
        projectId: id,
        challengeId: challenge.id,
      });
      toast.success(
        result.alreadyCompleted
          ? "You've already earned this prompt's reward."
          : `+${result.xpAwarded} creative XP! You’re level ${result.level}.`,
      );
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setCompleteBusy(false);
    }
  }
  async function reloadCloud(skipConfirm = false) {
    const id = currentId.current,
      originKey = draftKeyRef.current,
      originOwner = ownerRef.current;
    if (!id) return false;
    if (
      !skipConfirm &&
      dirtyRef.current &&
      !window.confirm(
        "Reload your cloud copy? Download a project backup first if you want to keep your unsaved changes.",
      )
    )
      return false;
    setSwitchingDocument(true);
    flushLocalTimer();
    try {
      const p = await convex.query(api.projects.get, {
        projectId: id,
      });
      if (!p.snapshotUrl)
        throw new Error("This project has no cloud save yet.");
      const response = await fetch(p.snapshotUrl);
      if (!response.ok) throw new Error("Cloud copy could not be downloaded.");
      const doc = normalizePaintingDocument(await response.json());
      if (
        currentId.current !== id ||
        draftKeyRef.current !== originKey ||
        ownerRef.current !== originOwner
      )
        return false;
      version.current = p.version;
      appliedImageJobs.current.clear();
      const meta = {
        title: p.title,
        description: p.description,
        medium: p.medium,
      };
      const snapshot = installDocument(doc, meta, false);
      await backup(
        snapshot,
        false,
        p.version,
        captureBackupContext({ key: originKey, projectId: id, ...meta }),
      );
      setCloudError("");
      setAutoPaused(false);
      setLocalConflict(undefined);
      toast.success("Cloud copy restored.");
      return true;
    } catch (cause) {
      toast.error(errorMessage(cause));
      return false;
    } finally {
      setSwitchingDocument(false);
    }
  }
  async function restore(id: Id<"revisions">) {
    if (
      !activeProjectId ||
      saving ||
      switchingDocument ||
      applying ||
      !window.confirm(
        "Restore this version? Your current cloud version will remain in the version history.",
      )
    )
      return;
    setSwitchingDocument(true);
    try {
      // Keep the current dirty painting as a real cloud revision before switching history.
      if (dirtyRef.current) {
        await saveCloud({ silent: true, navigate: false });
        if (dirtyRef.current)
          throw new Error(
            "Your latest marks are not fully saved yet. Save them before restoring a version.",
          );
      }
      const result = await restoreRevision({
        projectId: activeProjectId,
        revisionId: id,
        expectedVersion: version.current,
      });
      version.current = result.version;
      await reloadCloud(true);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setSwitchingDocument(false);
    }
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (saving || switchingDocument || applying) {
      toast.error(
        "Let the current save or image finish before importing another canvas.",
      );
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      toast.error("Choose a project backup under 40 MB.");
      return;
    }
    const originKey = draftKeyRef.current,
      originOwner = ownerRef.current;
    try {
      if (
        dirtyRef.current &&
        !window.confirm(
          "Import this project over the current canvas? Download a backup first to keep both.",
        )
      )
        return;
      setSwitchingDocument(true);
      flushLocalTimer();
      const value = JSON.parse(await file.text());
      const doc = normalizePaintingDocument(value.document ?? value);
      if (draftKeyRef.current !== originKey || ownerRef.current !== originOwner)
        throw new Error(
          "Your canvas changed before import finished. Open the backup again in the intended canvas.",
        );
      appliedImageJobs.current.clear();
      const meta = {
        ...metadata.current,
        title:
          typeof value.title === "string"
            ? value.title.slice(0, 100)
            : metadata.current.title,
      };
      const snapshot = installDocument(doc, meta, true);
      setLocalStatus("Saving the imported canvas on this device…");
      const kept = await backup(
        snapshot,
        true,
        version.current,
        captureBackupContext({ key: originKey, ...meta }),
      );
      if (kept)
        toast.success(
          "Project imported with its layers and backed up on this device.",
        );
      else
        toast.error(
          "Project imported, but device backup is unavailable. Download a project backup before leaving.",
        );
    } catch (cause) {
      toast.error(
        errorMessage(cause, "This project backup could not be opened."),
      );
    } finally {
      setSwitchingDocument(false);
    }
  }
  function downloadBackup() {
    try {
      if (editor.current)
        downloadProject(editor.current.getSnapshot().document, title);
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }
  const published = project?.visibility === "public" || !!publicArtworkId;
  const artworkId = publicArtworkId ?? project?.artworkId;
  const showEditor = ready && (!routeProjectId || isAuthenticated);

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Canvas Club home">
          <Flower2 size={26} />
          <span>Canvas Club</span>
        </Link>
        <div className={styles.divider} />
        <div className={styles.titleWrap}>
          <input
            className={styles.title}
            aria-label="Project title"
            maxLength={100}
            value={title}
            onChange={(e) => changeTitle(e.target.value)}
            disabled={!showEditor || switchingDocument}
          />
          <div className={styles.saveStatus}>
            {saving ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Saving to cloud…
              </>
            ) : cloudError ? (
              <button
                className={styles.saveBadgeButton}
                onClick={() =>
                  void saveCloud({ navigate: false }).catch(() => {})
                }
              >
                Cloud save paused · retry
              </button>
            ) : activeProjectId && !dirty ? (
              <>
                <Check size={11} />
                All changes saved
              </>
            ) : (
              <>
                <Lock size={10} />
                {isAuthenticated
                  ? "Private draft"
                  : localStatus.startsWith("Saved on this device")
                    ? "Guest canvas · saved on this device"
                    : "Guest canvas · device backup pending"}
              </>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.smallButton} ${styles.optional}`}
            onClick={() => fileInput.current?.click()}
            title="Import project backup"
            aria-label="Import project backup"
            disabled={saving || switchingDocument || applying}
          >
            <Upload size={17} />
          </button>
          <button
            className={`${styles.smallButton} ${styles.optional}`}
            onClick={downloadBackup}
            disabled={!showEditor}
            title="Download project with layers"
            aria-label="Download project backup"
          >
            <Download size={17} />
          </button>
          <button
            className={styles.smallButton}
            onClick={() => setPanel(panel === "history" ? null : "history")}
            title="Version history"
            aria-label="Version history"
          >
            <History size={17} />
          </button>
          <button
            className={`${styles.smallButton} ${styles.pink}`}
            aria-label="Optional AI help"
            onClick={() => setPanel(panel === "assist" ? null : "assist")}
          >
            <Sparkles size={16} />
            <span className={styles.mobileLabel}>AI help</span>
          </button>
          <button
            className={styles.smallButton}
            onClick={() => void saveCloud().catch(() => {})}
            aria-label="Save canvas"
            disabled={!showEditor || saving || switchingDocument}
          >
            <Cloud size={16} />
            <span className={styles.mobileLabel}>
              {saving ? "Saving…" : "Save"}
            </span>
          </button>
          <button
            className={`${styles.smallButton} ${styles.primary}`}
            onClick={() => setPanel(panel === "share" ? null : "share")}
            aria-label="Share artwork"
            disabled={!showEditor}
          >
            <Share2 size={15} />
            <span className={styles.mobileLabel}>Share</span>
          </button>
        </div>
      </header>
      {cloudError && (
        <div className={styles.alert} role="alert">
          <span>{cloudError}</span>
          <button onClick={() => void reloadCloud()}>Reload cloud copy</button>
        </div>
      )}
      {localConflict && (
        <div className={styles.alert}>
          <span>
            A separate unsaved device copy is available. Your cloud copy is
            open.
          </span>
          <div className={styles.localRestore}>
            <button
              onClick={() =>
                downloadProject(localConflict.document, localConflict.title)
              }
            >
              Download device copy
            </button>
            <button
              onClick={() => setLocalConflict(undefined)}
              aria-label="Dismiss device copy notice"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {challenge && (
        <div className={styles.prompt}>
          <Trophy size={18} />
          <p>
            <strong>{challenge.title}</strong> · {challenge.prompt}
          </p>
          <button
            className={styles.smallButton}
            disabled={completeBusy || challenge.completed || !showEditor}
            onClick={() => void finishChallenge()}
          >
            {completeBusy
              ? "Saving…"
              : challenge.completed
                ? "Completed ✓"
                : "Finish · +100 XP"}
          </button>
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.editor}>
          {showEditor ? (
            <PaintingStudio
              key={`${routeProjectId ?? "new"}:${editorEpoch}`}
              ref={editor}
              initialDocument={initialDocument}
              onChange={onChange}
              onSave={() => void saveCloud().catch(() => {})}
              onAssist={() => setPanel("assist")}
              disabled={switchingDocument}
            />
          ) : (
            <div className={styles.empty}>
              {loadError ? (
                <>
                  <ArrowLeft size={34} />
                  <h1>Your original is safe.</h1>
                  <p role="alert">{loadError}</p>
                  <Link className="button" href="/gallery">
                    Back to your collection
                  </Link>
                </>
              ) : routeProjectId && !isAuthenticated && !authLoading ? (
                <>
                  <Lock size={34} />
                  <h1>This is a private canvas.</h1>
                  <p>
                    Sign in to your account to open it. Your layers are never
                    shown in the public gallery.
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      askAuth("Sign in to open your saved canvas.")
                    }
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  <Loader2 size={30} className="animate-spin" />
                  <p>Opening your creative space…</p>
                </>
              )}
            </div>
          )}
        </div>
        {panel && (
          <aside
            className={styles.panel}
            aria-label={
              panel === "assist"
                ? "Optional AI assistance"
                : panel === "history"
                  ? "Version history"
                  : "Share artwork"
            }
          >
            <div className={styles.panelHeader}>
              <h2>
                {panel === "assist"
                  ? "A little help, your way."
                  : panel === "history"
                    ? "Your canvas, over time."
                    : "Ready to share?"}
              </h2>
              <button onClick={() => setPanel(null)} aria-label="Close panel">
                <X size={17} />
              </button>
            </div>
            {panel === "assist" && (
              <>
                <p>
                  AI is optional. Try a starter or a variation, then choose what
                  stays. Your original layers are kept.
                </p>
                <div className={styles.tabs}>
                  <button
                    className={`${styles.tab} ${operation === "edit" ? styles.tabActive : ""}`}
                    onClick={() => setOperation("edit")}
                    disabled={imagePending || switchingDocument}
                  >
                    Help my sketch
                  </button>
                  <button
                    className={`${styles.tab} ${operation === "generate" ? styles.tabActive : ""}`}
                    onClick={() => setOperation("generate")}
                    disabled={imagePending || switchingDocument}
                  >
                    Make a starter
                  </button>
                </div>
                <form onSubmit={generate}>
                  <label htmlFor="ai-prompt">
                    {operation === "edit"
                      ? "What would you like to change?"
                      : "What would you like to paint?"}
                  </label>
                  <textarea
                    id="ai-prompt"
                    className="input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={1500}
                    required
                    disabled={imagePending || switchingDocument}
                    placeholder={
                      operation === "edit"
                        ? "Keep my shapes. Add soft watercolor shading and a warm afternoon glow…"
                        : "A small fox reading in a moonlit garden…"
                    }
                  />
                  <label htmlFor="ai-style">A little style direction</label>
                  <select
                    id="ai-style"
                    className="input"
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                    disabled={imagePending || switchingDocument}
                  >
                    {[
                      "natural",
                      "watercolor",
                      "gouache",
                      "pencil",
                      "ink",
                      "pixel",
                      "storybook",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s[0].toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  <p className={styles.quota}>
                    {isAuthenticated
                      ? quota
                        ? `${quota.remaining} of ${quota.limit} daily AI requests remaining · resets at midnight UTC`
                        : "Checking your daily allowance…"
                      : "Join to try 3 daily AI requests. Painting is always available without AI."}
                  </p>
                  <button
                    className={`${styles.smallButton} ${styles.primary}`}
                    style={{ width: "100%" }}
                    type="submit"
                    disabled={
                      imagePending ||
                      !!aiResult ||
                      switchingDocument ||
                      !showEditor ||
                      (isAuthenticated &&
                        quota !== undefined &&
                        quota !== null &&
                        (quota.remaining < 1 || !quota.globalAvailable))
                    }
                  >
                    {imagePending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Making your proposal…
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        {isAuthenticated
                          ? "Make one proposal"
                          : "Join to try AI help"}
                      </>
                    )}
                  </button>
                  <p className={styles.formHint}>
                    Each attempt uses one request, including an unsuccessful
                    attempt. Images can take up to three minutes. A shared beta
                    allowance also applies.
                  </p>
                </form>
                {aiError && (
                  <div role="alert" className={styles.error}>
                    {aiError}
                  </div>
                )}
                {imagePending && (
                  <div className={styles.aiSpinner}>
                    <Sparkles size={26} className="animate-spin" />
                    <p>
                      Your canvas is saved. Keep drawing while your proposal is
                      made.
                    </p>
                  </div>
                )}
                {aiResult && (
                  <div className={styles.result}>
                    <img
                      src={aiResult.imageUrl}
                      alt="AI proposal, not yet applied to your canvas"
                    />
                    <div className={styles.resultBody}>
                      <p>
                        {appliedImageJobs.current.has(aiResult.jobId)
                          ? "This proposal is already on your device canvas. Finish keeping it to record your decision; it will not be added twice."
                          : "A proposal, not a replacement. Add it as a new layer or leave your painting as it is."}
                      </p>
                      <div className={styles.resultActions}>
                        <button
                          className={`${styles.smallButton} ${styles.primary}`}
                          disabled={applying || switchingDocument}
                          onClick={() => void applyImage()}
                        >
                          {applying
                            ? "Keeping…"
                            : appliedImageJobs.current.has(aiResult.jobId)
                              ? "Finish keeping proposal"
                              : "Add as a layer"}
                        </button>
                        <button
                          className={styles.smallButton}
                          disabled={applying || switchingDocument}
                          onClick={() => void discardImage()}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className={styles.help}>
                  <details>
                    <summary>About creative control</summary>
                    <p>
                      AI may change more than you ask. Compare the result before
                      keeping it. Existing layers stay beneath the proposal, and
                      undo removes it. Public labels describe the assistance
                      recorded in this app, not verified authorship.
                    </p>
                  </details>
                </div>
              </>
            )}
            {panel === "history" && (
              <>
                <p>
                  Cloud saves keep your last 20 versions. Restore an earlier
                  version or download a backup with all your layers.
                </p>
                <button
                  className={styles.smallButton}
                  onClick={downloadBackup}
                  disabled={!showEditor}
                >
                  <Download size={15} />
                  Download project backup
                </button>
                {!isAuthenticated ? (
                  <p>
                    <button
                      className="button"
                      onClick={() =>
                        askAuth(
                          "Join to save versions in your private cloud collection.",
                        )
                      }
                    >
                      Keep a cloud history
                    </button>
                  </p>
                ) : !activeProjectId ? (
                  <p>Save this canvas to start its version history.</p>
                ) : revisions === undefined ? (
                  <p>Loading versions…</p>
                ) : revisions.length === 0 ? (
                  <p>Your first save will appear here.</p>
                ) : (
                  <div className={styles.revisions} style={{ marginTop: 18 }}>
                    {revisions.map((r) => (
                      <div className={styles.revision} key={r._id}>
                        {r.imageUrl && (
                          <img
                            src={r.imageUrl}
                            alt={`Version ${r.version} preview`}
                          />
                        )}
                        <div>
                          <strong>Version {r.version}</strong>
                          <small>
                            {new Date(r.createdAt).toLocaleString()}
                          </small>
                        </div>
                        <button
                          className={styles.smallButton}
                          onClick={() => void restore(r._id)}
                          disabled={saving || switchingDocument || applying}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {panel === "share" && (
              <>
                <p>
                  Your draft and layers stay private. Sharing publishes a
                  flattened preview that other people can see, like, and
                  discuss.
                </p>
                <label htmlFor="share-title">Give it a name</label>
                <input
                  id="share-title"
                  className="input"
                  maxLength={100}
                  value={title}
                  onChange={(e) => changeTitle(e.target.value)}
                />
                <label htmlFor="share-description">
                  A little context or a feedback question
                </label>
                <textarea
                  id="share-description"
                  className={`input ${styles.description}`}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => changeDescription(e.target.value)}
                  disabled={switchingDocument}
                  placeholder="What inspired you? What would you like feedback on?"
                />
                <p>
                  Recorded process:{" "}
                  <strong>
                    {medium === "manual"
                      ? "Manual drawing"
                      : medium === "assisted"
                        ? "AI-assisted"
                        : "AI-generated starter"}
                  </strong>
                </p>
                <button
                  className={`${styles.smallButton} ${styles.primary}`}
                  disabled={shareBusy || saving}
                  onClick={() => void publish()}
                  style={{ width: "100%" }}
                >
                  {shareBusy ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sharing…
                    </>
                  ) : (
                    <>
                      <Share2 size={15} />
                      {published
                        ? "Share latest saved version"
                        : "Share with the club"}
                    </>
                  )}
                </button>
                {published && artworkId && (
                  <p>
                    <Link
                      className={styles.publicLink}
                      href={`/artwork/${artworkId}`}
                    >
                      View your shared artwork ↗
                    </Link>
                  </p>
                )}
                {published && (
                  <button
                    className={styles.smallButton}
                    onClick={() => void unpublish()}
                    disabled={shareBusy}
                  >
                    Make private again
                  </button>
                )}
                <p className={styles.formHint}>
                  Share work you have the right to post. Be kind, respect other
                  artists, and use report or block if something needs attention.
                  Making a piece private removes its preview from this app; it
                  cannot recall copies others already saved.
                </p>
              </>
            )}
          </aside>
        )}
      </div>
      <footer className={styles.statusBar}>
        <span aria-live="polite">{localStatus}</span>
        <span className={styles.footerLinks}>
          <span>
            {medium === "manual"
              ? "Made by hand"
              : medium === "assisted"
                ? "AI-assisted · originals kept"
                : "AI starter · paint it your way"}
          </span>
          <Link href="/gallery">My collection</Link>
          <button onClick={downloadBackup}>Project backup</button>
        </span>
      </footer>
      <input
        ref={fileInput}
        className={styles.fileInput}
        type="file"
        accept=".json,application/json"
        onChange={importBackup}
        aria-label="Import Canvas Club project"
      />
      <AuthDialog open={authOpen} onClose={closeAuth} reason={authReason} />
    </div>
  );
}
