import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Lock, ArrowRight, ArrowLeft, CheckCircle2, Clock,
  ShoppingBag, AlertCircle, Loader2, Gift,
} from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { trpc } from '@/lib/trpc';
import { formatPrice, toNumber } from '@/const';

/**
 * Checkout
 * ────────
 * Three concerns are kept deliberately separate here, and must stay separate:
 *
 *   1. Payment METHOD SELECTION   — this page (writes `paymentMethod`)
 *   2. Payment PROCESSING         — a gateway adapter; only Stripe is wired
 *   3. ORDER CREATION             — `orders.create`, always `paymentStatus: pending`
 *   4. Payment STATUS             — advanced only by a verified gateway callback
 *
 * Nothing in this file marks an order as paid. The previous version ran a
 * two-second `setTimeout` and showed a success screen without creating an
 * order at all.
 */

type PaymentMethod = 'card' | 'easypaisa' | 'jazzcash' | 'cod';

interface PaymentOption {
  id: PaymentMethod;
  /** Value stored in the orders.paymentMethod column. */
  apiValue: 'stripe' | 'easypaisa' | 'jazzcash' | 'cod';
  label: string;
  description: string;
  icon: string;
  /** Whether a real gateway integration exists for this method today. */
  gateway: 'stripe' | 'none' | 'offline';
  bg: string;
  border: string;
}

/**
 * Manual wallet payment via QR code — not a gateway integration. There is no
 * JazzCash/Easypaisa merchant API wired up; the shopper scans the store's own
 * account QR and pays directly, and the order stays `pending` until staff
 * confirm the transfer against the wallet statement (see AdminPayments.tsx).
 */
const WALLET_QR: Record<'jazzcash' | 'easypaisa', { accountTitle: string; accountNumber: string; qrImage: string }> = {
  jazzcash: {
    accountTitle: 'WhipandPour',
    accountNumber: '03195769094',
    qrImage: '/images/jazzcash_qr_code.jpeg',
  },
  easypaisa: {
    accountTitle: 'WhipandPour',
    accountNumber: '03195769094',
    qrImage: '/images/easypaisa_qr_code.jpeg',
  },
};

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'cod',
    apiValue: 'cod',
    label: 'Cash on Delivery',
    description: 'Pay the courier when your order arrives',
    icon: '🚚',
    gateway: 'offline',
    bg: '#FAF5FF',
    border: '#C4B5FD',
  },
  {
    id: 'card',
    apiValue: 'stripe',
    label: 'Visa / Debit Card',
    description: 'Visa, Mastercard, UnionPay — processed by Stripe',
    icon: '💳',
    gateway: 'stripe',
    bg: '#EFF6FF',
    border: '#93C5FD',
  },
  {
    id: 'easypaisa',
    apiValue: 'easypaisa',
    label: 'Easypaisa',
    description: 'Pay from your Easypaisa mobile wallet',
    icon: '📱',
    gateway: 'none',
    bg: '#ECFDF5',
    border: '#6EE7B7',
  },
  {
    id: 'jazzcash',
    apiValue: 'jazzcash',
    label: 'JazzCash',
    description: 'Pay from your JazzCash mobile account',
    icon: '📲',
    gateway: 'none',
    bg: '#FFFBEB',
    border: '#FCD34D',
  },
];

const PAKISTAN_PROVINCES = [
  'Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan',
  'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Jammu & Kashmir',
];

// Must match FREE_SHIPPING_THRESHOLD in backend/routers/orders.py.
const FREE_SHIPPING_THRESHOLD = 4000;
const SHIPPING_FLAT_RATE = 200;

// Must match ADVANCE_ITEM_THRESHOLD / ADVANCE_PERCENT in backend/routers/orders.py.
// This is a preview only — the server always recomputes and is authoritative.
const ADVANCE_ITEM_THRESHOLD = 2500;
const ADVANCE_PERCENT = 0.3;

