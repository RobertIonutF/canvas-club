"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  Check,
  Flower2,
  Lightbulb,
  Sparkles,
  Trophy,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, useClub } from "@/components/app-shell";
import { starters } from "@/lib/presentation";
import styles from "@/components/club.module.css";

export default function ChallengesPage() {
  return (
    <AppShell>
      <ChallengesContent />
    </AppShell>
  );
}
function ChallengesContent() {
  const challenges = useQuery(api.challenges.list, {});
  const { authenticated, askAuth } = useClub();
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>FOLLOW YOUR CURIOSITY</p>
          <h1>A small spark goes a long way.</h1>
          <p>
            Pick a project, make it yours, and finish when it feels right. These
            are starting points, never a test of how good you are.
          </p>
        </div>
        <Flower2 size={44} strokeWidth={1.2} color="#c6a345" />
      </div>
      <div className={styles.banner}>
        <Lightbulb size={27} color="#998237" />
        <p>
          <strong>Practice earns progress.</strong> Finish a project to earn
          creative XP. AI credits stay separate, and there are no points for
          buying generations.{" "}
          {authenticated ? (
            "Completed projects count toward your weekly goal."
          ) : (
            <button
              className={styles.textButton}
              onClick={() =>
                askAuth("Join to save your progress and earn creative XP.")
              }
            >
              Join to keep your progress
              <ArrowUpRight size={12} />
            </button>
          )}
        </p>
      </div>
      <div className={styles.sectionHeading}>
        <div>
          <h2>A little challenge for you</h2>
          <p>One subject. Your colors, your ideas, your own kind of magic.</p>
        </div>
        <span className={styles.artCount}>New possibilities, at your pace</span>
      </div>
      {challenges === undefined ? (
        <div className={styles.challengeGrid}>
          {[0, 1, 2].map((n) => (
            <div className={styles.skeleton} key={n} />
          ))}
        </div>
      ) : challenges.length ? (
        <div className={styles.challengeGrid}>
          {challenges.map((challenge, index) => {
            const starter =
              "starter" in challenge
                ? String(challenge.starter)
                : [
                    "tea-time",
                    "moon-garden",
                    "friendly-monster",
                    "little-cabin",
                    "wildflowers",
                    "sunday-lemons",
                  ][index % 6];
            return (
              <article className={styles.challengeCard} key={challenge.id}>
                <img
                  src={`/art/${starter}.svg`}
                  alt={`Original starter illustration for ${challenge.title}`}
                />
                <div className={styles.challengeBody}>
                  <span
                    className={styles.tag}
                    style={{
                      background: challenge.completed ? "#e4edd7" : "#f6e9b9",
                      color: challenge.completed ? "#587047" : "#8e7b41",
                    }}
                  >
                    {challenge.completed ? (
                      <Check size={12} />
                    ) : (
                      <Trophy size={12} />
                    )}
                    {challenge.completed
                      ? "COMPLETE · NICE WORK"
                      : `${challenge.kind === "weekly" ? "WEEKLY" : "DAILY"} PROJECT · ${challenge.xp} XP`}
                  </span>
                  <h2>{challenge.title}</h2>
                  <p>{challenge.description || challenge.prompt}</p>
                  <Link
                    className={`${styles.button} ${challenge.completed ? styles.secondary : ""}`}
                    href={
                      challenge.projectId
                        ? `/studio/${challenge.projectId}`
                        : `/studio/new?challenge=${encodeURIComponent(challenge.id)}&starter=${encodeURIComponent(starter)}`
                    }
                  >
                    {challenge.completed
                      ? "Revisit your creation"
                      : "Try this project"}
                    <ArrowUpRight size={14} />
                  </Link>
                  <span className={styles.challengeMeta}>
                    Starter illustration · your version can look different
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <Trophy size={28} />
          <h3>No scheduled challenges right now.</h3>
          <p>
            There is always room to start with your own idea, or choose one of
            the prompts below.
          </p>
          <Link className={styles.button} href="/studio/new">
            Start a blank canvas
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      <section>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Or wander somewhere new</h2>
            <p>No deadline. No right answer. Just a starting point.</p>
          </div>
        </div>
        <div className={styles.promptGrid}>
          {starters.map((starter) => (
            <Link
              href={`/studio/new?starter=${starter.slug}`}
              className={styles.promptCard}
              key={starter.slug}
            >
              <img
                src={starter.image}
                alt={`Original illustration: ${starter.title}`}
              />
              <div className={styles.promptCaption}>
                <div>
                  <h3>{starter.title}</h3>
                  <p>{starter.detail}</p>
                </div>
                <ArrowUpRight size={15} />
              </div>
            </Link>
          ))}
        </div>
        <p className={styles.featureNote}>
          <Sparkles size={12} />
          Manual drawing and optional AI assistance both have a place here.
        </p>
      </section>
    </>
  );
}
