import Link from "next/link";
export default function NotFound() {
  return (
    <main style={{ maxWidth: 520, margin: "15vh auto", padding: 24 }}>
      <p className="eyebrow">A blank page</p>
      <h1 className="display" style={{ fontSize: 44 }}>
        This little corner is missing.
      </h1>
      <p>The artwork may be private, or the link may have changed.</p>
      <Link className="button" href="/">
        Back to the club
      </Link>
    </main>
  );
}
