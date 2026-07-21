import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Looms & Berries Tasks",
  description: "Internal task management for Looms & Berries",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
