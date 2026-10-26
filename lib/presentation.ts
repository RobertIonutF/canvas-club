import type { Id } from "@/convex/_generated/dataModel";
import { ConvexError } from "convex/values";

export type ArtistPresentation = {
  userId?: Id<"users">;
  displayName: string;
  handle: string;
  xp?: number;
  bio?: string;
};

export type ArtworkPresentation = {
  _id: Id<"artworks">;
  title: string;
  description?: string;
  imageUrl: string | null;
  medium: "manual" | "assisted" | "generated";
  likesCount: number;
  likedByMe: boolean;
  artist: ArtistPresentation;
  createdAt?: number;
};

export type ClubProfile = {
  userId: Id<"users">;
  displayName: string;
  handle: string;
  bio: string;
  xp: number;
  level: number;
  weeklyGoal: number;
  completedThisWeek: number;
};

export const starters = [
  {
    slug: "moon-garden",
    title: "A moonlit garden",
    detail: "Make room for a little magic",
    image: "/art/moon-garden.svg",
    color: "#dce4f0",
  },
  {
    slug: "friendly-monster",
    title: "A friendly little monster",
    detail: "No perfect lines needed",
    image: "/art/friendly-monster.svg",
    color: "#eddbe7",
  },
  {
    slug: "little-cabin",
    title: "Somewhere to slow down",
    detail: "Build your own cozy corner",
    image: "/art/little-cabin.svg",
    color: "#e7e5d1",
  },
  {
    slug: "wildflowers",
    title: "Flowers, your way",
    detail: "A small study in color",
    image: "/art/wildflowers.svg",
    color: "#e4e7d5",
  },
];

export function initials(name?: string) {
  return (name || "You")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function levelFromXp(xp = 0) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function friendlyDate(value?: number) {
  return value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
        new Date(value),
      )
    : "";
}

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  if (error instanceof ConvexError && typeof error.data === "string")
    return error.data;
  if (!(error instanceof Error)) return fallback;
  const clean = error.message
    .replace(/^\[CONVEX[^\]]*\]\s*/, "")
    .replace(/\s+Called by client[\s\S]*$/, "");
  if (
    /InvalidAccountId|InvalidSecret|Invalid password|Invalid login/i.test(clean)
  )
    return "That email and password do not match. Please try again.";
  if (/Account already exists/i.test(clean))
    return "An account with that email already exists. Try signing in.";
  if (/password.*8|too short/i.test(clean))
    return "Choose a password with at least 8 characters.";
  return clean.length < 230 ? clean : fallback;
}
