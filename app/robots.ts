import type { MetadataRoute } from 'next';

// Internal app behind a password gate — keep crawlers out unconditionally.
// If the deployment URL ever leaks, search engines won't index it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
