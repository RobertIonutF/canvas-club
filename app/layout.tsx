import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Canvas Club — A little space to create",
    template: "%s · Canvas Club",
  },
  description:
    "Make something that feels yours. Paint, explore creative challenges, try optional AI assistance, and collect your favorite creations.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Canvas Club",
    description:
      "A little space to create. Draw, paint, and grow your creative world.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en">
        <body className={`${geistSans.variable} antialiased`}>
          <ConvexClientProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
