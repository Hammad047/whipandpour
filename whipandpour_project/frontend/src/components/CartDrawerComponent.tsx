import { X, Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { formatPrice } from '@/const';
import { useLocation } from 'wouter';

export default function CartDrawerComponent() {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, getTotal } = useCart();
  const [, navigate] = useLocation();

  const handleCheckout = () => {
    setIsOpen(false);
    navigate('/checkout');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-lg z-50 flex flex-col animate-slideIn">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#E8DDD0]">
          <h2 className="text-2xl font-bold text-[#2C2C2C]">Shopping Cart</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-[#E8DDD0] rounded-lg transition-colors"
            aria-label="Close cart"
          >
            <X size={24} className="text-[#2C2C2C]" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-6xl mb-4">🛒</div>
              <p className="text-[#7A7066] text-lg">Your cart is empty</p>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/shop');
                }}
                className="mt-4 px-6 py-2 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-medium hover:bg-[#D4A5A5] transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex gap-4 pb-4 border-b border-[#E8DDD0]">
                {/* Image */}
                <div className="w-20 h-20 bg-[#FAF7F2] rounded-lg overflow-hidden flex-shrink-0">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.productName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/images/products/dessert-jar-1.svg';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🕯️</div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1">
                  <h3 className="font-semibold text-[#2C2C2C] text-sm">{item.productName}</h3>
                  <p className="text-xs text-[#7A7066] mb-2">{item.size}</p>
                  <p className="font-bold text-[#C9A84C] text-sm">{formatPrice(item.price * item.quantity)}</p>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="p-1 hover:bg-[#E8DDD0] rounded transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} className="text-[#2C2C2C]" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="p-1 hover:bg-[#E8DDD0] rounded transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} className="text-[#2C2C2C]" />
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="ml-auto p-1 hover:bg-[#E8DDD0] rounded transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 size={14} className="text-[#D4A5A5]" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-[#E8DDD0] p-6 space-y-4">
            {/* Promo Code */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Promo code"
                className="flex-1 px-3 py-2 border border-[#E8DDD0] rounded-lg text-sm focus:outline-none focus:border-[#C9A84C]"
              />
              <button className="px-4 py-2 bg-[#E8DDD0] text-[#2C2C2C] rounded-lg font-medium hover:bg-[#D4A5A5] transition-colors text-sm">
                Apply
              </button>
            </div>

            {/* Totals */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[#7A7066]">
                <span>Subtotal</span>
                <span>{formatPrice(getTotal())}</span>
              </div>
              <div className="flex justify-between text-[#7A7066]">
                <span>Shipping</span>
                <span>Free</span>
              </div>
              <div className="flex justify-between font-bold text-[#2C2C2C] text-lg pt-2 border-t border-[#E8DDD0]">
                <span>Total</span>
                <span className="text-[#C9A84C]">{formatPrice(getTotal())}</span>
              </div>
            </div>

            {/* Checkout Button */}
            <button
              onClick={handleCheckout}
              className="w-full py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-bold hover:bg-[#D4A5A5] transition-colors"
            >
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
