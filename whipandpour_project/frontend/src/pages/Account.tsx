import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Package, Heart, ShoppingBag, ChevronRight, Search, AlertCircle,
  Loader2, Gift, Clock, Truck, CheckCircle2, XCircle, LogOut,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useWishlist } from '@/contexts/WishlistContext';
import { formatPrice, categoryLabel } from '@/const';

/**
 * My Account — order tracking.
 *
 * This store has guest checkout and no customer accounts, so `orders.list`
 * (which needs a session) is unreachable for real shoppers. Orders are looked
 * up instead with the order number + the email they were placed with, the same
 * pair printed on the confirmation screen.
 *
 * The previous version hardcoded `isLoggedIn = false`, making its entire
 * "logged in" branch dead code, and its sign-in form popped an alert telling
 * customers to use the admin panel instead. Checkout's "View my orders" button
 * pointed here and hit that wall.
 *
 * The last order placed in this browser is remembered so the lookup prefills.
 */

const LAST_ORDER_KEY = 'whipandpour_last_order';

const STATUS_STEPS = ['pending', 'processing', 'shipped', 'delivered'] as const;

const STATUS_STYLES: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600', icon: Clock },
  processing: { label: 'Processing', className: 'bg-yellow-100 text-yellow-700', icon: Package },
  shipped: { label: 'Shipped', className: 'bg-blue-100 text-blue-700', icon: Truck },
  delivered: { label: 'Delivered', className: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-600', icon: XCircle },
};

