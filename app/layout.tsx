import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Village e-Meeting",
  description: "Online village meeting system with Google Meet, Google Drive, and Supabase.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
