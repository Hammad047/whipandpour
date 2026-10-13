import { useState } from 'react';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import { trpc } from '@/lib/trpc';
import { formatPrice, toNumber } from '@/const';

export function promoDiscount(promo: any, subtotal: number): number {
  if (!promo || promo.isActive === false) return 0;
  if (subtotal < toNumber(promo.minOrderAmount)) return 0;
  const value = toNumber(promo.value);
  return promo.discountType === 'percent'
    ? Math.min(subtotal * (value / 100), subtotal)
    : Math.min(value, subtotal);
}

/**
 * Apply/remove for the cart page and the cart drawer. The applied code lives in
 * CartContext and its discount is derived from the server's validate response,
 * so every surface shows the same amount. Checkout re-checks it on submit.
 */
export function usePromoCode(subtotal: number) {
  const { promoCode, applyPromoCode, clearPromoCode } = useCart();
  const [input, setInput] = useState('');
  const utils = trpc.useUtils();

  const { data: appliedPromo } = trpc.promos.validate.useQuery(
    { code: promoCode ?? '' },
    { enabled: !!promoCode, retry: false }
  );
  const discount = promoDiscount(appliedPromo, subtotal);

  const apply = async () => {
    const code = input.trim().toUpperCase();
    if (!code) return;

    try {
      const promo: any = await utils.promos.validate.fetch({ code });

      if (!promo || promo.isActive === false) {
        clearPromoCode();
        toast.error('That promo code is not valid');
        return;
      }

      const minOrder = toNumber(promo.minOrderAmount);
      if (subtotal < minOrder) {
        clearPromoCode();
        toast.error(`This code needs a minimum order of ${formatPrice(minOrder)}`);
        return;
      }

      applyPromoCode(code);
      setInput('');
      toast.success(`${code} applied — ${formatPrice(promoDiscount(promo, subtotal))} off, confirmed at checkout`);
    } catch (error: any) {
      clearPromoCode();
      toast.error(error?.message ?? 'That promo code is not valid');
    }
  };

  const remove = () => {
    setInput('');
    clearPromoCode();
  };

  return { input, setInput, appliedCode: promoCode, discount, apply, remove };
}
