import type { MetadataRoute } from "next";

const siteUrl = "https://bagiyuk.vivoy51577.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/bantuan", "/privasi", "/diagnostik"], disallow: ["/api/", "/split/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
