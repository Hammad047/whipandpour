import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

/**
 * Reports one page view per route change to `analytics.track`, feeding the
 * admin panel's Visitors page.
 *
 * Fire-and-forget by design: errors are swallowed, because a shopper browsing
 * the store must never see a failure caused by counting them. Nothing here
 * blocks or delays a render.
 *
 * Admin routes are skipped so the shop owner's own clicking around does not
 * show up as store traffic. The backend enforces the same rule — this only
 * saves the pointless request.
 *
 * What reaches the server is the path, and the referrer on the first view of
 * the session. Everything else the report shows (country, device, browser) is
 * derived server-side from request headers, so no fingerprinting runs here.
 */
export function usePageTracking() {
  const [location] = useLocation();
  const track = trpc.analytics.track.useMutation({
    // Swallowed deliberately — see above.
    onError: () => {},
  });

  // The mutation object is a new identity on every render, so holding it in a
  // ref keeps it out of the effect's dependencies. Listing it there instead
  // would re-run the effect on each render and count one visit many times.
  const trackRef = useRef(track);
  trackRef.current = track;

  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (location.startsWith('/admin')) return;
    // React may re-render on the same route; only a real change is a view.
    if (lastPath.current === location) return;

    const isFirstViewOfSession = lastPath.current === null;
    lastPath.current = location;

    trackRef.current.mutate({
      path: location,
      // Only the entry point has a meaningful referrer. On later navigations
      // document.referrer is the store itself, which the backend discards.
      referrer: isFirstViewOfSession ? document.referrer || '' : '',
    });
  }, [location]);
}
