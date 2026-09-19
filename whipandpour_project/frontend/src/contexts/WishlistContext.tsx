import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Wishlist.
 *
 * Stored in localStorage, deliberately mirroring CartContext.
 *
 * The backend has a working `wishlists` table and `wishlist.list/add/remove`
 * procedures, but they all require an authenticated session and this store has
 * no customer login — only guest checkout. A server-backed wishlist would
 * therefore be unreachable for every real shopper. Once customer accounts
 * exist, migrate this to those procedures and sync on sign-in.
 *
 * Only product ids are persisted; the product itself is re-fetched from the API
 * so prices, stock and images are never stale.
 */

const STORAGE_KEY = 'whipandpour_wishlist';

interface WishlistContextType {
  /** Product ids, most recently added first. */
  ids: number[];
  has: (productId: number) => boolean;
  add: (productId: number) => void;
  remove: (productId: number) => void;
  /** Returns true if the product ended up in the wishlist. */
  toggle: (productId: number) => boolean;
  clear: () => void;
  count: number;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setIds(parsed.filter((id) => Number.isInteger(id)));
      }
    } catch (error) {
      console.error('Failed to load wishlist from localStorage:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids]);

  const has = useCallback((productId: number) => ids.includes(productId), [ids]);

  const add = useCallback((productId: number) => {
    setIds((prev) => (prev.includes(productId) ? prev : [productId, ...prev]));
  }, []);

  const remove = useCallback((productId: number) => {
    setIds((prev) => prev.filter((id) => id !== productId));
  }, []);

  const toggle = useCallback(
    (productId: number) => {
      let added = false;
      setIds((prev) => {
        added = !prev.includes(productId);
        return added ? [productId, ...prev] : prev.filter((id) => id !== productId);
      });
      return added;
    },
    []
  );

  const clear = useCallback(() => setIds([]), []);

  return (
    <WishlistContext.Provider
      value={{ ids, has, add, remove, toggle, clear, count: ids.length }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
}
