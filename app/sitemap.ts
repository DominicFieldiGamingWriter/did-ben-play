import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://did-ben-play.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL
    }
  ];
}
