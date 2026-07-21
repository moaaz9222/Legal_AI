import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "قانون العقوبات — المساعد القانوني الذكي | Legal AI Assistant",
  description:
    "مساعد قانوني ذكي مبني على الذكاء الاصطناعي لتحليل قانون العقوبات المصري. Ask questions about the Egyptian Penal Code in Arabic or English.",
  keywords: ["قانون العقوبات", "legal AI", "RAG", "Arabic legal assistant"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
