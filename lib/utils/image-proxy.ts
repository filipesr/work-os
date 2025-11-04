/**
 * Returns a proxied image URL to avoid CORS and rate limit issues with external image sources
 * @param imageUrl - The original image URL (e.g., Google profile image)
 * @returns The proxied URL or null if no image URL provided
 */
export function getProxiedImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  // If it's already a relative/local URL, return as-is
  if (imageUrl.startsWith('/') || imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  // Proxy external URLs through our API route
  return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
}
