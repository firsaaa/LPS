import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LPS EDMS – Sistem Manajemen Dokumen Proyek Proteksi Petir",
  description: "Electronic Document Management System untuk proyek Lightning Protection System (LPS)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50 antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
