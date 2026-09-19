export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: 'dessert-jar' | 'cupcake' | 'iced-latte' | 'cheesecake' | 'wax-melts';
  price: string;
  stock: number;
  images: string[];
  scentNotes: string[];
  burnTime?: string;
  waxType?: string;
  sizeOptions: Array<{ size: string; ml: number }>;
  isFeatured: boolean;
  isBestseller: boolean;
  isLimitedEdition: boolean;
  isActive?: boolean;
  averageRating?: string;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  productId: number;
  quantity: number;
  size: string;
}

export interface WishlistItem {
  id: number;
  userId: number;
  productId: number;
  createdAt: Date;
}

export interface Order {
  id: number;
  userId: number;
  orderNumber: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  total: string;
  subtotal: string;
  shippingCost: string;
  discountAmount: string;
  promoCode?: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState?: string;
  shippingZipCode: string;
  shippingCountry: string;
  paymentMethod: 'stripe' | 'jazzcash' | 'easypaisa' | 'cod';
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  stripePaymentIntentId?: string;
  trackingNumber?: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  advanceRequired: boolean;
  advanceAmount: string;
  advancePaid: boolean;
  balanceDueAmount: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: number;
  productId: number;
  userId: number;
  rating: number;
  body?: string;
  isVerifiedPurchase: boolean;
  helpful: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromoCode {
  id: number;
  code: string;
  discountType: 'percent' | 'flat';
  value: string;
  usageLimit?: number;
  usedCount: number;
  expiryDate?: Date;
  isActive: boolean;
  applicableCategory: 'all' | 'dessert-jar' | 'cupcake' | 'iced-latte' | 'cheesecake' | 'wax-melts';
  minOrderAmount: string;
  firstOrderOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: number;
  openId: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  loginMethod?: string;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}
