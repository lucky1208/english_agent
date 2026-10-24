import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Mate · AI English Coach",
  description: "Practice English naturally with a personal AI tutor.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}