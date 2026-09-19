import { useState } from 'react';
import { Star, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface ReviewFormProps {
  productId: number;
  onReviewSubmitted?: () => void;
}

/**
 * "Share Your Experience" — review submission.
 *
 * A review may only be written by someone who actually bought this product.
 * Because the store uses guest checkout, the proof is the order number plus the
 * email the order was placed with — exactly the pair shown on the confirmation
 * screen — not merely being signed in.
 *
 * The backend re-verifies the purchase independently; this form is UX only. A
 * submitted review is held as `pending` and only reaches the product page once
 * an admin approves it in the moderation queue.
 *
 * The previous version gated on `useAuth()` (a login flow this store does not
 * have) and its submit handler only called `console.log` — no review was ever
 * created.
 */
export default function ReviewForm({ productId, onReviewSubmitted }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const createReview = trpc.reviews.create.useMutation({
    onSuccess: (result: any) => {
      setSubmitted(result.message);
      setError(null);
      setRating(0);
      setTitle('');
      setContent('');
      setOrderNumber('');
      setEmail('');
      utils.reviews.byProduct.invalidate();
      onReviewSubmitted?.();
    },
    onError: (e: any) => {
      setError(e?.message ?? 'We could not submit your review. Please try again.');
      setSubmitted(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rating === 0) return setError('Please choose a star rating.');
    if (!orderNumber.trim()) return setError('Please enter the order number from your confirmation.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError('Please enter the email address used on the order.');
    if (content.trim().length < 10)
      return setError('Please write at least a sentence about the product.');

    createReview.mutate({
      productId,
      rating,
      title: title.trim(),
      body: content.trim(),
      orderNumber: orderNumber.trim(),
      email: email.trim(),
    });
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-lg p-6 border border-[#E8DDD0] text-center">
        <CheckCircle2 size={36} className="mx-auto text-green-600 mb-3" />
        <p className="font-semibold text-[#2C2C2C] mb-1">Review submitted</p>
        <p className="text-sm text-[#7A7066] max-w-md mx-auto">{submitted}</p>
        <button
          onClick={() => setSubmitted(null)}
          className="mt-5 px-5 py-2 text-sm font-semibold text-[#C9A84C] hover:text-[#D4A5A5] transition-colors"
        >
          Write another review
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 border border-[#E8DDD0]">
      <h3 className="text-lg font-semibold text-[#2C2C2C] mb-1">Write a Review</h3>

      <div className="flex items-start gap-2 mb-6 text-sm text-[#7A7066]">
        <ShieldCheck size={16} className="text-[#C9A84C] shrink-0 mt-0.5" />
        <p>
          Only customers who have bought this candle can review it. Enter the order number
          from your confirmation to verify your purchase.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Purchase verification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="review-order" className="block text-sm font-semibold text-[#2C2C2C] mb-2">
            Order number <span className="text-[#D4A5A5]">*</span>
          </label>
          <input
            id="review-order"
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="WP-2608-123456"
            className="w-full px-4 py-2 border border-[#E8DDD0] rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          />
        </div>
        <div>
          <label htmlFor="review-email" className="block text-sm font-semibold text-[#2C2C2C] mb-2">
            Email used on the order <span className="text-[#D4A5A5]">*</span>
          </label>
          <input
            id="review-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-2 border border-[#E8DDD0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          />
        </div>
      </div>

      {/* Rating */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-[#2C2C2C] mb-3">
          Rating <span className="text-[#D4A5A5]">*</span>
        </label>
        <div className="flex gap-2" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              aria-pressed={rating === star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                size={32}
                className={`${
                  star <= (hoverRating || rating)
                    ? 'fill-[#C9A84C] text-[#C9A84C]'
                    : 'text-[#D4A5A5]'
                } transition-colors`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="mb-6">
        <label htmlFor="review-title" className="block text-sm font-semibold text-[#2C2C2C] mb-2">
          Review title <span className="text-[#7A7066] font-normal">(optional)</span>
        </label>
        <input
          id="review-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Smells exactly like the real thing"
          className="w-full px-4 py-2 border border-[#E8DDD0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
        />
      </div>

      {/* Content */}
      <div className="mb-6">
        <label htmlFor="review-body" className="block text-sm font-semibold text-[#2C2C2C] mb-2">
          Your review <span className="text-[#D4A5A5]">*</span>
        </label>
        <textarea
          id="review-body"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="How does it smell? How long did it burn? Would you gift it?"
          rows={4}
          maxLength={2000}
          className="w-full px-4 py-2 border border-[#E8DDD0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C9A84C] resize-none"
        />
        <p className="text-xs text-[#7A7066] mt-1 text-right">{content.length}/2000</p>
      </div>

      <button
        type="submit"
        disabled={createReview.isPending}
        className="w-full py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-lg font-semibold hover:bg-[#D4A5A5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {createReview.isPending && <Loader2 size={16} className="animate-spin" />}
        {createReview.isPending ? 'Submitting…' : 'Submit Review'}
      </button>

      <p className="text-xs text-[#7A7066] mt-3 text-center">
        Reviews are checked by our team before they appear on the product page.
      </p>
    </form>
  );
}
