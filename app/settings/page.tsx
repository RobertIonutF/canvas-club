"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Ban,
  Check,
  Download,
  KeyRound,
  Loader2,
  Settings2,
  ShieldCheck,
  Sprout,
  Trophy,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, GuestInvitation, useClub } from "@/components/app-shell";
import { errorMessage, type ClubProfile } from "@/lib/presentation";
import styles from "@/components/club.module.css";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}
function SettingsContent() {
  const { authenticated, profile, authLoading } = useClub();
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>CREATE AT YOUR OWN PACE</p>
          <h1>Make yourself at home.</h1>
          <p>Your name, your goals, your own comfortable corner of the club.</p>
        </div>
        <Settings2 size={30} color="#84976f" strokeWidth={1.3} />
      </div>
      {authLoading || (authenticated && !profile) ? (
        <div className={styles.skeleton} style={{ minHeight: 300 }} />
      ) : authenticated && profile ? (
        <ProfileSettings key={profile.userId} profile={profile} />
      ) : (
        <GuestInvitation
          title="A little space of your own."
          message="Join to choose your maker name, keep a collection, and set a creative goal that fits your life."
        />
      )}
    </>
  );
}
function ProfileSettings({ profile }: { profile: ClubProfile }) {
  const update = useMutation(api.users.update);
  const unblock = useMutation(api.community.unblock);
  const blocked = useQuery(api.community.blockedUsers, {});
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [goal, setGoal] = useState(profile.weeklyGoal);
  const [busy, setBusy] = useState(false);
  const [unblocking, setUnblocking] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await update({
        displayName: displayName.trim(),
        handle: handle.trim().toLowerCase(),
        bio: bio.trim(),
        weeklyGoal: goal,
      });
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.settingsGrid}>
      <section className={styles.panel}>
        <h2>Your maker profile</h2>
        <p>
          Give your little corner a name. Your profile and shared creations are
          public; your drafts stay private.
        </p>
        <form className={styles.form} onSubmit={save}>
          <label className={styles.field}>
            Display name
            <input
              className={styles.input}
              value={displayName}
              maxLength={40}
              minLength={1}
              required
              onChange={(event) => {
                setDisplayName(event.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className={styles.field}>
            Maker handle
            <input
              className={styles.input}
              value={handle}
              minLength={3}
              maxLength={24}
              pattern={"[a-z0-9][a-z0-9_\\-]{2,23}"}
              required
              onChange={(event) => {
                setHandle(event.target.value.toLowerCase().replace(/\s/g, ""));
                setSaved(false);
              }}
              aria-describedby="handle-help"
            />
            <span id="handle-help" className={styles.muted}>
              Lowercase letters, numbers, underscores, and hyphens. Your handle
              is part of your public profile link.
            </span>
          </label>
          <label className={styles.field}>
            A little about you
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              value={bio}
              maxLength={240}
              placeholder="What do you love to make?"
              onChange={(event) => {
                setBio(event.target.value);
                setSaved(false);
              }}
            />
          </label>
          <div className={styles.divider} style={{ margin: "8px 0" }} />
          <label className={styles.field}>
            Your weekly creative goal
            <select
              className={styles.input}
              value={goal}
              onChange={(event) => {
                setGoal(Number(event.target.value));
                setSaved(false);
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "creation" : "creations"} each week
                </option>
              ))}
            </select>
            <span className={styles.muted}>
              An invitation, not an obligation. Miss a day and your earned
              progress stays yours.
            </span>
          </label>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          {saved && (
            <div className={styles.success} role="status">
              Your little corner is updated.
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <button className={styles.button} type="submit" disabled={busy}>
              {busy ? <Loader2 size={15} /> : <Check size={15} />}Save changes
            </button>
            <Link
              className={styles.textButton}
              href={`/artist/${profile.handle}`}
            >
              View my public profile
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </form>
      </section>
      <div style={{ display: "grid", alignContent: "start", gap: 23 }}>
        <section className={styles.panel} style={{ background: "#e9efdf" }}>
          <Sprout size={31} color="#6e8b58" strokeWidth={1.3} />
          <h2 style={{ marginTop: 16 }}>A little art adds up.</h2>
          <div className={styles.nameAndLevel}>
            <span className={styles.levelBadge}>
              <Trophy size={12} />
              Level {profile.level}
            </span>
            <span className={styles.artCount}>{profile.xp} creative XP</span>
          </div>
          <div className={styles.goalNumber}>
            {profile.completedThisWeek}
            <span style={{ color: "#99aa86", fontSize: 25 }}>
              {" "}
              / {profile.weeklyGoal}
            </span>
          </div>
          <p>prompt projects completed this week</p>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{
                width: `${Math.min(100, (profile.completedThisWeek / Math.max(profile.weeklyGoal, 1)) * 100)}%`,
              }}
            />
          </div>
          <p className={styles.notice}>
            Creative XP celebrates showing up and finishing. It doesn’t measure
            talent, and it cannot be bought with AI credits.
          </p>
        </section>
        <section className={styles.panel}>
          <h2 style={{ fontSize: 24 }}>A comfortable club</h2>
          <p>
            Blocked makers are hidden from your community view. Unblock them
            whenever you’re ready.
          </p>
          {blocked === undefined ? (
            <div className={styles.skeleton} style={{ minHeight: 50 }} />
          ) : blocked.length ? (
            blocked.map((maker) => (
              <div className={styles.blockedItem} key={maker.userId}>
                <span>
                  {maker.displayName}
                  <br />
                  <span className={styles.muted}>@{maker.handle}</span>
                </span>
                <button
                  className={styles.textButton}
                  disabled={unblocking === maker.userId}
                  onClick={async () => {
                    setUnblocking(maker.userId);
                    setError("");
                    try {
                      await unblock({ userId: maker.userId });
                    } catch (cause) {
                      setError(errorMessage(cause));
                    } finally {
                      setUnblocking(null);
                    }
                  }}
                >
                  {unblocking === maker.userId ? "Updating…" : "Unblock"}
                </button>
              </div>
            ))
          ) : (
            <p className={styles.featureNote}>
              <Ban size={13} />
              No blocked makers.
            </p>
          )}
        </section>
        <RecoverySettings />
      </div>
    </div>
  );
}

