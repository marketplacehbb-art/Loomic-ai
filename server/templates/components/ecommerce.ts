import { buildComponentLibrary } from './shared.js';

export const ECOMMERCE_COMPONENTS = buildComponentLibrary('ecommerce', [
  {
    name: 'ProductGrid',
    description: 'Responsive product grid for catalog listing pages.',
    tags: ['ecommerce', 'products', 'grid'],
    supabaseRequired: true,
  },
  {
    name: 'ProductDetail',
    description: 'Full product detail layout with gallery, specs, and CTA.',
    tags: ['ecommerce', 'product-detail', 'catalog'],
    supabaseRequired: true,
  },
  {
    name: 'CartItem',
    description: 'Cart row item with quantity controls and subtotal display.',
    tags: ['ecommerce', 'cart', 'quantity'],
    supabaseRequired: true,
  },
  {
    name: 'CartSummary',
    description: 'Order summary panel with totals, discounts, and checkout button.',
    tags: ['ecommerce', 'cart', 'checkout'],
    supabaseRequired: true,
  },
  {
    name: 'CheckoutForm',
    description: 'Multi-step checkout form with shipping and payment sections.',
    tags: ['ecommerce', 'checkout', 'form'],
    supabaseRequired: true,
  },
  {
    name: 'OrderConfirmation',
    description: 'Order success page with confirmation details and next steps.',
    tags: ['ecommerce', 'order', 'confirmation'],
    supabaseRequired: true,
  },
  {
    name: 'WishlistButton',
    description: 'Heart toggle button for saved products and favorites.',
    tags: ['ecommerce', 'wishlist', 'toggle'],
    supabaseRequired: true,
  },
  {
    name: 'PriceDisplay',
    description: 'Price component supporting original, sale, and discounted labels.',
    tags: ['ecommerce', 'price', 'sale'],
  },
  {
    name: 'StockBadge',
    description: 'Stock state badge for in-stock, low-stock, and sold-out statuses.',
    tags: ['ecommerce', 'inventory', 'badge'],
    supabaseRequired: true,
  },
  {
    name: 'ShippingInfo',
    description: 'Delivery option display with timing and pricing details.',
    tags: ['ecommerce', 'shipping', 'delivery'],
  },
  {
    name: 'ProductReviews',
    description: 'Product review list with add-review form and rating summary.',
    tags: ['ecommerce', 'reviews', 'ratings'],
    supabaseRequired: true,
  },
  {
    name: 'RelatedProducts',
    description: 'Related products recommendation grid for cross-sell flows.',
    tags: ['ecommerce', 'recommendations', 'products'],
    supabaseRequired: true,
  },
]);