type FormFields = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

const EMPTY_FORM: FormFields = {
  fullName: '', email: '', phone: '', address: '',
  city: '', province: '', postalCode: '', notes: '',
};

/** Client-side validation. The backend re-validates everything independently. */
function validate(form: FormFields): Partial<Record<keyof FormFields, string>> {
  const errors: Partial<Record<keyof FormFields, string>> = {};

  if (!form.fullName.trim()) errors.fullName = 'Full name is required';
  else if (form.fullName.trim().length < 3) errors.fullName = 'Please enter your full name';

  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
    errors.email = 'Enter a valid email address';

  const digits = form.phone.replace(/\D/g, '');
  if (!form.phone.trim()) errors.phone = 'Phone number is required';
  else if (digits.length < 10 || digits.length > 13)
    errors.phone = 'Enter a valid phone number, e.g. 03001234567';

  if (!form.address.trim()) errors.address = 'Address is required';
  else if (form.address.trim().length < 8) errors.address = 'Please enter a complete address';

  if (!form.city.trim()) errors.city = 'City is required';
  if (!form.province.trim()) errors.province = 'Province is required';

  if (!form.postalCode.trim()) errors.postalCode = 'Postal code is required';
  else if (!/^\d{4,6}$/.test(form.postalCode.trim()))
    errors.postalCode = 'Postal code should be 4–6 digits';

  return errors;
}

