"use client";
import Link from "next/link";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 520, margin: "15vh auto", padding: 24 }}>
      <p className="eyebrow">A small interruption</p>
      <h1 className="display" style={{ fontSize: 44 }}>
        Let’s try that again.
      </h1>
      <p>
        We couldn’t load this view. Your saved projects remain in your gallery.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
      <Link className="button-secondary" style={{ marginLeft: 10 }} href="/">
        Back to the club
      </Link>
    </main>
  );
}
