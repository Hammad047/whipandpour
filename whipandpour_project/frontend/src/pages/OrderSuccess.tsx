import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle, Package, Truck, Home, ShoppingBag } from 'lucide-react';

export default function OrderSuccess() {
  const [, navigate] = useLocation();
  const [orderId, setOrderId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  useEffect(() => {
    const storedOrderId = sessionStorage.getItem('lastOrderId');
    const storedMethod = sessionStorage.getItem('lastPaymentMethod');
    if (storedOrderId) setOrderId(storedOrderId);
    else setOrderId(`WP-${Date.now().toString().slice(-6)}`);
    if (storedMethod) setPaymentMethod(storedMethod);
  }, []);

  const eta = new Date();
  eta.setDate(eta.getDate() + 4);
  const etaStr = eta.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const steps = [
    { icon: '📧', title: 'Order Confirmation', desc: 'You\'ll receive an email confirmation shortly' },
    { icon: '🕯️', title: 'Hand-Poured with Love', desc: 'Our artisans carefully craft your candles' },
    { icon: '📦', title: 'Packed & Shipped', desc: 'Your order will be dispatched via TCS / Leopards' },
    { icon: '🚪', title: 'Delivered to Your Door', desc: 'Estimated delivery: 3–5 business days' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] py-16 px-4">
      <div className="max-w-lg mx-auto">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle size={42} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-[#2C2C2C] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            Order Placed! 🎉
          </h1>
          <p className="text-[#7A7066]">Thank you for shopping with Whip & Pour</p>
        </div>

        {/* Order Details Card */}
        <div className="bg-white rounded-2xl border border-[#E8DDD0] p-6 mb-6 shadow-sm">
          <h2 className="font-bold text-[#2C2C2C] mb-4">Order Details</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#7A7066]">Order ID</span>
              <span className="font-bold text-[#C9A84C]">#{orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A7066]">Estimated Delivery</span>
              <span className="font-semibold text-[#2C2C2C]">{etaStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A7066]">Delivery Time</span>
              <span className="font-semibold text-[#2C2C2C]">3–5 Business Days</span>
            </div>
            {paymentMethod && (
              <div className="flex justify-between">
                <span className="text-[#7A7066]">Payment Method</span>
                <span className="font-semibold text-[#2C2C2C] capitalize">{paymentMethod}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#7A7066]">Status</span>
              <span className="px-3 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">Processing</span>
            </div>
          </div>
        </div>

        {/* What Happens Next */}
        <div className="bg-white rounded-2xl border border-[#E8DDD0] p-6 mb-6 shadow-sm">
          <h2 className="font-bold text-[#2C2C2C] mb-4">What Happens Next?</h2>
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-[#FAF7F2] border border-[#E8DDD0] flex items-center justify-center text-lg flex-shrink-0">
                  {step.icon}
                </div>
                <div>
                  <p className="font-semibold text-[#2C2C2C] text-sm">{step.title}</p>
                  <p className="text-xs text-[#7A7066] mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-[#E8DDD0] text-[#2C2C2C] rounded-xl font-semibold hover:bg-[#FAF7F2] transition-colors text-sm"
          >
            <Home size={16} />
            Back to Home
          </button>
          <button
            onClick={() => navigate('/shop')}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors text-sm"
          >
            <ShoppingBag size={16} />
            Continue Shopping
          </button>
        </div>

        <p className="text-center text-xs text-[#7A7066] mt-6">
          Questions? Contact us at <span className="text-[#C9A84C] font-medium">support@whipandpour.com</span>
        </p>
      </div>
    </div>
  );
}
