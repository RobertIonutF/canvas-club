"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import {
  ArrowUpRight,
  Compass,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/app-shell";
import { ArtCard } from "@/components/art-card";
import styles from "@/components/club.module.css";

type Medium = "manual" | "assisted" | "generated";
export default function ExplorePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className={styles.skeleton} />}>
        <ExploreContent />
      </Suspense>
    </AppShell>
  );
}
function ExploreContent() {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const [submittedSearch, setSubmittedSearch] = useState(search);
  const [medium, setMedium] = useState<Medium | undefined>();
  useEffect(() => {
    const timer = setTimeout(
      () => setSubmittedSearch(search.trim().slice(0, 80)),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const { results, status, loadMore } = usePaginatedQuery(
    api.community.feed,
    { medium, search: submittedSearch || undefined },
    { initialNumItems: 18 },
  );
  const filtered = results;
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>INSPIRATION LIVES HERE</p>
          <h1>A world of little ideas.</h1>
          <p>
            Made by people exploring, practicing, and finding their own way.
            Stay curious, leave a kind word, take a little inspiration.
          </p>
        </div>
        <Link href="/studio/new" className={styles.button}>
          Make your own
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className={styles.filterRow}>
        <div className={styles.tabs} aria-label="Artwork medium">
          {(
            [
              { value: undefined, label: "All creations" },
              { value: "manual", label: "Made by hand" },
              { value: "assisted", label: "AI assisted" },
              { value: "generated", label: "AI generated" },
            ] as const
          ).map((item) => (
            <button
              className={`${styles.tab} ${medium === item.value ? styles.tabActive : ""}`}
              key={item.label}
              onClick={() => setMedium(item.value)}
              aria-pressed={medium === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className={`${styles.search} ${styles.searchWide}`}>
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search artwork titles…"
            aria-label="Search artwork titles"
          />
        </label>
      </div>
      {status === "LoadingFirstPage" ? (
        <div className={styles.artGrid}>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={styles.skeleton} />
          ))}
        </div>
      ) : filtered.length ? (
        <div className={styles.artGrid}>
          {filtered.map((artwork) => (
            <ArtCard key={artwork._id} artwork={artwork} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          {search || medium ? (
            <SlidersHorizontal size={28} />
          ) : (
            <Compass size={31} strokeWidth={1.3} />
          )}
          <h3>
            {search || medium
              ? "No creations in this view yet."
              : "A gallery waiting to grow."}
          </h3>
          <p>
            {search || medium
              ? "Try another filter, or load more creations if they're available."
              : "When makers choose to share their work, you'll find it here. Your creation could be the beginning."}
          </p>
          {search || medium ? (
            <button
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => {
                setSearch("");
                setMedium(undefined);
              }}
            >
              Clear filters
            </button>
          ) : (
            <Link href="/studio/new" className={styles.button}>
              Start creating
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
              <>
                <Loader2 size={15} />
                Loading…
              </>
            ) : (
              "A little more inspiration"
            )}
          </button>
        </div>
      )}
    </>
  );
}
