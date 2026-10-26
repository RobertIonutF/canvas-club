"use client";

import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Bell,
  Check,
  Loader2,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { errorMessage, initials, type ClubProfile } from "@/lib/presentation";
import styles from "./club.module.css";

export function AccountMenu({
  profile,
}: {
  profile: ClubProfile | null | undefined;
}) {
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    results: activity,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.community.notifications,
    {},
    { initialNumItems: 10 },
  );
  const markRead = useMutation(api.community.markNotificationsRead);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActivityOpen(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setActivityOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <div
      ref={rootRef}
      className={styles.account}
      style={{ display: "flex", alignItems: "center", gap: 12 }}
    >
      <button
        className={styles.iconButton}
        aria-label={`Club activity${activity.some((item) => !item.read) ? ", new updates" : ""}`}
        aria-expanded={activityOpen}
        onClick={() => {
          setActivityOpen(!activityOpen);
          setOpen(false);
        }}
        style={{ position: "relative" }}
      >
        <Bell size={17} />
        {activity.some((item) => !item.read) && (
          <span
            style={{
              position: "absolute",
              right: 5,
              top: 5,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#d78394",
              border: "1px solid #fffdf7",
            }}
          />
        )}
      </button>
      <button
        className={styles.avatar}
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setActivityOpen(false);
        }}
      >
        {initials(profile?.displayName)}
      </button>
      {activityOpen && (
        <div
          className={styles.menu}
          style={{
            width: "min(330px, calc(100vw - 40px))",
            maxHeight: "min(540px, 75dvh)",
            overflowY: "auto",
          }}
        >
          <div className={styles.menuName}>Little moments from the club</div>
          {status === "LoadingFirstPage" ? (
            <p className={styles.muted} style={{ padding: 12 }}>
              Finding your activity…
            </p>
          ) : activity.length ? (
            <>
              {activity.map((item) => (
                <Link
                  href={
                    item.artworkId
                      ? `/artwork/${item.artworkId}`
                      : `/artist/${item.actor.handle}`
                  }
                  key={item._id}
                  onClick={() => setActivityOpen(false)}
                  style={{
                    display: "block",
                    lineHeight: 1.6,
                    padding: "11px 9px",
                    background: item.read ? undefined : "#f0f3e7",
                    marginBottom: 4,
                  }}
                >
                  <strong>{item.actor.displayName}</strong>
                  {item.kind === "like"
                    ? " appreciated "
                    : item.kind === "comment"
                      ? " left a comment on "
                      : " is following your creative journey"}
                  {item.artworkId && (
                    <span>{item.title || "your creation"}</span>
                  )}
                </Link>
              ))}
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await markRead({});
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check size={13} />
                Mark activity as read
              </button>
              {(status === "CanLoadMore" || status === "LoadingMore") && (
                <button
                  disabled={status === "LoadingMore"}
                  onClick={() => loadMore(10)}
                >
                  {status === "LoadingMore" ? "Loading…" : "Earlier moments"}
                </button>
              )}
            </>
          ) : (
            <p className={styles.muted} style={{ padding: 12 }}>
              When someone appreciates your work, leaves a comment, or follows
              your profile, you’ll find it here.
            </p>
          )}
          {error && (
            <p className={styles.inlineAlert} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {open && (
        <div className={styles.menu}>
          <div className={styles.menuName}>
            {profile?.displayName || "Your account"}
          </div>
          {profile?.handle && (
            <Link
              href={`/artist/${profile.handle}`}
              onClick={() => setOpen(false)}
            >
              <UserRound size={15} /> My public profile
            </Link>
          )}
          <Link href="/settings" onClick={() => setOpen(false)}>
            <Settings size={15} /> Settings & goals
          </Link>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await signOut();
                setOpen(false);
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 size={15} /> : <LogOut size={15} />} Sign out
          </button>
          {error && (
            <p className={styles.inlineAlert} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
