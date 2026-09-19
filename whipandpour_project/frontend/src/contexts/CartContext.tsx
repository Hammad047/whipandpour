import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: string;
  productId: number;
  productName: string;
  productSlug: string;
  price: number;
  quantity: number;
  size: string;
  image: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  /** Promo code applied in the cart, carried into checkout. Server re-validates it. */
  promoCode: string | null;
  applyPromoCode: (code: string) => void;
  clearPromoCode: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('whipandpour_cart');
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (error) {
        console.error('Failed to load cart from localStorage:', error);
      }
    }
    const savedPromo = localStorage.getItem('whipandpour_promo');
    if (savedPromo) setPromoCode(savedPromo);
  }, []);

  // Save cart to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem('whipandpour_cart', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (promoCode) localStorage.setItem('whipandpour_promo', promoCode);
    else localStorage.removeItem('whipandpour_promo');
  }, [promoCode]);

  const addItem = (newItem: CartItem) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find(
        (item) => item.productId === newItem.productId && item.size === newItem.size
      );

      if (existingItem) {
        return prevItems.map((item) =>
          item.id === existingItem.id
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item
        );
      }

      return [...prevItems, newItem];
    });
    setIsOpen(true);
  };

  const removeItem = (id: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((prevItems) =>
      prevItems.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
    setPromoCode(null);
  };

  const applyPromoCode = (code: string) => setPromoCode(code);
  const clearPromoCode = () => setPromoCode(null);

  const getTotal = () => {
    return items.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const getItemCount = () => {
    return items.reduce((count, item) => count + item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getTotal,
        getItemCount,
        isOpen,
        setIsOpen,
        promoCode,
        applyPromoCode,
        clearPromoCode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
