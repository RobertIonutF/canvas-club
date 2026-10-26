"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Flower2, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/presentation";
import styles from "./club.module.css";

export function AuthDialog({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string;
}) {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp" | "recovery">("signUp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    emailRef.current?.focus();
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-auth-dialog] button:not(:disabled), [data-auth-dialog] input, [data-auth-dialog] a",
        ),
      ).filter((el) => el.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, busy, flow, onClose]);

  if (!open) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    if (flow !== "recovery") data.set("flow", flow);
    try {
      await signIn(flow === "recovery" ? "recovery" : "password", data);
      onClose();
    } catch (cause) {
      setError(
        errorMessage(
          cause,
          "We couldn't sign you in. Check your details and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        data-auth-dialog
      >
        <button
          ref={closeRef}
          className={`${styles.iconButton} ${styles.closeDialog}`}
          onClick={onClose}
          disabled={busy}
          aria-label="Close sign in"
        >
          <X size={18} />
        </button>
        <div className={styles.dialogMark}>
          <Flower2 size={29} />
        </div>
        <h2 id="auth-title">
          {flow === "signUp"
            ? "A little space to create."
            : flow === "recovery"
              ? "Find your way back."
              : "Welcome back, maker."}
        </h2>
        <p>
          {flow === "signUp"
            ? "Save your drawings, grow your collection, and find your creative people."
            : flow === "recovery"
              ? "Use a recovery code you previously saved in Settings to choose a new password."
              : "Your drawings and next good idea are waiting for you."}
        </p>
        {reason && <p className={styles.authReason}>{reason}</p>}
        <form key={flow} className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            Email address
            <input
              ref={emailRef}
              className={styles.input}
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              placeholder="you@example.com"
            />
          </label>
          {flow === "recovery" && (
            <label className={styles.field}>
              Saved recovery code
              <input
                className={styles.input}
                name="code"
                type="password"
                autoComplete="one-time-code"
                required
                disabled={busy}
                placeholder="One unused code"
              />
            </label>
          )}
          <label className={styles.field}>
            {flow === "recovery" ? "New password" : "Password"}
            <input
              className={styles.input}
              name={flow === "recovery" ? "newPassword" : "password"}
              type="password"
              autoComplete={
                flow === "signIn" ? "current-password" : "new-password"
              }
              minLength={8}
              maxLength={128}
              required
              disabled={busy}
              placeholder={
                flow === "signIn" ? "Your password" : "At least 8 characters"
              }
            />
          </label>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          <button
            className={`${styles.button} ${styles.stretch}`}
            type="submit"
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Just a moment…
              </>
            ) : flow === "signUp" ? (
              "Create my account"
            ) : flow === "recovery" ? (
              "Recover my account"
            ) : (
              "Sign in"
            )}
          </button>
        </form>
        <div className={styles.formFoot}>
          {flow === "signUp"
            ? "Already part of the club? "
            : flow === "recovery"
              ? "Remember your password? "
              : "New around here? "}
          <button
            className={styles.textButton}
            disabled={busy}
            onClick={() => {
              setFlow(
                flow === "signUp" || flow === "recovery" ? "signIn" : "signUp",
              );
              setError("");
            }}
          >
            {flow === "signUp" || flow === "recovery"
              ? "Sign in"
              : "Create an account"}
          </button>
        </div>
        {flow === "signIn" && (
          <div className={styles.formFoot} style={{ marginTop: 14 }}>
            <button
              className={styles.textButton}
              disabled={busy}
              onClick={() => {
                setFlow("recovery");
                setError("");
              }}
            >
              Forgot your password? Use a saved recovery code.
            </button>
          </div>
        )}
        <p className={styles.notice}>
          {flow === "recovery"
            ? "Recovery needs a previously saved code. Email recovery is not enabled. Each code can be used once."
            : "After joining, save your recovery codes in Settings. Email-based password recovery is not enabled."}
        </p>
      </section>
    </div>
  );
}
