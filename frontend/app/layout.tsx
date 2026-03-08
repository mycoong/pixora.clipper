import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PIXORA Clipper Web",
  description: "Vercel-ready frontend shell for PIXORA Clipper."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
