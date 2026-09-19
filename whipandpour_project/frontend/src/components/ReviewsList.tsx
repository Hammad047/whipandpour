import { useState } from 'react';
import { Star, ThumbsUp } from 'lucide-react';

interface Review {
  id: number;
  userId: number;
  userName: string;
  rating: number;
  title: string;
  content: string;
  verifiedPurchase: boolean;
  helpful: number;
  createdAt: string;
}

interface ReviewsListProps {
  productId: number;
  reviews?: Review[];
  averageRating: number;
  totalReviews: number;
}

export default function ReviewsList({
  productId,
  reviews = [],
  averageRating,
  totalReviews,
}: ReviewsListProps) {
  const [helpfulReviews, setHelpfulReviews] = useState<Set<number>>(new Set());

  const ratingCounts = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((r) => r.rating === rating).length,
  }));

  const toggleHelpful = (reviewId: number) => {
    setHelpfulReviews((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(reviewId)) {
        newSet.delete(reviewId);
      } else {
        newSet.add(reviewId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-8">
      {/* Rating Summary */}
      <div className="bg-[#F5F0E8] rounded-lg p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Average Rating */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-5xl font-bold text-[#2C2C2C] mb-2">
              {averageRating.toFixed(1)}
            </div>
            <div className="flex text-[#C9A84C] text-2xl mb-2">
              {'★'.repeat(Math.round(averageRating))}
              {'☆'.repeat(5 - Math.round(averageRating))}
            </div>
            <p className="text-[#666]">Based on {totalReviews} reviews</p>
          </div>

          {/* Rating Breakdown */}
          <div className="space-y-3">
            {ratingCounts.map(({ rating, count }) => (
              <div key={rating} className="flex items-center gap-3">
                <div className="flex gap-1 w-12">
                  {[...Array(rating)].map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className="fill-[#C9A84C] text-[#C9A84C]"
                    />
                  ))}
                  {[...Array(5 - rating)].map((_, i) => (
                    <Star
                      key={i + rating}
                      size={14}
                      className="text-[#D4A5A5]"
                    />
                  ))}
                </div>
                <div className="flex-1 h-2 bg-[#E8DDD0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C9A84C] transition-all"
                    style={{
                      width: `${totalReviews > 0 ? (count / totalReviews) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-sm text-[#666] w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div>
        <h3 className="text-2xl font-bold text-[#2C2C2C] mb-6">
          Customer Reviews
        </h3>

        {reviews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#666] mb-4">No reviews yet</p>
            <p className="text-sm text-[#999]">
              Be the first to review this product
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="border border-[#E8DDD0] rounded-lg p-6"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex text-[#C9A84C]">
                        {'★'.repeat(review.rating)}
                        {'☆'.repeat(5 - review.rating)}
                      </div>
                      <h4 className="font-semibold text-[#2C2C2C]">
                        {review.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#666]">
                      <span>{review.userName}</span>
                      {review.verifiedPurchase && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          ✓ Verified Purchase
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-[#999]">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Content */}
                <p className="text-[#666] mb-4 leading-relaxed">
                  {review.content}
                </p>

                {/* Helpful Button */}
                <button
                  onClick={() => toggleHelpful(review.id)}
                  className={`flex items-center gap-2 text-sm px-3 py-1 rounded transition-colors ${
                    helpfulReviews.has(review.id)
                      ? 'bg-[#C9A84C] text-[#2C2C2C]'
                      : 'bg-[#F5F0E8] text-[#666] hover:bg-[#E8DDD0]'
                  }`}
                >
                  <ThumbsUp size={14} />
                  Helpful ({review.helpful + (helpfulReviews.has(review.id) ? 1 : 0)})
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
