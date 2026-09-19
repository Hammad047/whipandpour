import { useEffect } from 'react';

interface SEOOptions {
  title: string;
  description: string;
  /** Absolute URL of an image for social share previews. */
  image?: string;
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

/**
 * Sets the document title, meta description and Open Graph/Twitter tags for
 * the current page. This is a client-rendered SPA with no server-side
 * rendering, so this only helps crawlers that execute JavaScript (Google,
 * Bing) — it does not help static-fetch social link previews. The canonical
 * per-request source of truth for those is the static tags in index.html.
 */
export function useSEO({ title, description, image }: SEOOptions) {
  useEffect(() => {
    const fullTitle = `${title} | Whip&Pour`;
    document.title = fullTitle;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', window.location.href);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    if (image) {
      setMeta('property', 'og:image', image);
      setMeta('name', 'twitter:image', image);
    }
  }, [title, description, image]);
}

/** Injects (or replaces) a JSON-LD <script> block for structured data. */
export function useJsonLd(id: string, data: object | null) {
  useEffect(() => {
    const existing = document.getElementById(id);
    if (!data) {
      existing?.remove();
      return;
    }
    const script = existing instanceof HTMLScriptElement
      ? existing
      : document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    if (!existing) document.head.appendChild(script);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [id, data]);
}
