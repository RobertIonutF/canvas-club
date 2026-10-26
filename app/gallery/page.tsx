"use client";

import Link from "next/link";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import {
  ArrowUpRight,
  Globe2,
  Heart,
  Images,
  Loader2,
  LockKeyhole,
  Pin,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, GuestInvitation, useClub } from "@/components/app-shell";
import { errorMessage, friendlyDate } from "@/lib/presentation";
import styles from "@/components/club.module.css";

type GalleryTab = "all" | "favorites" | "public" | "trash";
export default function GalleryPage() {
  return (
    <AppShell>
      <GalleryContent />
    </AppShell>
  );
}
function GalleryContent() {
  const { authenticated, profile, authLoading } = useClub();
  const [tab, setTab] = useState<GalleryTab>("all");
  const { results, status, loadMore } = usePaginatedQuery(
    api.projects.listMine,
    authenticated ? { trashed: tab === "trash" } : "skip",
    { initialNumItems: 18 },
  );
  const pin = useMutation(api.projects.pin);
  const trash = useMutation(api.projects.trash);
  const restore = useMutation(api.projects.restore);
  const visibility = useAction(api.projects.setVisibility);
  const [busy, setBusy] = useState<Id<"projects"> | null>(null);
  const [error, setError] = useState("");
  async function run(id: Id<"projects">, action: () => Promise<unknown>) {
    setBusy(id);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  const filtered = results.filter((project) =>
    tab === "favorites"
      ? project.isPinned
      : tab === "public"
        ? project.visibility === "public"
        : true,
  );
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>A LITTLE PIECE OF YOU</p>
          <h1>Your growing collection.</h1>
          <p>
            Big experiments, tiny happy accidents, and everything in between.
            Keep your favorites close. Share only what feels right.
          </p>
        </div>
        <Link href="/studio/new" className={styles.button}>
          <Plus size={15} />
          New canvas
        </Link>
      </div>
      {!authenticated && !authLoading && <GuestInvitation />}
      {authenticated && profile && (
        <div className={styles.banner}>
          <Images size={25} color="#88753b" />
          <p>
            Your drafts stay private until you share them. Pin your favorites to
            keep them close.{" "}
            <Link
              className={styles.textButton}
              href={`/artist/${profile.handle}`}
            >
              View my public showcase
              <ArrowUpRight size={12} />
            </Link>
          </p>
        </div>
      )}
      {authenticated && (
        <>
          <div className={styles.filterRow}>
            <div className={styles.tabs}>
              {(
                [
                  { value: "all", label: "All drawings", icon: Images },
                  {
                    value: "favorites",
                    label: "Pinned favorites",
                    icon: Heart,
                  },
                  { value: "public", label: "Public showcase", icon: Globe2 },
                  { value: "trash", label: "Recently removed", icon: Trash2 },
                ] as const
              ).map((item) => (
                <button
                  className={`${styles.tab} ${tab === item.value ? styles.tabActive : ""}`}
                  key={item.value}
                  onClick={() => setTab(item.value)}
                  aria-pressed={tab === item.value}
                >
                  <item.icon
                    size={13}
                    style={{ display: "inline", marginRight: 6 }}
                  />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {status === "LoadingFirstPage" ? (
            <div className={styles.draftGrid}>
              {[0, 1, 2].map((n) => (
                <div className={styles.skeleton} key={n} />
              ))}
            </div>
          ) : filtered.length ? (
            <div className={styles.draftGrid}>
              {filtered.map((project) => (
                <article
                  className={`${styles.draft} ${busy === project._id ? styles.pending : ""}`}
                  key={project._id}
                >
                  {project.imageUrl ? (
                    <img
                      src={project.imageUrl}
                      alt={project.title}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className={styles.skeleton}
                      style={{ minHeight: 180 }}
                    />
                  )}
                  <div className={styles.draftContent}>
                    <h3>
                      {project.title || "Untitled creation"}
                      {project.isPinned && (
                        <Pin
                          size={12}
                          style={{
                            display: "inline",
                            marginLeft: 6,
                            color: "#a58930",
                          }}
                        />
                      )}
                    </h3>
                    <p>
                      {tab === "trash" ? "Removed" : "Last saved"}{" "}
                      {friendlyDate(
                        tab === "trash" ? project.deletedAt : project.updatedAt,
                      )}{" "}
                      ·{" "}
                      {project.visibility === "public"
                        ? "Shared with the club"
                        : "Just for you"}
                    </p>
                    {tab === "trash" ? (
                      <button
                        className={`${styles.button} ${styles.secondary} ${styles.buttonSmall}`}
                        disabled={busy === project._id}
                        onClick={() =>
                          void run(project._id, () =>
                            restore({ projectId: project._id }),
                          )
                        }
                      >
                        <RotateCcw size={13} />
                        Restore drawing
                      </button>
                    ) : (
                      <>
                        <div className={styles.draftActions}>
                          <Link
                            href={`/studio/${project._id}`}
                            className={`${styles.button} ${styles.secondary} ${styles.buttonSmall}`}
                          >
                            Keep creating
                            <ArrowUpRight size={12} />
                          </Link>
                          <div style={{ display: "flex", gap: 7 }}>
                            <button
                              className={styles.iconButton}
                              title={
                                project.isPinned
                                  ? "Unpin favorite"
                                  : "Pin as favorite"
                              }
                              aria-label={
                                project.isPinned
                                  ? "Unpin favorite"
                                  : "Pin as favorite"
                              }
                              onClick={() =>
                                void run(project._id, () =>
                                  pin({
                                    projectId: project._id,
                                    pinned: !project.isPinned,
                                  }),
                                )
                              }
                            >
                              <Pin
                                size={14}
                                fill={
                                  project.isPinned ? "currentColor" : "none"
                                }
                              />
                            </button>
                            <button
                              className={styles.iconButton}
                              aria-label="Move drawing to recently removed"
                              title="Move to recently removed"
                              onClick={() =>
                                void run(project._id, () =>
                                  trash({ projectId: project._id }),
                                )
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div
                          className={styles.divider}
                          style={{ margin: "15px 0 12px" }}
                        />
                        <button
                          className={styles.textButton}
                          disabled={busy === project._id}
                          onClick={() =>
                            void run(project._id, () =>
                              visibility({
                                projectId: project._id,
                                visibility:
                                  project.visibility === "public"
                                    ? "private"
                                    : "public",
                              }),
                            )
                          }
                        >
                          {project.visibility === "public" ? (
                            <>
                              <LockKeyhole size={12} />
                              Make private
                            </>
                          ) : (
                            <>
                              <Globe2 size={12} />
                              Share in my showcase
                            </>
                          )}
                        </button>
                        {project.artworkId &&
                          project.visibility === "public" && (
                            <Link
                              href={`/artwork/${project.artworkId}`}
                              className={styles.textButton}
                              style={{ float: "right" }}
                              aria-label="View shared artwork"
                            >
                              <ArrowUpRight size={16} />
                            </Link>
                          )}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <Images size={29} strokeWidth={1.3} />
              <h3>
                {tab === "trash"
                  ? "Nothing to recover right now."
                  : tab === "favorites"
                    ? "Save a little space for your favorites."
                    : tab === "public"
                      ? "Your showcase is yours to curate."
                      : "A collection starts with one little drawing."}
              </h3>
              <p>
                {tab === "trash"
                  ? "Drawings you remove from your collection can be restored here."
                  : tab === "favorites"
                    ? "Pin drawings from your collection to gather them here."
                    : tab === "public"
                      ? "Share a drawing from your collection when you’re ready. Everything starts private."
                      : "Start with a blank canvas or a small prompt. You can always come back and keep going."}
              </p>
              {tab === "all" && (
                <Link href="/studio/new" className={styles.button}>
                  Make something yours
                  <ArrowUpRight size={15} />
                </Link>
              )}
            </div>
          )}
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <div className={styles.loadMore}>
              <button
                className={`${styles.button} ${styles.secondary}`}
                disabled={status === "LoadingMore"}
                onClick={() => loadMore(18)}
              >
                {status === "LoadingMore" ? (
                  <Loader2 size={15} />
                ) : (
                  "Load more drawings"
                )}
              </button>
            </div>
          )}
        </>
      )}
      {authLoading && <div className={styles.skeleton} />}
      {!authenticated && !authLoading && (
        <div className={styles.empty}>
          <Images size={29} />
          <h3>Make something before you join.</h3>
          <p>
            You can explore the canvas as a guest. Join when you’re ready to
            save your collection across visits.
          </p>
          <Link href="/studio/new" className={styles.button}>
            Try the canvas
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
    </>
  );
}
