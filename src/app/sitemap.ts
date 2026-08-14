import type { MetadataRoute } from "next";

const siteUrl = "https://bagiyuk.vivoy51577.workers.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/bantuan`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/privasi`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/diagnostik`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
