import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NavigationWrapper from '../components/NavigationWrapper';
import OrientationPrompt from '../components/OrientationPrompt';
import "./globals.css";

// Force dynamic rendering for the entire app due to Firebase/Maps dependencies
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Opto Prospect - Find and Track Optometrists",
  description: "Discover optometrists in your area and track your prospects with our comprehensive mapping and CRM solution.",
  manifest: "/manifest.json",
  other: {
    "screen-orientation": "landscape",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="relative min-h-screen">
          <OrientationPrompt />
          <NavigationWrapper />
          {children}
          <footer className="fixed bottom-2 left-2 bg-gradient-to-r from-blue-50/80 to-purple-50/80 backdrop-blur-sm text-gray-800 py-2 px-3 text-xs z-30 rounded-lg border border-blue-100/60 shadow-sm">
            <p>© {new Date().getFullYear()} Joaquin De Rojas Consulting LLC</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
