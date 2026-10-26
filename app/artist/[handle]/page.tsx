"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Check,
  Images,
  Loader2,
  Settings2,
  Sprout,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { AppShell, useClub } from "@/components/app-shell";
import { ArtCard } from "@/components/art-card";
import { errorMessage, initials } from "@/lib/presentation";
import styles from "@/components/club.module.css";

export default function ArtistPage() {
  return (
    <AppShell>
      <ArtistContent />
    </AppShell>
  );
}
function ArtistContent() {
  const { handle } = useParams<{ handle: string }>();
  const artist = useQuery(api.users.getByHandle, { handle });
  const { results, status, loadMore } = usePaginatedQuery(
    api.community.byArtist,
    { handle },
    { initialNumItems: 12 },
  );
  const { profile, requireAuth } = useClub();
  const block = useMutation(api.community.block);
  const follow = useMutation(api.community.follow);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  if (artist === undefined)
    return <div className={styles.skeleton} style={{ minHeight: 350 }} />;
  if (!artist)
    return (
      <>
        <Link className={styles.back} href="/explore">
          <ArrowLeft size={14} />
          Back to the club
        </Link>
        <div className={styles.empty}>
          <Images size={28} />
          <h3>This creative corner isn’t here.</h3>
          <p>
            The maker may have changed their handle, or the profile isn’t
            available.
          </p>
          <Link className={styles.button} href="/explore">
            Explore the club
          </Link>
        </div>
      </>
    );
  const mine = artist.userId === profile?.userId;
  return (
    <>
      <Link className={styles.back} href="/explore">
        <ArrowLeft size={14} />
        Back to the club
      </Link>
      <section className={styles.profileBanner}>
        <div className={styles.profileAvatar}>
          {initials(artist.displayName)}
        </div>
        <div>
          <p className={styles.eyebrow} style={{ marginTop: 0 }}>
            A MAKER’S LITTLE CORNER
          </p>
          <h1>{artist.displayName}</h1>
          <span className={styles.profileHandle}>@{artist.handle}</span>
          {artist.bio && <p>{artist.bio}</p>}
          <div className={styles.stats}>
            <div>
              <strong>{artist.level}</strong>creative level
            </div>
            <div>
              <strong>{artist.xp}</strong>practice XP
            </div>
          </div>
        </div>
        <div
          className={styles.profileActions}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {!mine && (
            <button
              className={`${styles.button} ${styles.buttonSmall}`}
              disabled={busy || blocked}
              onClick={async () => {
                if (
                  !requireAuth(
                    "Join to follow this maker and find your creative people.",
                  )
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  await follow({ userId: artist.userId });
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {artist.following ? <Check size={13} /> : <UserPlus size={13} />}
              {artist.following ? "Following" : "Follow maker"}
            </button>
          )}
          {mine ? (
            <Link
              href="/settings"
              className={`${styles.button} ${styles.secondary} ${styles.buttonSmall}`}
            >
              <Settings2 size={13} />
              Edit profile
            </Link>
          ) : (
            <button
              className={`${styles.button} ${styles.secondary} ${styles.buttonSmall}`}
              disabled={busy || blocked}
              onClick={async () => {
                if (!requireAuth("Sign in to manage which makers you see."))
                  return;
                setBusy(true);
                setError("");
                try {
                  await block({ userId: artist.userId });
                  setBlocked(true);
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Ban size={13} />
              {blocked ? "Maker blocked" : "Block maker"}
            </button>
          )}
        </div>
      </section>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {blocked && (
        <p className={styles.success} role="status">
          This maker is blocked. You can undo this in Settings & goals.
        </p>
      )}
      <div className={styles.sectionHeading}>
        <div>
          <h2>
            {mine
              ? "Your public showcase"
              : "A collection of little possibilities"}
          </h2>
          <p>
            {mine
              ? "Only drawings you’ve chosen to share appear here."
              : "Selected creations, shared by their maker."}
          </p>
        </div>
        <Sprout size={25} color="#819969" strokeWidth={1.4} />
      </div>
      {status === "LoadingFirstPage" ? (
        <div className={styles.artGrid}>
          {[0, 1, 2].map((n) => (
            <div className={styles.skeleton} key={n} />
          ))}
        </div>
      ) : results.length ? (
        <div className={styles.artGrid}>
          {results.map((artwork) => (
            <ArtCard key={artwork._id} artwork={artwork} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <Images size={28} />
          <h3>
            {mine
              ? "A showcase ready for your favorites."
              : "A little space, still growing."}
          </h3>
          <p>
            {mine
              ? "Choose a drawing in your collection and share it when you’re ready."
              : "This maker hasn’t shared any creations here yet."}
          </p>
          {mine && (
            <Link className={styles.button} href="/gallery">
              Curate my showcase
              <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className={styles.loadMore}>
          <button
            className={`${styles.button} ${styles.secondary}`}
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(12)}
          >
            {status === "LoadingMore" ? (
              <Loader2 size={15} />
            ) : (
              "More from this maker"
            )}
          </button>
        </div>
      )}
    </>
  );
}
