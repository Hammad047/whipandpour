import { useState } from 'react';
import { useLocation } from 'wouter';
import { Trash2, Plus, Minus, ArrowRight } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { trpc } from '@/lib/trpc';
import { formatPrice, toNumber } from '@/const';
import { toast } from 'sonner';

// Must match FREE_SHIPPING_THRESHOLD / SHIPPING_FLAT_RATE in backend/routers/orders.py.
const FREE_SHIPPING_THRESHOLD = 4000;
const SHIPPING_FLAT_RATE = 200;

export default function Cart() {
  const [, navigate] = useLocation();
  // This page used to keep its own `useState<CartItem[]>([])`, so it was never
  // connected to the cart and always rendered the empty state no matter what
  // the shopper had added.
  const { items, updateQuantity, removeItem, promoCode: appliedCode, applyPromoCode, clearPromoCode } = useCart();
  const [promoCode, setPromoCode] = useState(appliedCode ?? '');
  const [discount, setDiscount] = useState(0);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT_RATE;
  const total = Math.max(0, subtotal - discount) + shipping;

  const utils = trpc.useUtils();

  const handleUpdateQuantity = (id: string, quantity: number) => {
    updateQuantity(id, quantity);
  };

  const handleRemoveItem = (id: string) => {
    removeItem(id);
  };

  /**
   * Promo codes are validated against the database rather than compared to a
   * literal in the browser. The discount shown here is indicative — checkout
   * recalculates it server-side before the order is written.
   */
  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    try {
      const promo: any = await utils.promos.validate.fetch({ code });
      if (!promo || promo.isActive === false) {
        setDiscount(0);
        clearPromoCode();
        toast.error('That promo code is not valid');
        return;
      }
      const minOrder = toNumber(promo.minOrderAmount);
      if (subtotal < minOrder) {
        setDiscount(0);
        clearPromoCode();
        toast.error(`This code needs a minimum order of ${formatPrice(minOrder)}`);
        return;
      }
      const value = toNumber(promo.value);
      const amount =
        promo.discountType === 'percent'
          ? Math.min(subtotal * (value / 100), subtotal)
          : Math.min(value, subtotal);
      setDiscount(amount);
      applyPromoCode(code);
      // The final word on eligibility (e.g. first-order-only codes) is the
      // server, at checkout — this is a preview.
      toast.success(`${code} applied — ${formatPrice(amount)} off, confirmed at checkout`);
    } catch (error: any) {
      setDiscount(0);
      clearPromoCode();
      toast.error(error?.message ?? 'That promo code is not valid');
    }
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setDiscount(0);
    clearPromoCode();
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] py-20">
        <div className="container text-center">
          <h1 className="text-4xl font-bold text-[#2C2C2C] mb-4">Shopping Cart</h1>
          <p className="text-xl text-[#7A7066] mb-8">Your cart is empty</p>
          <button
            onClick={() => navigate('/shop')}
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors"
          >
            Continue Shopping
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] py-12">
      <div className="container">
        <h1 className="text-4xl font-bold text-[#2C2C2C] mb-12">Shopping Cart</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-[#E8DDD0] overflow-hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-6 border-b border-[#E8DDD0] last:border-b-0"
                >
                  {/* Product Image */}
                  <div className="w-24 h-24 bg-gradient-to-br from-[#FAF7F2] to-[#E8DDD0] rounded-lg flex-shrink-0 flex items-center justify-center">
                    {item.image ? (
                      <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">🕯️</span>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-[#2C2C2C] mb-1">
                      {item.productName}
                    </h3>
                    <p className="text-sm text-[#7A7066] mb-2">Size: {item.size}</p>
                    <p className="text-lg font-bold text-[#C9A84C]">
                      {formatPrice(item.price)}
                    </p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-2 text-[#D4A5A5] hover:bg-[#E8DDD0] rounded-lg transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 size={18} />
                    </button>

                    <div className="flex items-center gap-2 border border-[#E8DDD0] rounded-lg">
                      <button
                        onClick={() =>
                          handleUpdateQuantity(item.id, item.quantity - 1)
                        }
                        className="p-1 hover:bg-[#E8DDD0] transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} className="text-[#2C2C2C]" />
                      </button>
                      <span className="px-3 py-1 text-[#2C2C2C] font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          handleUpdateQuantity(item.id, item.quantity + 1)
                        }
                        className="p-1 hover:bg-[#E8DDD0] transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} className="text-[#2C2C2C]" />
                      </button>
                    </div>

                    <p className="text-lg font-bold text-[#2C2C2C]">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Continue Shopping */}
            <button
              onClick={() => navigate('/shop')}
              className="mt-6 text-[#C9A84C] hover:text-[#D4A5A5] font-medium transition-colors"
            >
              ← Continue Shopping
            </button>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-[#E8DDD0] p-6 sticky top-24">
              <h2 className="text-2xl font-bold text-[#2C2C2C] mb-6">Order Summary</h2>

              {/* Promo Code */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#2C2C2C] mb-2">
                  Promo Code
                </label>
                {appliedCode ? (
                  <div className="flex items-center justify-between px-3 py-2 bg-[#FAF7F2] border border-[#C9A84C] rounded-lg">
                    <span className="text-sm font-semibold text-[#2C2C2C] tracking-wide">{appliedCode} applied</span>
                    <button
                      onClick={handleRemovePromo}
                      className="text-xs font-semibold text-[#7A7066] hover:text-[#D4A5A5] transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      className="flex-1 px-3 py-2 border border-[#E8DDD0] rounded-lg text-[#2C2C2C] placeholder-[#7A7066] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                    />
                    <button
                      onClick={handleApplyPromo}
                      className="px-4 py-2 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-medium hover:bg-[#D4A5A5] transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>

              {/* Summary Lines */}
              <div className="space-y-3 mb-6 pb-6 border-b border-[#E8DDD0]">
                <div className="flex justify-between text-[#7A7066]">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[#D4A5A5]">
                    <span>Discount</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#7A7066]">
                  <span>Shipping</span>
                  <span>{shipping === 0 ? 'Free' : formatPrice(shipping)}</span>
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-semibold text-[#2C2C2C]">Total</span>
                <span className="text-3xl font-bold text-[#C9A84C]">
                  {formatPrice(total)}
                </span>
              </div>

              {/* Checkout Button */}
              <button
                onClick={() => navigate('/checkout')}
                className="w-full px-6 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors flex items-center justify-center gap-2"
              >
                Proceed to Checkout
                <ArrowRight size={18} />
              </button>

              {/* Free Shipping Info */}
              {shipping > 0 && (
                <p className="text-xs text-[#7A7066] text-center mt-4">
                  Free delivery on orders over PKR 4,000
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