function RecoverySettings() {
  const status = useQuery(api.recovery.status, {});
  const generate = useAction(api.recovery.generate);
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function createCodes(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await generate({ currentPassword });
      setCodes(result.codes);
      setCurrentPassword("");
      setEditing(false);
    } catch (cause) {
      setError(
        errorMessage(
          cause,
          "We couldn't create recovery codes. Check your password and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function downloadCodes() {
    if (!codes) return;
    const text =
      "Canvas Club recovery codes\n\nKeep these codes private. Each code works once. Generating a new set invalidates all older codes.\n\n" +
      codes.join("\n") +
      "\n";
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "canvas-club-recovery-codes.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={styles.panel}>
      <ShieldCheck size={26} color="#6f895a" strokeWidth={1.5} />
      <h2 style={{ fontSize: 24, marginTop: 14 }}>A way back in</h2>
      <p>
        Save recovery codes before you need them. A saved code can reset your
        password if you lose access. Email recovery is not enabled.
      </p>
      {status === undefined ? (
        <p className={styles.muted}>Checking your recovery setup…</p>
      ) : (
        <p className={styles.muted}>
          {status?.configured
            ? `${status.remaining} unused recovery ${status.remaining === 1 ? "code" : "codes"} in your current set.`
            : "You haven't set up recovery codes yet."}
        </p>
      )}
      {codes ? (
        <div>
          <p className={styles.notice}>
            This set is shown once. Save it somewhere private before closing.
            Each code works once; keep it separate from your password.
          </p>
          <pre
            style={{
              margin: "18px 0",
              padding: 14,
              fontSize: 11,
              lineHeight: 2,
              background: "#eef2e4",
              border: "1px solid #d5dec7",
              borderRadius: 8,
              overflowX: "auto",
              color: "#4c6640",
            }}
            aria-label="Private recovery codes"
          >
            {codes.join("\n")}
          </pre>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              className={`${styles.button} ${styles.secondary} ${styles.buttonSmall}`}
              onClick={downloadCodes}
            >
              <Download size={13} />
              Download codes
            </button>
            <button
              className={`${styles.button} ${styles.buttonSmall}`}
              onClick={() => setCodes(null)}
            >
              <Check size={13} />I saved my codes
            </button>
          </div>
        </div>
      ) : editing ? (
        <form className={styles.form} onSubmit={createCodes}>
          <label className={styles.field}>
            Confirm your current password
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
              disabled={busy}
            />
          </label>
          {status?.configured && (
            <p className={styles.notice} style={{ marginTop: 0 }}>
              Creating a new set immediately invalidates your old codes.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className={`${styles.button} ${styles.buttonSmall}`}
              disabled={busy}
              type="submit"
            >
              {busy ? <Loader2 size={13} /> : <KeyRound size={13} />}Generate
              recovery codes
            </button>
            <button
              className={`${styles.button} ${styles.secondary} ${styles.buttonSmall}`}
              disabled={busy}
              type="button"
              onClick={() => {
                setEditing(false);
                setCurrentPassword("");
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className={`${styles.button} ${styles.secondary} ${styles.buttonSmall}`}
          onClick={() => setEditing(true)}
        >
          <KeyRound size={13} />
          {status?.configured
            ? "Replace recovery codes"
            : "Set up recovery codes"}
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
