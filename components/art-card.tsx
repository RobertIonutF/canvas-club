"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { Heart, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage, type ArtworkPresentation } from "@/lib/presentation";
import { useClub } from "./app-shell";
import styles from "./club.module.css";

export function ArtCard({ artwork }: { artwork: ArtworkPresentation }) {
  const { requireAuth } = useClub();
  const like = useMutation(api.community.like);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <article className={styles.artCard}>
      <Link
        className={styles.artImageLink}
        href={`/artwork/${artwork._id}`}
        aria-label={`View ${artwork.title}`}
      >
        {artwork.imageUrl ? (
          <img src={artwork.imageUrl} alt={artwork.title} loading="lazy" />
        ) : (
          <div className={styles.skeleton} aria-label="Preview unavailable" />
        )}
        {artwork.medium !== "manual" && (
          <span className={styles.artLabel}>
            <Sparkles size={9} style={{ display: "inline", marginRight: 3 }} />
            {artwork.medium === "generated" ? "AI starter" : "AI assisted"}
          </span>
        )}
      </Link>
      <div className={styles.artMeta}>
        <div>
          <h3>
            <Link href={`/artwork/${artwork._id}`}>{artwork.title}</Link>
          </h3>
          <Link
            className={styles.artist}
            href={`/artist/${artwork.artist.handle}`}
          >
            {artwork.artist.displayName}
          </Link>
        </div>
        <button
          className={`${styles.likeButton} ${artwork.likedByMe ? styles.liked : ""}`}
          aria-label={`${artwork.likedByMe ? "Remove appreciation for" : "Appreciate"} ${artwork.title}`}
          aria-pressed={artwork.likedByMe}
          disabled={busy}
          onClick={async () => {
            if (!requireAuth("Join to appreciate another maker's work."))
              return;
            setBusy(true);
            setError("");
            try {
              await like({ artworkId: artwork._id });
            } catch (cause) {
              setError(errorMessage(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Heart size={15} fill={artwork.likedByMe ? "currentColor" : "none"} />
          {artwork.likesCount}
        </button>
      </div>
      {error && (
        <p className={styles.inlineAlert} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
