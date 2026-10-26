"use client";

import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import {
  ArrowRight,
  ArrowUpRight,
  Flower2,
  Heart,
  Images,
  PencilLine,
  Plus,
  Sparkles,
  Sprout,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, useClub } from "@/components/app-shell";
import { ArtCard } from "@/components/art-card";
import { starters } from "@/lib/presentation";
import styles from "@/components/club.module.css";

export default function HomePage() {
  return (
    <AppShell>
      <HomeContent />
    </AppShell>
  );
}
function HomeContent() {
  const { profile } = useClub();
  const { results, status } = usePaginatedQuery(
    api.community.feed,
    {},
    { initialNumItems: 6 },
  );
  return (
    <>
      <div className={styles.pageHeading} style={{ marginBottom: 22 }}>
        <div>
          <p className={styles.eyebrow}>A GOOD DAY TO MAKE SOMETHING</p>
          <h1
            style={{
              fontFamily: "inherit",
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            Hello
            {profile
              ? `, ${profile.displayName.split(" ")[0]}`
              : ", creative soul"}{" "}
            <span style={{ color: "#d99a36" }}>✷</span>
          </h1>
          <p style={{ marginTop: 7, fontSize: 13 }}>
            A small idea. A few brushstrokes. Something only you could make.
          </p>
        </div>
      </div>
      <section className={styles.hero} aria-labelledby="home-hero-title">
        <div className={styles.heroText}>
          <span className={styles.tag}>
            <Sprout size={12} />A little less scrolling. A little more creating.
          </span>
          <h1 id="home-hero-title">
            Make room for
            <br />
            <em>your imagination.</em>
          </h1>
          <p>
            Draw, paint, try something unexpected. Your own little corner of the
            internet to make art and grow at your pace.
          </p>
          <div className={styles.heroActions}>
            <Link href="/studio/new" className={styles.button}>
              <PencilLine size={16} />
              Let’s make something
              <ArrowUpRight size={15} />
            </Link>
            <Link href="/explore" className={styles.textButton}>
              Look around
              <ArrowRight size={14} />
            </Link>
          </div>
          <p className={styles.smallNote}>
            No perfect lines required. Just a little curiosity.
          </p>
        </div>
        <div className={styles.heroArt}>
          <Flower2 size={63} className={styles.heroDoodle} strokeWidth={1} />
          <img
            src="/art/sunday-lemons.svg"
            alt="Original Canvas Club starter illustration: sunny lemons on a plate beside a blue flower vase"
          />
          <span className={styles.heroArtLabel}>
            a little practice, a lot of possibility ✳
          </span>
        </div>
      </section>
      <div className={styles.belowHero}>
        <section className={styles.dailyCard}>
          <img
            src="/art/tea-time.svg"
            alt="Original tea-time drawing prompt illustration"
            className={styles.dailyArt}
          />
          <div>
            <span
              className={styles.tag}
              style={{ background: "#f6e9b7", color: "#8b763b" }}
            >
              YOUR NEXT LITTLE PROJECT
            </span>
            <h2>A cup of something cozy</h2>
            <p>
              Play with shapes, add your favorite colors, and make an ordinary
              moment your own.
            </p>
            <Link
              href="/studio/new?starter=tea-time"
              className={styles.textButton}
            >
              Try this prompt
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>
        <section className={styles.littleCard}>
          <Heart size={38} strokeWidth={1.1} />
          <span className={styles.eyebrow}>GOOD THINGS TAKE PRACTICE</span>
          <h2>Small steps. Real progress.</h2>
          <p>
            {profile
              ? `You’ve finished ${profile.completedThisWeek} ${profile.completedThisWeek === 1 ? "creation" : "creations"} this week. Make space for your next one.`
              : "Keep a collection of your creations and see how far your curiosity takes you."}
          </p>
          <Link
            href={profile ? "/gallery" : "/settings"}
            className={styles.textButton}
          >
            {profile ? "See your collection" : "Find your own rhythm"}
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <section>
        <div className={styles.sectionHeading}>
          <div>
            <h2>What are you in the mood for?</h2>
            <p>A few starting points. Take them anywhere.</p>
          </div>
          <Link href="/challenges" className={styles.textButton}>
            All prompts
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className={styles.promptGrid}>
          {starters.map((starter) => (
            <Link
              href={`/studio/new?starter=${starter.slug}`}
              className={styles.promptCard}
              key={starter.slug}
              style={{ background: starter.color }}
            >
              <img
                src={starter.image}
                alt={`Original starter illustration: ${starter.title}`}
              />
              <div className={styles.promptCaption}>
                <div>
                  <h3>{starter.title}</h3>
                  <p>{starter.detail}</p>
                </div>
                <ArrowUpRight size={16} color="#8a987a" />
              </div>
            </Link>
          ))}
        </div>
        <p className={styles.featureNote}>
          <Sparkles size={12} />
          Original starter illustrations. Your drawing can be completely
          different.
        </p>
      </section>
      <section>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Fresh from the club</h2>
            <p>A window into what other makers are creating.</p>
          </div>
          <Link href="/explore" className={styles.textButton}>
            Explore the gallery
            <ArrowRight size={14} />
          </Link>
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
            <Images size={29} strokeWidth={1.3} />
            <h3>Every club starts with a first creation.</h3>
            <p>
              The community gallery is ready for its first makers. Make
              something, then choose whether to share it.
            </p>
            <Link href="/studio/new" className={styles.button}>
              <Plus size={15} />
              Make the first mark
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
