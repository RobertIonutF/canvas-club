"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Flag,
  Heart,
  Images,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, useClub } from "@/components/app-shell";
import { errorMessage, friendlyDate } from "@/lib/presentation";
import styles from "@/components/club.module.css";

export default function ArtworkPage() {
  return (
    <AppShell>
      <ArtworkContent />
    </AppShell>
  );
}
function ArtworkContent() {
  const { id } = useParams<{ id: string }>();
  const validId = /^[a-z0-9]{20,64}$/.test(id);
  const artworkId = id as Id<"artworks">;
  const artwork = useQuery(
    api.community.getArtwork,
    validId ? { artworkId } : "skip",
  );
  const {
    results: comments,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.community.listComments,
    validId && artwork ? { artworkId } : "skip",
    { initialNumItems: 20 },
  );
  const like = useMutation(api.community.like);
  const comment = useMutation(api.community.comment);
  const report = useMutation(api.community.report);
  const block = useMutation(api.community.block);
  const deleteComment = useMutation(api.community.deleteComment);
  const { authenticated, requireAuth, askAuth, profile } = useClub();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSent, setReportSent] = useState(false);
  async function run(
    key: string,
    action: () => Promise<unknown>,
    message?: string,
  ) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      if (message) setNotice(message);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  }
  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!requireAuth("Join the conversation and leave a thoughtful word."))
      return;
    if (!body.trim()) return;
    await run(
      "comment",
      async () => {
        await comment({ artworkId, body: body.trim() });
        setBody("");
      },
      "Your comment is part of the conversation.",
    );
  }
  if (validId && artwork === undefined)
    return <div className={styles.skeleton} style={{ minHeight: 450 }} />;
  if (!validId || !artwork)
    return (
      <>
        <Link href="/explore" className={styles.back}>
          <ArrowLeft size={14} />
          Back to the club
        </Link>
        <div className={styles.empty}>
          <Images size={30} />
          <h3>This creation isn’t available.</h3>
          <p>
            The maker may have made it private, or this link may have changed.
          </p>
          <Link className={styles.button} href="/explore">
            Find a little inspiration
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </>
    );
  return (
    <>
      <Link href="/explore" className={styles.back}>
        <ArrowLeft size={14} />
        Back to the club
      </Link>
      <div className={styles.artworkLayout}>
        <section className={styles.artworkCanvas}>
          {artwork.imageUrl ? (
            <img src={artwork.imageUrl} alt={artwork.title} />
          ) : (
            <div className={styles.empty}>
              <Images size={26} />
              <p>This preview isn’t available.</p>
            </div>
          )}
        </section>
        <aside className={styles.artworkPanel}>
          <span className={styles.tag}>
            {artwork.medium !== "manual" && <Sparkles size={11} />}
            {artwork.medium === "manual"
              ? "MADE BY HAND"
              : artwork.medium === "generated"
                ? "AI GENERATED"
                : "AI ASSISTED"}
          </span>
          <h1>{artwork.title}</h1>
          <Link
            className={styles.artist}
            href={`/artist/${artwork.artist.handle}`}
          >
            by {artwork.artist.displayName}
            <ArrowUpRight size={11} />
          </Link>
          <p className={styles.artworkDescription}>
            {artwork.description ||
              "A little idea, brought to life by its maker."}
          </p>
          <span className={styles.muted}>
            Shared {friendlyDate(artwork.createdAt)}
          </span>
          <div className={styles.artworkActions}>
            <button
              className={`${styles.button} ${styles.secondary} ${artwork.likedByMe ? styles.liked : ""}`}
              aria-pressed={artwork.likedByMe}
              disabled={!!busy}
              onClick={() => {
                if (!requireAuth("Join to appreciate this creation.")) return;
                void run("like", () => like({ artworkId }));
              }}
            >
              <Heart
                size={15}
                fill={artwork.likedByMe ? "currentColor" : "none"}
              />
              {artwork.likesCount}
              <span className="sr-only">appreciations</span>
            </button>
            <button
              className={`${styles.button} ${styles.secondary}`}
              disabled={!!busy}
              onClick={() =>
                void run(
                  "share",
                  async () => {
                    await navigator.clipboard.writeText(window.location.href);
                  },
                  "Link copied. Share a little inspiration.",
                )
              }
            >
              <Share2 size={14} />
              Share
            </button>
          </div>
          <p className={styles.notice}>
            {artwork.medium === "manual"
              ? "The maker recorded this as manual work in Canvas Club. Imported content isn’t independently verified."
              : "The maker used image generation or AI assistance in this creation. Creative XP records participation, not an art-skill rating."}
          </p>
          {profile?.userId !== artwork.artist.userId && (
            <div
              style={{
                display: "flex",
                gap: 15,
                marginTop: 22,
                flexWrap: "wrap",
              }}
            >
              <button
                className={styles.textButton}
                onClick={() => {
                  if (requireAuth("Sign in to report a concern to the club."))
                    setReportOpen(!reportOpen);
                }}
              >
                <Flag size={12} />
                Report a concern
              </button>
              <button
                className={styles.textButton}
                disabled={!!busy}
                onClick={() => {
                  if (!requireAuth("Sign in to manage the makers you see."))
                    return;
                  void run(
                    "block",
                    () => block({ userId: artwork.artist.userId }),
                    "Maker blocked. Manage blocked makers in Settings & goals.",
                  );
                }}
              >
                <Ban size={12} />
                Block maker
              </button>
            </div>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.success} role="status">
              {notice}
            </p>
          )}
          {reportOpen && (
            <form
              className={styles.form}
              style={{ marginTop: 20 }}
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  "report",
                  async () => {
                    await report({ artworkId, reason: reportReason.trim() });
                    setReportSent(true);
                    setReportOpen(false);
                  },
                  "Your report was recorded for review. Thank you for helping care for the club.",
                );
              }}
            >
              <label className={styles.field}>
                What should we review?
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  required
                  minLength={5}
                  maxLength={800}
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  placeholder="Tell us what’s concerning about this creation or conversation."
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={styles.button}
                  type="submit"
                  disabled={!!busy || reportSent}
                >
                  <Flag size={13} />
                  Send report
                </button>
                <button
                  className={`${styles.button} ${styles.secondary}`}
                  type="button"
                  onClick={() => setReportOpen(false)}
                >
                  <X size={13} />
                  Cancel
                </button>
              </div>
            </form>
          )}
        </aside>
      </div>
      <section
        className={`${styles.panel} ${styles.comments}`}
        style={{ maxWidth: 860, marginTop: 26 }}
      >
        <h2>
          <MessageCircle
            size={19}
            style={{
              display: "inline",
              marginRight: 8,
              verticalAlign: "middle",
            }}
          />
          A conversation around the canvas
        </h2>
        <p>
          Be specific, be kind, and help each other keep creating. Suggestions
          land best when they’re invited.
        </p>
        {authenticated ? (
          <form className={styles.form} onSubmit={submitComment}>
            <label className={styles.field}>
              Leave a thoughtful word
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What caught your eye? A color, a detail, a feeling…"
                required
                maxLength={1000}
                disabled={busy === "comment"}
              />
            </label>
            <div>
              <button
                className={styles.button}
                type="submit"
                disabled={busy === "comment" || !body.trim()}
              >
                {busy === "comment" ? (
                  <Loader2 size={14} />
                ) : (
                  <Send size={14} />
                )}
                Post comment
              </button>
            </div>
          </form>
        ) : (
          <div className={`${styles.empty} ${styles.insetEmpty}`}>
            <p>Join the club to leave a comment and connect with this maker.</p>
            <button
              className={`${styles.button} ${styles.secondary}`}
              onClick={() =>
                askAuth(
                  "Join to talk about the work, ask questions, and encourage other makers.",
                )
              }
            >
              Join the conversation
            </button>
          </div>
        )}
        {status === "LoadingFirstPage" ? (
          <div
            className={styles.skeleton}
            style={{ minHeight: 90, marginTop: 18 }}
          />
        ) : comments.length ? (
          comments.map((item) => (
            <article className={styles.comment} key={item._id}>
              <div className={styles.commentMeta}>
                <Link href={`/artist/${item.author.handle}`}>
                  {item.author.displayName}
                </Link>
                <span
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  {friendlyDate(item.createdAt)}
                  {item.author.userId === profile?.userId && (
                    <button
                      className={styles.textButton}
                      aria-label="Delete your comment"
                      disabled={!!busy}
                      onClick={() =>
                        void run(
                          "delete-comment",
                          () => deleteComment({ commentId: item._id }),
                          "Your comment was removed.",
                        )
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              </div>
              <p>{item.body}</p>
            </article>
          ))
        ) : (
          <p className={styles.muted} style={{ paddingTop: 24 }}>
            A quiet canvas for now. A thoughtful first comment can make
            someone’s day.
          </p>
        )}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div className={styles.loadMore}>
            <button
              className={`${styles.button} ${styles.secondary}`}
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
            >
              {status === "LoadingMore" ? "Loading…" : "Earlier comments"}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
