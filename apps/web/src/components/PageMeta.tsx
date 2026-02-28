import React from 'react';
import { useLocation } from 'react-router-dom';

interface PageMetaProps {
  /** Page-specific title. " | Legacy Sports" is appended automatically. */
  title: string;
  /** Short plain-text summary used in meta description, og:description, and Twitter card. */
  description: string;
  /**
   * Absolute URL to a preview image (1200×630 recommended).
   * Defaults to the site logo at /logo-512.png.
   */
  imageUrl?: string;
  /**
   * Explicit canonical URL.  Defaults to the current page's full URL.
   */
  canonicalUrl?: string;
  /**
   * Open-Graph content type.  Defaults to "website".
   */
  ogType?: string;
}

const SITE_NAME = 'Legacy Sports';
const DEFAULT_IMAGE_PATH = '/logo-512.png';

/**
 * PageMeta — sets document metadata for every page.
 *
 * React 19 hoists <title> and <meta> elements rendered inside any component
 * up to <head> automatically, so this component works with no extra library.
 *
 * Usage:
 *   <PageMeta
 *     title="About"
 *     description="Learn about Legacy Sports fantasy baseball."
 *   />
 */
export function PageMeta({
  title,
  description,
  imageUrl,
  canonicalUrl,
  ogType = 'website',
}: PageMetaProps) {
  const location = useLocation();
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://legacy.sports';
  const pageUrl = canonicalUrl ?? `${origin}${location.pathname}`;
  const image = imageUrl ?? `${origin}${DEFAULT_IMAGE_PATH}`;
  const fullTitle = `${title} | ${SITE_NAME}`;

  return (
    <>
      {/* Standard */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {/* Open Graph (Facebook, LinkedIn, Discord, Slack, iMessage…) */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={pageUrl} />

      {/* Twitter / X Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </>
  );
}
