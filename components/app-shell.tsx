"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Compass,
  Flower2,
  House,
  Images,
  Palette,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sprout,
  Trophy,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import { AuthDialog } from "./auth-dialog";
import { AccountMenu } from "./account-menu";
import { errorMessage, type ClubProfile } from "@/lib/presentation";
import styles from "./club.module.css";

type ClubContext = {
  profile: ClubProfile | null | undefined;
  authenticated: boolean;
  authLoading: boolean;
  askAuth: (reason?: string) => void;
  requireAuth: (reason?: string) => boolean;
};
const Context = createContext<ClubContext | null>(null);
export function useClub() {
  const value = useContext(Context);
  if (!value) throw new Error("Canvas Club context is missing");
  return value;
}

const nav = [
  { href: "/", label: "Your studio", mobile: "Home", icon: House },
  {
    href: "/explore",
    label: "Explore the club",
    mobile: "Explore",
    icon: Compass,
  },
  {
    href: "/challenges",
    label: "Creative prompts",
    mobile: "Prompts",
    icon: Trophy,
  },
  {
    href: "/gallery",
    label: "My collection",
    mobile: "Collection",
    icon: Images,
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const ensure = useMutation(api.users.ensureProfile);
  const ensured = useRef(false);
  const [profileError, setProfileError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [reason, setReason] = useState("");
  const close = useCallback(() => setAuthOpen(false), []);
  const askAuth = useCallback((message = "") => {
    setReason(message);
    setAuthOpen(true);
  }, []);
  const requireAuth = useCallback(
    (message?: string) => {
      if (isAuthenticated) return true;
      askAuth(message);
      return false;
    },
    [isAuthenticated, askAuth],
  );
  useEffect(() => {
    if (!isAuthenticated) {
      ensured.current = false;
      return;
    }
    if (
      profile !== undefined &&
      (!profile || !profile.handle) &&
      !ensured.current
    ) {
      ensured.current = true;
      void ensure({}).catch((cause) => {
        setProfileError(errorMessage(cause));
        ensured.current = false;
      });
    }
  }, [isAuthenticated, profile, ensure]);
  return (
    <Context.Provider
      value={{
        profile,
        authenticated: isAuthenticated,
        authLoading: isLoading,
        askAuth,
        requireAuth,
      }}
    >
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Link className={styles.brand} href="/" aria-label="Canvas Club home">
            <span className={styles.brandmark}>
              <Flower2 size={27} strokeWidth={1.8} />
            </span>
            Canvas Club
            <span style={{ color: "#94a080", fontSize: 14 }}>✳</span>
          </Link>
          <p className={styles.navLabel}>A LITTLE ROOM FOR ART</p>
          <nav className={styles.nav} aria-label="Main navigation">
            {nav.map((item) => (
              <Link
                className={`${styles.navLink} ${path === item.href ? styles.navActive : ""}`}
                href={item.href}
                key={item.href}
              >
                <item.icon size={19} strokeWidth={1.8} />
                {item.label}
              </Link>
            ))}
          </nav>
          <p className={styles.navLabel}>MAKE IT YOURS</p>
          <nav className={styles.nav} aria-label="Personal navigation">
            <Link
              href="/settings"
              className={`${styles.navLink} ${path === "/settings" ? styles.navActive : ""}`}
            >
              <Settings2 size={18} />
              Settings & goals
            </Link>
          </nav>
          <div className={styles.sidebarCard}>
            <Sprout size={28} strokeWidth={1.5} />
            <h3>
              {profile
                ? `Level ${profile.level} · Growing artist`
                : "A little art, a little often."}
            </h3>
            <p>
              {profile
                ? `${profile.completedThisWeek} of ${profile.weeklyGoal} creations this week. Every finished piece is a step.`
                : "You don't have to be good at it to make something good for you."}
            </p>
            {profile && (
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.min(100, (profile.completedThisWeek / Math.max(profile.weeklyGoal, 1)) * 100)}%`,
                  }}
                />
              </div>
            )}
            <Link
              href={profile ? "/gallery" : "/studio/new"}
              className={styles.textButton}
            >
              {profile ? "See your progress" : "Make your first mark"}
              <span aria-hidden>↗</span>
            </Link>
          </div>
          <div className={styles.sidebarFooter}>
            <Link
              href="/help"
              style={{
                textDecoration: "underline",
                display: "block",
                marginBottom: 7,
              }}
            >
              Help & community guidelines
            </Link>
            Made for the joy of making.
          </div>
        </aside>
        <div className={styles.main}>
          <header className={styles.topbar}>
            <Link className={`${styles.brand} ${styles.mobileBrand}`} href="/">
              <span className={styles.brandmark}>
                <Flower2 size={22} />
              </span>
              Canvas Club
            </Link>
            <div className={styles.topbarIntro}>
              <strong>Your next good idea</strong> starts with a little play.
            </div>
            <form className={styles.search} action="/explore">
              <Search size={16} />
              <input
                name="q"
                placeholder="Find a little inspiration…"
                aria-label="Search community artwork"
              />
            </form>
            <div className={styles.topActions}>
              <Link href="/studio/new" className={styles.button}>
                <Plus size={16} />
                New canvas
              </Link>
              {isAuthenticated ? (
                <AccountMenu profile={profile} />
              ) : (
                <button
                  className={`${styles.button} ${styles.secondary}`}
                  onClick={() => askAuth()}
                  disabled={isLoading}
                >
                  Join the club
                </button>
              )}
            </div>
          </header>
          <main className={styles.content}>
            {profileError && (
              <p role="alert" className={styles.error}>
                {profileError}{" "}
                <button
                  className={styles.textButton}
                  onClick={() => {
                    setProfileError("");
                    void ensure({}).catch((cause) =>
                      setProfileError(errorMessage(cause)),
                    );
                  }}
                >
                  Try again
                </button>
              </p>
            )}
            {children}
          </main>
        </div>
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          {nav.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className={path === item.href ? styles.mobileActive : ""}
            >
              <item.icon size={20} strokeWidth={1.7} />
              {item.mobile}
            </Link>
          ))}
          <Link
            href="/studio/new"
            className={path.startsWith("/studio") ? styles.mobileActive : ""}
          >
            <Palette size={20} />
            Create
          </Link>
        </nav>
      </div>
      <AuthDialog open={authOpen} onClose={close} reason={reason} />
    </Context.Provider>
  );
}

export function GuestInvitation({
  title = "Your creative space is waiting.",
  message = "Join to save a collection, keep your progress, and share when you're ready.",
}: {
  title?: string;
  message?: string;
}) {
  const { askAuth } = useClub();
  return (
    <div className={styles.guestBanner}>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      <button className={styles.button} onClick={() => askAuth(message)}>
        <Sparkles size={15} />
        Join the club
      </button>
    </div>
  );
}
