import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthClientSlot from './AuthClientSlot';
import NavButton from '../components/NavButton';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Opto Prospect",
  description: "Discover and connect with optometrists and eye care centers in your area. Save your prospects and track your visits efficiently.",
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
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-white/90 p-3 rounded-2xl shadow">
            <NavButton />
            <AuthClientSlot />
          </div>
          {children}
          <footer className="fixed bottom-2 left-2 bg-gray-800/80 backdrop-blur-sm text-white py-2 px-3 text-xs z-30 rounded-lg">
            <p>© {new Date().getFullYear()} Joaquin De Rojas Consulting LLC</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
