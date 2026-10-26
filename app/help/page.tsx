import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function Help() {
  return (
    <AppShell>
      <article
        style={{ maxWidth: 780, margin: "12px auto 60px", lineHeight: 1.8 }}
      >
        <p className="eyebrow">A FEW GOOD THINGS TO KNOW</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1.08 }}
        >
          Make yourself at home.
        </h1>
        <p>
          Canvas Club is a space to draw, try small creative projects, and share
          only what you choose.
        </p>
        <h2>Start with a little play</h2>
        <p>
          Open a blank canvas or choose a starter illustration. Paint with a
          mouse, finger, or pen. Use layers to keep experiments separate, undo
          to try again, and the PNG button to export a finished picture.
        </p>
        <p>
          <Link className="button" href="/studio/new">
            Open a canvas
          </Link>
        </p>
        <h2>Keep a copy you can come back to</h2>
        <p>
          Guest drafts are saved in this browser on this device. Clearing
          browser data removes these copies. Join and save for a cloud backup,
          then use your collection to reopen a drawing elsewhere. Watch the save
          status before leaving.
        </p>
        <p>
          Use <strong>Project backup</strong> in the studio to download your
          editable layers. The import button reopens that file. Cloud history
          keeps the most recent 20 saves; recently removed drawings can be
          restored from your collection.
        </p>
        <h2>AI is a choice, not a requirement</h2>
        <p>
          AI help can make a starter or propose a change to your saved sketch.
          Your prompt and, for edits, your saved canvas preview are sent to
          OpenAI. Each attempt uses one daily request. The beta allows three
          requests per artist each UTC day, with a shared production allowance
          of 30.
        </p>
        <p>
          Nothing is applied automatically. Add a proposal as a new layer or
          discard it. Your original layers remain. Completed undecided proposals
          can be reopened after a reload. AI can change details beyond your
          instructions, so compare before keeping a result.
        </p>
        <h2>Your showcase is yours to curate</h2>
        <p>
          Projects begin private. Sharing publishes a flattened preview, title,
          description and your public profile name. Other members can like it
          and leave comments. Your editable layers stay private.
        </p>
        <p>
          Making a piece private removes its public preview from the app. It
          cannot recall a copy someone already downloaded. Pin up to six
          personal favorites in your collection. Public process labels describe
          assistance recorded in this app; they do not certify authorship.
        </p>
        <h2>Progress without a popularity contest</h2>
        <p>
          Finish current creative prompts to earn creative XP. Rewards are
          granted once per prompt and project, with up to three practice rewards
          per day. Levels record participation; they are not a measurement of
          artistic skill. Set a weekly goal that fits your life.
        </p>
        <h2>Take care of your account</h2>
        <p>
          After joining, visit Settings and generate your six recovery codes.
          Keep the downloaded codes somewhere private. A recovery code can reset
          your password once; generating a new set replaces the previous set.
          Email-based recovery is not enabled.
        </p>
        <h2>Be good company</h2>
        <p>
          Share work you have the right to post. Give specific, considerate
          feedback. Respect other people’s privacy, and do not use artwork or
          comments to target, harass, or exploit anyone. Use the artwork report
          control when something needs review, and block a member to stop seeing
          their work and comments in your account.
        </p>
        <p>
          Reports enter the app owner’s review queue. There is no promise of
          instant or automatic human moderation.
        </p>
        <h2>Something needs fixing?</h2>
        <p>
          <a
            href="https://github.com/RobertIonutF/canvas-club/issues"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--forest)", textDecoration: "underline" }}
          >
            Report a bug or request a feature on GitHub
          </a>
          . Keep passwords, recovery codes, and private project files out of
          public reports.
        </p>
      </article>
    </AppShell>
  );
}
