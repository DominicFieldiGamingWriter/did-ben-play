import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Did Ben Brereton Díaz Play?",
  description:
    "Did Ben Brereton Díaz play in his last match for club or country? Find out whether Big Ben started, was on the bench, scored or assisted in his latest game."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}

        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-4EQ1G5Z9Y7"
          strategy="afterInteractive"
        />

        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-4EQ1G5Z9Y7');
          `}
        </Script>
      </body>
    </html>
  );
}