export default function Checkout() {
  const [, navigate] = useLocation();
  const { items, getTotal, clearCart, promoCode, clearPromoCode } = useCart();

  const [step, setStep] = useState<'details' | 'payment' | 'confirmation'>('details');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<any>(null);

  // ── Gifting ──────────────────────────────────────────────────────────────
  // The fee and message limit come from the backend so the price shown here is
  // always the price actually charged.
  const [giftPackaging, setGiftPackaging] = useState(false);
  const [giftRecipientName, setGiftRecipientName] = useState('');
  const [giftSenderName, setGiftSenderName] = useState('');
  const [giftCardMessage, setGiftCardMessage] = useState('');
  const { data: gifting } = trpc.gifting.options.useQuery(undefined, { staleTime: 60_000 });
  const giftFee = giftPackaging ? toNumber(gifting?.packagingFee ?? 0) : 0;
  const giftMessageMax = gifting?.messageMaxLength ?? 400;

  // ── Promo code ───────────────────────────────────────────────────────────
  // Applied back in the cart; carried here for a preview only. The order
  // total actually charged is always recomputed server-side in orders.create,
  // including whether a first-order-only code is still eligible for this email.
  const { data: promo } = trpc.promos.validate.useQuery(
    { code: promoCode ?? '' },
    { enabled: !!promoCode, retry: false }
  );

  // Prefill from the signed-in account where we already know the details.
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  useEffect(() => {
    if (!me) return;
    setForm((prev) => ({
      ...prev,
      fullName: prev.fullName || me.name || '',
      email: prev.email || me.email || '',
      phone: prev.phone || me.phone || '',
      address: prev.address || me.address || '',
      city: prev.city || me.city || '',
      postalCode: prev.postalCode || me.zipCode || '',
    }));
  }, [me]);

  const subtotal = getTotal();
  const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FLAT_RATE;

  const discountAmount = useMemo(() => {
    if (!promo || promo.isActive === false) return 0;
    if (subtotal < toNumber(promo.minOrderAmount)) return 0;
    const value = toNumber(promo.value);
    return promo.discountType === 'percent'
      ? Math.min(subtotal * (value / 100), subtotal)
      : Math.min(value, subtotal);
  }, [promo, subtotal]);

  const total = subtotal + shippingCost + giftFee - discountAmount;

  // Preview only — the server decides this from the priced line items.
  const requiresAdvance = items.some((item) => item.price >= ADVANCE_ITEM_THRESHOLD);
  const advanceAmount = requiresAdvance ? Math.round(total * ADVANCE_PERCENT) : 0;
  const balanceDue = total - advanceAmount;

  const selectedOption = useMemo(
    () => PAYMENT_OPTIONS.find((p) => p.id === paymentMethod)!,
    [paymentMethod]
  );

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: (result: any) => {
      setPlacedOrder(result);
      // Remember the order so /account can prefill its lookup. Stored locally
      // rather than passed in the URL — an email address does not belong in a
      // query string.
      try {
        localStorage.setItem(
          'whipandpour_last_order',
          JSON.stringify({
            orderNumber: result.order.orderNumber,
            email: result.order.customerEmail,
          })
        );
      } catch {
        /* storage unavailable — the shopper can still look the order up manually */
      }
      // clearCart() also clears the applied promo code.
      clearCart();
      setStep('confirmation');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (error: any) => {
      setSubmitError(error?.message ?? 'We could not place your order. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  const setField = (field: keyof FormFields, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear the error as soon as the shopper starts correcting it.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = document.querySelector<HTMLElement>('[data-invalid="true"]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first?.focus();
      return;
    }
    setStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Re-validate: the shopper may have gone back and edited the form.
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStep('details');
      return;
    }
    if (items.length === 0) {
      setSubmitError('Your cart is empty.');
      return;
    }

    createOrder.mutate({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      province: form.province.trim(),
      postalCode: form.postalCode.trim(),
      notes: form.notes.trim(),
      paymentMethod: selectedOption.apiValue,
      promoCode: promoCode || undefined,
      giftPackaging,
      giftRecipientName: giftPackaging ? giftRecipientName.trim() : '',
      giftSenderName: giftPackaging ? giftSenderName.trim() : '',
      giftCardMessage: giftPackaging ? giftCardMessage.trim() : '',
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        size: item.size,
      })),
    });
  };

  // ── Empty cart ───────────────────────────────────────────────────────────
  if (items.length === 0 && step !== 'confirmation') {
    return (
      <div className="min-h-screen bg-[#FAF7F2] py-20">
        <div className="container max-w-lg mx-auto px-4 text-center">
          <ShoppingBag size={48} className="mx-auto text-[#C9A84C] mb-5" />
          <h1
            className="text-3xl font-bold text-[#2C2C2C] mb-3"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Your cart is empty
          </h1>
          <p className="text-[#7A7066] mb-8">
            Add a candle or two before heading to checkout.
          </p>
          <button
            onClick={() => navigate('/shop')}
            className="px-8 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors"
          >
            Browse the collection
          </button>
        </div>
      </div>
    );
  }

  // ── Confirmation ─────────────────────────────────────────────────────────
  if (step === 'confirmation' && placedOrder) {
    const order = placedOrder.order;
    const awaitingPayment = placedOrder.paymentRequired;

    return (
      <div className="min-h-screen bg-[#FAF7F2] py-12">
        <div className="container max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-2xl border border-[#E8DDD0] p-8 text-center shadow-sm">
            <CheckCircle2 size={56} className="mx-auto text-green-600 mb-4" />
            <h1
              className="text-3xl font-bold text-[#2C2C2C] mb-2"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Order received
            </h1>
            <p className="text-[#7A7066] mb-6">
              Thank you, {form.fullName.split(' ')[0]}. We’ve emailed a copy to {order.customerEmail}.
            </p>

            <div className="bg-[#FAF7F2] rounded-xl border border-[#E8DDD0] p-5 mb-6 text-left">
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-[#7A7066]">Order ID</span>
                <span className="font-bold text-[#2C2C2C]">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-[#7A7066]">Order status</span>
                <span className="font-semibold text-[#2C2C2C] capitalize">{order.status}</span>
              </div>
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-[#7A7066]">Payment method</span>
                <span className="font-semibold text-[#2C2C2C]">{selectedOption.label}</span>
              </div>
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-[#7A7066]">Payment status</span>
                <span className="font-semibold text-amber-700 capitalize">
                  {order.paymentStatus}
                </span>
              </div>
              {order.giftPackaging && (
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-[#7A7066]">Gift packaging</span>
                  <span className="font-semibold text-[#2C2C2C]">
                    Included · card will be handwritten
                  </span>
                </div>
              )}
              {toNumber(order.discountAmount) > 0 && (
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-[#7A7066]">Discount{order.promoCode ? ` (${order.promoCode})` : ''}</span>
                  <span className="font-semibold text-green-700">-{formatPrice(order.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-[#7A7066]">Free gift</span>
                <span className="font-semibold text-[#2C2C2C]">🎁 Included</span>
              </div>
              <div className="flex justify-between py-1.5 text-sm border-t border-[#E8DDD0] mt-2 pt-3">
                <span className="text-[#7A7066]">Total</span>
                <span className="font-bold text-[#C9A84C] text-lg">{formatPrice(order.total)}</span>
              </div>
            </div>

            {order.advanceRequired && (
              <div className="flex items-start gap-3 text-left bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <Clock size={18} className="text-amber-700 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  <strong>Advance payment required: {formatPrice(order.advanceAmount)}.</strong> Send this
                  amount via JazzCash or Easypaisa (QR shown at checkout) — our team confirms it manually.
                  The remaining <strong>{formatPrice(order.balanceDueAmount)}</strong> is due via your
                  selected payment method.
                </p>
              </div>
            )}

            {/* Never claim money has been taken. State plainly what happens next. */}
            <div className="flex items-start gap-3 text-left bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <Clock size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                {awaitingPayment ? (
                  <>
                    <strong>No payment has been taken yet.</strong> Your order is reserved and
                    marked <em>pending</em>. Our team will contact you at {form.phone} with payment
                    instructions for {selectedOption.label}.
                  </>
                ) : (
                  <>
                    <strong>Payment is due on delivery.</strong> Please have{' '}
                    {formatPrice(order.total)} ready for the courier. Your order stays{' '}
                    <em>pending</em> until it is delivered and paid.
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/shop')}
                className="flex-1 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors"
              >
                Continue shopping
              </button>
              <button
                onClick={() => navigate('/account')}
                className="flex-1 py-3 bg-white border border-[#E8DDD0] text-[#2C2C2C] rounded-xl font-semibold hover:border-[#C9A84C] transition-colors"
              >
                Track this order
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Shared field renderer ────────────────────────────────────────────────
  const field = (
    name: keyof FormFields,
    label: string,
    opts: { required?: boolean; type?: string; placeholder?: string; autoComplete?: string } = {}
  ) => {
    const { required = true, type = 'text', placeholder, autoComplete } = opts;
    const error = errors[name];
    return (
      <div>
        <label htmlFor={name} className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
          {label} {required && <span className="text-[#D4A5A5]">*</span>}
        </label>
        <input
          id={name}
          name={name}
          type={type}
          value={form[name]}
          onChange={(e) => setField(name, e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          data-invalid={error ? 'true' : 'false'}
          className={`w-full px-4 py-3 rounded-xl border bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 transition-colors ${
            error
              ? 'border-red-400 focus:ring-red-300'
              : 'border-[#E8DDD0] focus:ring-[#C9A84C]'
          }`}
        />
        {error && (
          <p id={`${name}-error`} role="alert" className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}
      </div>
    );
  };

  const orderSummary = (
    <div className="bg-white rounded-2xl border border-[#E8DDD0] p-5 shadow-sm lg:sticky lg:top-24">
      <h2 className="font-bold text-[#2C2C2C] mb-4">Order summary</h2>

      <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3">
            <div className="w-14 h-14 rounded-lg bg-[#FAF7F2] border border-[#E8DDD0] overflow-hidden shrink-0">
              {item.image && (
                <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#2C2C2C] truncate">{item.productName}</p>
              <p className="text-xs text-[#7A7066]">
                {item.size} · Qty {item.quantity}
              </p>
            </div>
            <p className="text-sm font-semibold text-[#2C2C2C] whitespace-nowrap">
              {formatPrice(item.price * item.quantity)}
            </p>
          </div>
        ))}
      </div>

      {/* Free gift — automatic, one per order, not shown on product pages */}
      <div className="mb-4 flex items-start gap-2.5 bg-[#FAF7F2] border border-[#C9A84C]/40 rounded-xl p-3">
        <Gift size={16} className="text-[#C9A84C] shrink-0 mt-0.5" />
        <p className="text-xs text-[#2C2C2C]">
          <strong>🎁 Free Gift Included With Your Order</strong>
          <span className="block text-[#7A7066] mt-0.5">
            One complimentary gift ships with every order, on us.
          </span>
        </p>
      </div>

      {promoCode && (
        <div className="mb-4 flex items-center justify-between px-3 py-2 bg-[#FAF7F2] border border-[#C9A84C] rounded-lg">
          <span className="text-xs font-semibold text-[#2C2C2C] tracking-wide">
            {promoCode} applied
          </span>
          <button
            type="button"
            onClick={clearPromoCode}
            className="text-xs font-semibold text-[#7A7066] hover:text-[#D4A5A5] transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      <div className="border-t border-[#E8DDD0] pt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[#7A7066]">Subtotal</span>
          <span className="text-[#2C2C2C]">{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#7A7066]">Shipping</span>
          <span className="text-[#2C2C2C]">
            {shippingCost === 0 ? 'Free' : formatPrice(shippingCost)}
          </span>
        </div>
        {giftFee > 0 && (
          <div className="flex justify-between">
            <span className="text-[#7A7066] flex items-center gap-1.5">
              <Gift size={13} className="text-[#C9A84C]" /> Gift packaging &amp; card
            </span>
            <span className="text-[#2C2C2C]">{formatPrice(giftFee)}</span>
          </div>
        )}
        {discountAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-[#7A7066]">Discount ({promoCode})</span>
            <span className="text-green-700">-{formatPrice(discountAmount)}</span>
          </div>
        )}
        {shippingCost > 0 && (
          <p className="text-xs text-[#7A7066]">
            Spend {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} more for free shipping.
          </p>
        )}
        <div className="flex justify-between border-t border-[#E8DDD0] pt-3 mt-1">
          <span className="font-bold text-[#2C2C2C]">Total</span>
          <span className="font-bold text-[#C9A84C] text-lg">{formatPrice(total)}</span>
        </div>
        {requiresAdvance && (
          <>
            <div className="flex justify-between text-amber-800">
              <span>Advance due now ({Math.round(ADVANCE_PERCENT * 100)}%)</span>
              <span className="font-semibold">{formatPrice(advanceAmount)}</span>
            </div>
            <div className="flex justify-between text-[#7A7066]">
              <span>Balance due later</span>
              <span>{formatPrice(balanceDue)}</span>
            </div>
          </>
        )}
        <p className="text-xs text-[#7A7066] pt-1">
          Final total is recalculated on our server from current product prices.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF7F2] py-10">
      <div className="container max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1
            className="text-3xl md:text-4xl font-bold text-[#2C2C2C] mb-1"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Checkout
          </h1>
          <p className="text-[#7A7066] text-sm flex items-center justify-center gap-1.5">
            <Lock size={13} /> Your details are sent over a secure connection
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center mb-8">
          {[
            { key: 'details', label: 'Your details', num: 1 },
            { key: 'payment', label: 'Payment', num: 2 },
          ].map((s, i) => {
            const active = step === s.key;
            const done = step === 'payment' && s.key === 'details';
            return (
              <div key={s.key} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      active || done
                        ? 'bg-[#C9A84C] text-[#2C2C2C]'
                        : 'bg-white border border-[#E8DDD0] text-[#7A7066]'
                    }`}
                  >
                    {done ? <CheckCircle2 size={16} /> : s.num}
                  </div>
                  <span
                    className={`text-sm font-semibold hidden sm:inline ${
                      active || done ? 'text-[#2C2C2C]' : 'text-[#7A7066]'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i === 0 && <div className="w-10 sm:w-16 h-px bg-[#E8DDD0] mx-3" />}
              </div>
            );
          })}
        </div>

        {submitError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4"
          >
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* ── Step 1: customer details ── */}
            {step === 'details' && (
              <form
                onSubmit={handleDetailsSubmit}
                noValidate
                className="bg-white rounded-2xl border border-[#E8DDD0] p-6 shadow-sm"
              >
                <h2 className="font-bold text-[#2C2C2C] mb-1">Delivery details</h2>
                <p className="text-xs text-[#7A7066] mb-5">
                  Fields marked <span className="text-[#D4A5A5]">*</span> are required.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    {field('fullName', 'Full name', {
                      placeholder: 'Ayesha Khan',
                      autoComplete: 'name',
                    })}
                  </div>
                  {field('email', 'Email', {
                    type: 'email',
                    placeholder: 'you@example.com',
                    autoComplete: 'email',
                  })}
                  {field('phone', 'Phone number', {
                    type: 'tel',
                    placeholder: '03001234567',
                    autoComplete: 'tel',
                  })}
                  <div className="md:col-span-2">
                    {field('address', 'Address', {
                      placeholder: 'House 12, Street 4, Gulberg III',
                      autoComplete: 'street-address',
                    })}
                  </div>
                  {field('city', 'City', { placeholder: 'Lahore', autoComplete: 'address-level2' })}

                  <div>
                    <label htmlFor="province" className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                      Province <span className="text-[#D4A5A5]">*</span>
                    </label>
                    <select
                      id="province"
                      value={form.province}
                      onChange={(e) => setField('province', e.target.value)}
                      aria-invalid={!!errors.province}
                      data-invalid={errors.province ? 'true' : 'false'}
                      className={`w-full px-4 py-3 rounded-xl border bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 ${
                        errors.province
                          ? 'border-red-400 focus:ring-red-300'
                          : 'border-[#E8DDD0] focus:ring-[#C9A84C]'
                      }`}
                    >
                      <option value="">Select a province…</option>
                      {PAKISTAN_PROVINCES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    {errors.province && (
                      <p role="alert" className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle size={12} /> {errors.province}
                      </p>
                    )}
                  </div>

                  {field('postalCode', 'Postal code', {
                    placeholder: '54000',
                    autoComplete: 'postal-code',
                  })}

                  <div className="md:col-span-2">
                    <label htmlFor="notes" className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                      Delivery notes <span className="text-[#7A7066] font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      value={form.notes}
                      onChange={(e) => setField('notes', e.target.value)}
                      placeholder="Landmark, gate code, preferred delivery time…"
                      className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                    />
                  </div>
                </div>

                {/* ── Gifting ── */}
                <div className="mt-6 border border-[#E8DDD0] rounded-xl overflow-hidden">
                  <label className="flex items-start gap-3 p-4 bg-[#FAF7F2] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={giftPackaging}
                      onChange={(e) => setGiftPackaging(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-[#C9A84C]"
                    />
                    <span className="flex-1">
                      <span className="flex items-center gap-2 font-semibold text-[#2C2C2C] text-sm">
                        <Gift size={15} className="text-[#C9A84C]" />
                        Make it a gift
                        <span className="text-[#C9A84C]">
                          +{formatPrice(gifting?.packagingFee ?? 0)}
                        </span>
                      </span>
                      <span className="block text-xs text-[#7A7066] mt-1">
                        {(gifting?.includes ?? []).join(' · ')}
                      </span>
                    </span>
                  </label>

                  {giftPackaging && (
                    <div className="p-4 space-y-4 border-t border-[#E8DDD0]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="giftRecipientName" className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                            Card is for <span className="text-[#7A7066] font-normal">(optional)</span>
                          </label>
                          <input
                            id="giftRecipientName"
                            type="text"
                            value={giftRecipientName}
                            onChange={(e) => setGiftRecipientName(e.target.value)}
                            placeholder="Fatima"
                            className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                          />
                        </div>
                        <div>
                          <label htmlFor="giftSenderName" className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                            Signed from <span className="text-[#7A7066] font-normal">(optional)</span>
                          </label>
                          <input
                            id="giftSenderName"
                            type="text"
                            value={giftSenderName}
                            onChange={(e) => setGiftSenderName(e.target.value)}
                            placeholder="Ayesha"
                            className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="giftCardMessage" className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">
                          Message for the handwritten card
                        </label>
                        <textarea
                          id="giftCardMessage"
                          rows={3}
                          maxLength={giftMessageMax}
                          value={giftCardMessage}
                          onChange={(e) => setGiftCardMessage(e.target.value)}
                          placeholder="Happy birthday! Hope this makes your home smell as lovely as you are."
                          className="w-full px-4 py-3 rounded-xl border border-[#E8DDD0] bg-white text-sm text-[#2C2C2C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                        />
                        <p className="text-xs text-[#7A7066] mt-1 text-right">
                          {giftCardMessage.length}/{giftMessageMax}
                        </p>
                      </div>

                      <p className="text-xs text-[#7A7066]">
                        We write the card by hand and leave prices off the packing slip, so it
                        arrives ready to give.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="mt-6 w-full py-3.5 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors flex items-center justify-center gap-2"
                >
                  Continue to payment <ArrowRight size={18} />
                </button>
              </form>
            )}

            {/* ── Step 2: payment method ── */}
            {step === 'payment' && (
              <form
                onSubmit={handlePlaceOrder}
                className="bg-white rounded-2xl border border-[#E8DDD0] p-6 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[#C9A84C] hover:text-[#D4A5A5] mb-5"
                >
                  <ArrowLeft size={16} /> Back to details
                </button>

                <h2 className="font-bold text-[#2C2C2C] mb-1">How would you like to pay?</h2>
                <p className="text-xs text-[#7A7066] mb-5">
                  Choosing a method records your preference. Nothing is charged now.
                </p>

                {requiresAdvance && (
                  <div className="mb-5 p-4 rounded-xl border border-amber-300 bg-amber-50">
                    <p className="text-sm font-semibold text-amber-900 mb-1">
                      This order needs a {Math.round(ADVANCE_PERCENT * 100)}% advance — {formatPrice(advanceAmount)}
                    </p>
                    <p className="text-xs text-amber-800 mb-3">
                      One of the candles in your cart is priced at {formatPrice(ADVANCE_ITEM_THRESHOLD)} or more, so
                      we ask for a {Math.round(ADVANCE_PERCENT * 100)}% advance to confirm the order. Send{' '}
                      {formatPrice(advanceAmount)} via JazzCash or Easypaisa using either QR code below, then place
                      your order — our team confirms receipt manually. The remaining {formatPrice(balanceDue)} is
                      due via your selected payment method.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(['jazzcash', 'easypaisa'] as const).map((method) => (
                        <div key={method} className="flex items-center gap-3 bg-white rounded-lg border border-amber-200 p-3">
                          <div className="w-16 h-16 shrink-0 bg-[#FAF7F2] rounded-lg border border-[#E8DDD0] flex items-center justify-center overflow-hidden">
                            {WALLET_QR[method].qrImage ? (
                              <img src={WALLET_QR[method].qrImage} alt={`${method} QR code`} className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-[9px] text-[#7A7066] text-center px-1">QR coming soon</span>
                            )}
                          </div>
                          <div className="text-xs">
                            <p className="font-semibold text-[#2C2C2C] capitalize">{method}</p>
                            <p className="text-[#7A7066]">{WALLET_QR[method].accountTitle}</p>
                            <p className="text-[#7A7066]">{WALLET_QR[method].accountNumber}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3" role="radiogroup" aria-label="Payment method">
                  {PAYMENT_OPTIONS.map((option) => {
                    const selected = paymentMethod === option.id;
                    return (
                      <label
                        key={option.id}
                        className="flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
                        style={{
                          borderColor: selected ? option.border : '#E8DDD0',
                          backgroundColor: selected ? option.bg : '#fff',
                        }}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={option.id}
                          checked={selected}
                          onChange={() => setPaymentMethod(option.id)}
                          className="mt-1 accent-[#C9A84C]"
                        />
                        <span className="text-2xl leading-none">{option.icon}</span>
                        <span className="flex-1">
                          <span className="block font-semibold text-[#2C2C2C] text-sm">
                            {option.label}
                          </span>
                          <span className="block text-xs text-[#7A7066] mt-0.5">
                            {option.description}
                          </span>
                          {option.gateway === 'none' && (
                            <span className="block text-xs text-amber-700 mt-1.5">
                              Confirmed manually by our team — you’ll receive payment
                              instructions after ordering.
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {(paymentMethod === 'jazzcash' || paymentMethod === 'easypaisa') && (
                  <div className="mt-4 p-4 rounded-xl border border-[#E8DDD0] bg-[#FAF7F2] flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                    <div className="w-32 h-32 shrink-0 bg-white rounded-lg border border-[#E8DDD0] flex items-center justify-center overflow-hidden">
                      {WALLET_QR[paymentMethod].qrImage ? (
                        <img
                          src={WALLET_QR[paymentMethod].qrImage}
                          alt={`${selectedOption.label} QR code`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-[#7A7066] text-center px-2">QR code coming soon</span>
                      )}
                    </div>
                    <div className="text-sm text-center sm:text-left">
                      <p className="font-semibold text-[#2C2C2C] mb-1">
                        Scan to pay {formatPrice(total)} with {selectedOption.label}
                      </p>
                      <p className="text-[#7A7066]">
                        Account title: <span className="font-medium text-[#2C2C2C]">{WALLET_QR[paymentMethod].accountTitle}</span>
                      </p>
                      <p className="text-[#7A7066]">
                        Account number: <span className="font-medium text-[#2C2C2C]">{WALLET_QR[paymentMethod].accountNumber}</span>
                      </p>
                      <p className="text-xs text-[#7A7066] mt-2">
                        Place your order first, then send the payment — our team confirms it
                        manually and updates your order status.
                      </p>
                    </div>
                  </div>
                )}

                {/*
                  No card numbers, CVCs or wallet PINs are collected anywhere in
                  this application. Card details belong on the gateway's own
                  hosted page, never in our React state.
                */}
                <div className="mt-5 flex items-start gap-3 bg-[#FAF7F2] border border-[#E8DDD0] rounded-xl p-4">
                  <Lock size={16} className="text-[#C9A84C] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#7A7066]">
                    We never ask for your card number, CVC or wallet PIN on this site. Card
                    payments are completed on the payment provider’s own secure page.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={createOrder.isPending}
                  className="mt-6 w-full py-3.5 bg-[#2C2C2C] text-[#FAF7F2] rounded-xl font-bold hover:bg-[#C9A84C] hover:text-[#2C2C2C] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {createOrder.isPending ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Placing your order…
                    </>
                  ) : (
                    <>Place order · {formatPrice(total)}</>
                  )}
                </button>
                <p className="text-xs text-center text-[#7A7066] mt-3">
                  Your order will be created with a <strong>pending</strong> payment status.
                </p>
              </form>
            )}
          </div>

          <div className="lg:col-span-1">{orderSummary}</div>
        </div>
      </div>
    </div>
  );
}