const PAYMENT_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
  refunded: 'bg-purple-100 text-purple-700',
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function Account() {
  const [, navigate] = useLocation();
  const { count: wishlistCount } = useWishlist();

  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState<{ orderNumber: string; email: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Prefill from the last order placed in this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_ORDER_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed?.orderNumber && parsed?.email) {
        setOrderNumber(parsed.orderNumber);
        setEmail(parsed.email);
        setQuery({ orderNumber: parsed.orderNumber, email: parsed.email });
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const { data, isFetching, error } = trpc.orders.lookup.useQuery(query!, {
    enabled: !!query,
    retry: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!orderNumber.trim()) return setFormError('Enter the order number from your confirmation.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setFormError('Enter the email address used on the order.');
    setQuery({ orderNumber: orderNumber.trim(), email: email.trim() });
  };

  const signOut = () => {
    localStorage.removeItem(LAST_ORDER_KEY);
    setQuery(null);
    setOrderNumber('');
    setEmail('');
    setFormError(null);
  };

  const orders = data?.orders ?? [];

  return (
    <div className="min-h-screen bg-[#FAF7F2] py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold text-[#2C2C2C] mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            My Orders
          </h1>
          <p className="text-[#7A7066]">
            Track an order with the order number from your confirmation.
          </p>
        </div>

        {/* Lookup */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-[#E8DDD0] p-6 shadow-sm mb-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 md:items-end">
            <div>
              <label htmlFor="lookup-order" className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                Order number
              </label>
              <input
                id="lookup-order"
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="WP-2608-123456"
                className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white font-mono text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              />
            </div>
            <div>
              <label htmlFor="lookup-email" className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                Email on the order
              </label>
              <input
                id="lookup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              />
            </div>
            <button
              type="submit"
              disabled={isFetching}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors disabled:opacity-60"
            >
              {isFetching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Find
            </button>
          </div>

          {(formError || error) && (
            <div role="alert" className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{formError ?? (error as any)?.message}</p>
            </div>
          )}
        </form>

        {/* Orders */}
        {isFetching && (
          <div className="flex items-center justify-center py-12 text-[#7A7066]">
            <Loader2 className="animate-spin mr-2" size={18} /> Looking up your order…
          </div>
        )}

        {!isFetching && data && orders.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-sm text-[#7A7066]">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'} for{' '}
                <span className="font-semibold text-[#2C2C2C]">{data.email}</span>
              </p>
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#7A7066] hover:text-[#2C2C2C] transition-colors"
              >
                <LogOut size={14} /> Forget me on this device
              </button>
            </div>

            <div className="space-y-5">
              {orders.map((order: any) => {
                const status = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
                const StatusIcon = status.icon;
                const stepIndex = STATUS_STEPS.indexOf(order.status);

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-[#E8DDD0] shadow-sm overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-[#E8DDD0] bg-[#FAF7F2]">
                      <div>
                        <p className="font-mono text-sm font-bold text-[#2C2C2C]">
                          {order.orderNumber}
                        </p>
                        <p className="text-xs text-[#7A7066] mt-0.5">
                          Placed {formatDate(order.createdAt)} · {order.itemCount}{' '}
                          {order.itemCount === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${status.className}`}>
                          <StatusIcon size={12} /> {status.label}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${PAYMENT_STYLES[order.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                          Payment {order.paymentStatus}
                        </span>
                      </div>
                    </div>

                    {/* Progress */}
                    {order.status !== 'cancelled' && (
                      <div className="px-5 pt-5">
                        <div className="flex items-center">
                          {STATUS_STEPS.map((step, i) => {
                            const done = stepIndex >= i;
                            return (
                              <div key={step} className="flex items-center flex-1 last:flex-none">
                                <div className="flex flex-col items-center">
                                  <div
                                    className={`w-3 h-3 rounded-full ${done ? 'bg-[#C9A84C]' : 'bg-[#E8DDD0]'}`}
                                  />
                                  <span
                                    className={`text-[10px] mt-1 capitalize ${done ? 'text-[#2C2C2C] font-semibold' : 'text-[#7A7066]'}`}
                                  >
                                    {step}
                                  </span>
                                </div>
                                {i < STATUS_STEPS.length - 1 && (
                                  <div
                                    className={`h-0.5 flex-1 mx-1 mb-4 ${stepIndex > i ? 'bg-[#C9A84C]' : 'bg-[#E8DDD0]'}`}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Items */}
                    <div className="p-5 space-y-3">
                      {order.items.map((item: any) => (
                        <div key={item.id} className="flex gap-3 items-center">
                          <div className="w-14 h-14 rounded-lg bg-[#FAF7F2] border border-[#E8DDD0] overflow-hidden shrink-0">
                            {item.image && (
                              <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {item.productSlug ? (
                              <button
                                onClick={() => navigate(`/product/${item.productSlug}`)}
                                className="text-sm font-semibold text-[#2C2C2C] hover:text-[#C9A84C] transition-colors text-left truncate block"
                              >
                                {item.productName}
                              </button>
                            ) : (
                              <p className="text-sm font-semibold text-[#7A7066] truncate">{item.productName}</p>
                            )}
                            <p className="text-xs text-[#7A7066]">
                              {item.size} · Qty {item.quantity} · {formatPrice(item.unitPrice)} each
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-[#2C2C2C] whitespace-nowrap">
                            {formatPrice(item.lineTotal)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Gifting */}
                    {order.giftPackaging && (
                      <div className="mx-5 mb-5 bg-[#FAF7F2] border border-[#C9A84C]/40 rounded-xl p-4">
                        <p className="text-xs font-bold text-[#C9A84C] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Gift size={12} /> Gift packaging included
                        </p>
                        {order.giftCardMessage && (
                          <p className="text-sm text-[#2C2C2C] italic">“{order.giftCardMessage}”</p>
                        )}
                        {(order.giftRecipientName || order.giftSenderName) && (
                          <p className="text-xs text-[#7A7066] mt-1">
                            {order.giftRecipientName && <>For {order.giftRecipientName}</>}
                            {order.giftRecipientName && order.giftSenderName && ' · '}
                            {order.giftSenderName && <>From {order.giftSenderName}</>}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Totals + delivery */}
                    <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <p className="text-xs text-[#7A7066] uppercase tracking-wider font-semibold mb-2">
                          Delivering to
                        </p>
                        <p className="text-sm text-[#2C2C2C]">
                          {order.shippingAddress}, {order.shippingCity} {order.shippingZipCode}
                          <br />
                          {order.shippingCountry}
                        </p>
                        {order.trackingNumber && (
                          <p className="text-sm text-[#2C2C2C] mt-2">
                            <span className="text-[#7A7066]">Tracking: </span>
                            <span className="font-mono">{order.trackingNumber}</span>
                          </p>
                        )}
                      </div>
                      <div className="text-sm space-y-1 md:text-right">
                        <p className="text-[#7A7066]">
                          Subtotal <span className="text-[#2C2C2C]">{formatPrice(order.subtotal)}</span>
                        </p>
                        <p className="text-[#7A7066]">
                          Shipping{' '}
                          <span className="text-[#2C2C2C]">
                            {Number(order.shippingCost) === 0 ? 'Free' : formatPrice(order.shippingCost)}
                          </span>
                        </p>
                        {Number(order.giftPackagingFee) > 0 && (
                          <p className="text-[#7A7066]">
                            Gift packaging{' '}
                            <span className="text-[#2C2C2C]">{formatPrice(order.giftPackagingFee)}</span>
                          </p>
                        )}
                        {Number(order.discountAmount) > 0 && (
                          <p className="text-[#D4A5A5]">
                            Discount {order.promoCode && `(${order.promoCode})`}{' '}
                            −{formatPrice(order.discountAmount)}
                          </p>
                        )}
                        <p className="pt-2 border-t border-[#E8DDD0] font-bold text-[#2C2C2C]">
                          Total <span className="text-[#C9A84C] text-lg">{formatPrice(order.total)}</span>
                        </p>
                      </div>
                    </div>

                    {order.paymentStatus === 'pending' && (
                      <p className="px-5 pb-5 text-xs text-amber-800 bg-amber-50 border-t border-amber-200 pt-3">
                        {order.paymentMethod === 'cod'
                          ? `Payment is due on delivery — please have ${formatPrice(order.total)} ready for the courier.`
                          : 'We have not received payment for this order yet. Our team will be in touch with instructions.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Nothing looked up yet */}
        {!isFetching && !data && (
          <div className="bg-white rounded-2xl border border-[#E8DDD0] p-8">
            <div className="text-center mb-8">
              <Package size={40} className="mx-auto text-[#E8DDD0] mb-3" />
              <p className="text-[#7A7066]">
                Your order number is shown on the confirmation screen after checkout, and in
                your confirmation email if email is configured for this store.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-6 border-t border-[#E8DDD0]">
              <button
                onClick={() => navigate('/shop')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#FAF7F2] text-[#2C2C2C] hover:bg-[#E8DDD0] transition-colors text-sm font-medium"
              >
                <ShoppingBag size={14} /> Shop
              </button>
              <button
                onClick={() => navigate('/wishlist')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#FAF7F2] text-[#2C2C2C] hover:bg-[#E8DDD0] transition-colors text-sm font-medium"
              >
                <Heart size={14} /> Wishlist{wishlistCount > 0 && ` (${wishlistCount})`}
              </button>
              <button
                onClick={() => navigate('/cart')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#FAF7F2] text-[#2C2C2C] hover:bg-[#E8DDD0] transition-colors text-sm font-medium"
              >
                <Package size={14} /> My Cart
              </button>
              <button
                onClick={() => navigate('/contact')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#FAF7F2] text-[#2C2C2C] hover:bg-[#E8DDD0] transition-colors text-sm font-medium"
              >
                <ChevronRight size={14} /> Contact
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
