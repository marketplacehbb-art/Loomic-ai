export type AppTypeName =
  | 'restaurant'
  | 'saas-dashboard'
  | 'ecommerce'
  | 'todo-app'
  | 'blog'
  | 'booking'
  | 'mobile-app'
  | 'game'
  | 'ai-tool'
  | 'social'
  | 'marketplace'
  | 'saas-tool';

export interface AppTypeBlueprint {
  name: AppTypeName;
  triggers: string[];
  pages: string[];
  tables: string[];
  features: string[];
  mustHaveComponents: string[];
  visualStyle?: string;
  specialInstructions?: string;
}

export const APP_TYPE_BLUEPRINTS: AppTypeBlueprint[] = [
  {
    name: 'restaurant',
    triggers: ['restaurant', 'pizza', 'cafe', 'food', 'menu', 'bistro'],
    pages: ['/', '/menu', '/order', '/admin'],
    tables: ['menu_items', 'orders', 'reservations'],
    features: [
      'Interactive menu with categories (Starters, Mains, Desserts, Drinks)',
      'Add to cart with quantity controls',
      'Order form with name, address, phone',
      'Real-time order status updates',
      'Admin panel: add/edit/delete menu items',
      'Reservation system with date/time picker',
      'Opening hours display',
    ],
    mustHaveComponents: [
      'MenuGrid with category filter tabs',
      'CartSidebar with item list + total',
      'OrderForm with validation',
      'ReservationModal with date picker',
      'AdminPanel (protected route)',
    ],
  },
  {
    name: 'saas-dashboard',
    triggers: ['dashboard', 'analytics', 'admin panel', 'crm', 'management'],
    pages: ['/login', '/dashboard', '/dashboard/analytics', '/dashboard/users', '/dashboard/settings'],
    tables: ['users', 'events', 'metrics'],
    features: [
      'Auth with protected routes',
      'KPI cards with real numbers from DB',
      'Line chart showing data over time (recharts)',
      'Data table with search, sort, pagination',
      'User management CRUD',
      'Settings page',
      'Real-time updates via Supabase realtime',
    ],
    mustHaveComponents: [
      'DashboardLayout with sidebar',
      'StatsCard with trend indicator',
      'DataChart using recharts LineChart',
      'UserTable with actions',
      'SearchBar with debounce',
    ],
  },
  {
    name: 'ecommerce',
    triggers: ['shop', 'store', 'ecommerce', 'products', 'buy', 'sell'],
    pages: ['/', '/products', '/product/:id', '/cart', '/checkout'],
    tables: ['products', 'orders', 'order_items', 'customers'],
    features: [
      'Product grid with filter by category',
      'Product detail page with images, description, price',
      'Working cart with localStorage persistence',
      'Checkout form with validation',
      'Order confirmation page',
      'Admin: manage products',
      'Search products',
    ],
    mustHaveComponents: [
      'ProductGrid with CategoryFilter',
      'ProductCard with hover effects',
      'CartDrawer with item controls',
      'CheckoutForm with steps',
      'OrderSummary',
    ],
  },
  {
    name: 'todo-app',
    triggers: ['todo', 'task', 'project manager', 'kanban', 'tracker'],
    pages: ['/login', '/app'],
    tables: ['todos', 'categories', 'tags'],
    features: [
      'Auth required',
      'Create/edit/delete todos',
      'Mark as complete',
      'Filter by status/category',
      'Drag to reorder (using simple up/down buttons)',
      'Due date with overdue highlighting',
      'Priority levels (High/Medium/Low)',
      'Real-time sync across tabs',
    ],
    mustHaveComponents: [
      'TodoList with filter tabs',
      'TodoItem with complete/delete/edit',
      'AddTodoForm with priority/date',
      'CategorySidebar',
      'ProgressBar showing completion %',
    ],
  },
  {
    name: 'blog',
    triggers: ['blog', 'articles', 'cms', 'content', 'posts', 'writing'],
    pages: ['/', '/blog', '/blog/:slug', '/about', '/admin'],
    tables: ['posts', 'categories', 'comments'],
    features: [
      'Article list with featured post',
      'Article detail with markdown rendering',
      'Category filtering',
      'Comment system',
      'Author profile',
      'Newsletter signup',
      'Admin: write/edit posts with rich text',
      'Reading time estimate',
    ],
    mustHaveComponents: [
      'ArticleGrid with FeaturedPost',
      'ArticleCard with category badge',
      'ArticleDetail with TableOfContents',
      'CommentSection',
      'NewsletterForm',
      'AdminEditor',
    ],
  },
  {
    name: 'booking',
    triggers: ['booking', 'appointment', 'schedule', 'calendar', 'clinic', 'salon'],
    pages: ['/', '/book', '/confirmation', '/admin/bookings'],
    tables: ['services', 'bookings', 'time_slots', 'staff'],
    features: [
      'Service selection',
      'Staff/provider selection',
      'Calendar with available slots',
      'Time slot picker',
      'Booking form with contact details',
      'Confirmation page with booking ID',
      'Admin: view/manage all bookings',
      'Cancel/reschedule functionality',
    ],
    mustHaveComponents: [
      'ServiceGrid',
      'StaffSelector',
      'CalendarPicker',
      'TimeSlotGrid',
      'BookingForm',
      'BookingConfirmation',
      'AdminBookingTable',
    ],
  },
  {
    name: 'mobile-app',
    triggers: ['mobile app', 'pwa', 'app like instagram', 'mobile first', 'native app feel'],
    pages: ['/splash', '/onboarding', '/home', '/profile', '/settings'],
    tables: ['users', 'posts', 'follows', 'notifications'],
    features: [
      'Bottom navigation bar (mobile-style)',
      'Swipeable cards using CSS transforms + touch events',
      'Pull-to-refresh simulation',
      'Story-style top scroll (horizontal)',
      'Modal sheets from bottom (like iOS)',
      'Haptic-style animations on interactions',
      'Offline-ready with loading skeletons everywhere',
      'Push notification UI',
    ],
    mustHaveComponents: [
      'BottomNavBar (fixed bottom, 5 icons)',
      'SwipeableCard with touch handlers',
      'BottomSheet modal component',
      'StoryBar horizontal scroll',
      'SkeletonLoader for every data component',
      'PullToRefresh wrapper',
    ],
    visualStyle: 'mobile-first, rounded corners everywhere (rounded-3xl), large touch targets (min-h-14), iOS-style blur effects (backdrop-blur)',
  },
  {
    name: 'game',
    triggers: ['game', 'quiz', 'puzzle', 'snake', 'tetris', 'memory game', 'word game', 'clicker'],
    pages: ['/'],
    tables: ['scores', 'leaderboard'],
    features: [
      'Game loop using useEffect + setInterval',
      'Keyboard controls with useEffect event listeners',
      'Score tracking with localStorage backup',
      'Global leaderboard with Supabase',
      'Game states: idle/playing/paused/gameover',
      'Smooth animations using requestAnimationFrame',
      'Sound effects using Web Audio API',
      'Mobile touch controls',
    ],
    mustHaveComponents: [
      'GameCanvas or GameGrid',
      'ScoreBoard',
      'GameControls (keyboard + touch)',
      'LeaderboardModal',
      'GameOverScreen',
      'StartScreen',
    ],
    specialInstructions: 'Use useRef for game state to avoid re-render issues. Never use useState for rapidly changing game values. Use useCallback for event handlers. Canvas games: use useRef for canvas element.',
  },
  {
    name: 'ai-tool',
    triggers: ['ai tool', 'chatbot', 'text generator', 'image analyzer', 'summarizer', 'translator', 'writing assistant'],
    pages: ['/', '/tool', '/history'],
    tables: ['generations', 'history', 'presets'],
    features: [
      'Streaming text output (typewriter effect)',
      'Input -> AI Output interface',
      'History of previous generations',
      'Preset prompts/templates',
      'Copy output to clipboard',
      'Export as TXT/MD',
      'Token counter showing usage',
      'Model selector (if multiple)',
    ],
    mustHaveComponents: [
      'PromptInput with character counter',
      'StreamingOutput with typewriter animation',
      'HistoryPanel',
      'PresetLibrary',
      'OutputActions (copy/export/share)',
      'TokenUsageBar',
    ],
    specialInstructions: 'Simulate streaming with setInterval typewriter effect. Show token count as user types. History stored in Supabase with timestamps.',
  },
  {
    name: 'social',
    triggers: ['social', 'community', 'forum', 'feed', 'posts', 'twitter clone', 'reddit clone', 'social network'],
    pages: ['/', '/feed', '/post/:id', '/profile/:id', '/notifications'],
    tables: ['posts', 'comments', 'likes', 'follows', 'notifications'],
    features: [
      'Auth required',
      'Post feed with infinite scroll simulation',
      'Create post with text + optional image URL',
      'Like/unlike with optimistic updates',
      'Comment thread on posts',
      'Follow/unfollow users',
      'Notification system',
      'User profiles with post history',
      'Trending/Latest toggle',
      'Real-time new posts via Supabase',
    ],
    mustHaveComponents: [
      'PostFeed with infinite scroll',
      'PostCard with like/comment/share',
      'CreatePostModal',
      'CommentThread',
      'UserProfile',
      'NotificationBell with dropdown',
      'FollowButton',
    ],
  },
  {
    name: 'marketplace',
    triggers: ['marketplace', 'buy and sell', 'listings', 'airbnb clone', 'fiverr clone', 'etsy clone'],
    pages: ['/', '/listings', '/listing/:id', '/sell', '/messages', '/profile'],
    tables: ['listings', 'bookings', 'messages', 'reviews', 'users'],
    features: [
      'Auth required for selling/booking',
      'Listing grid with filters (price, category, location)',
      'Listing detail with image gallery',
      'Booking/purchase flow',
      'Messaging between buyer/seller',
      'Review and rating system',
      'Seller dashboard with their listings',
      'Search with filters',
      'Map view placeholder',
      'Wishlist/saved listings',
    ],
    mustHaveComponents: [
      'ListingGrid with FilterSidebar',
      'ListingCard with SaveButton',
      'ListingDetail with ImageGallery',
      'BookingWidget',
      'MessageThread',
      'ReviewList with StarRating',
      'SellerDashboard',
    ],
  },
  {
    name: 'saas-tool',
    triggers: ['link shortener', 'qr code', 'invoice generator', 'password generator', 'color picker', 'converter', 'calculator', 'timer', 'pomodoro', 'habit tracker'],
    pages: ['/', '/app', '/history'],
    tables: ['items', 'history'],
    features: [
      'Single focused utility function',
      'Instant results (no loading for simple operations)',
      'History of recent uses',
      'Share/export result',
      'Clean minimal UI',
      'Keyboard shortcuts',
      'Copy to clipboard everywhere',
    ],
    mustHaveComponents: [
      'MainTool (core functionality)',
      'ResultDisplay with copy button',
      'HistoryList',
      'ShareButton',
      'KeyboardShortcutHint',
    ],
    visualStyle: 'Ultra minimal. White or near-black background. Single prominent tool in center. Everything else secondary.',
  },
];

const escapeRegExp = (value: string): string =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const triggerMatches = (promptLower: string, trigger: string): boolean => {
  const normalizedTrigger = String(trigger || '').trim().toLowerCase();
  if (!normalizedTrigger) return false;
  if (promptLower.includes(normalizedTrigger)) return true;
  const escaped = escapeRegExp(normalizedTrigger).replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(promptLower);
};

const APP_TYPE_PRIORITY: Record<AppTypeName, number> = {
  game: 140,
  social: 130,
  marketplace: 120,
  'mobile-app': 115,
  'ai-tool': 110,
  'saas-tool': 105,
  ecommerce: 100,
  booking: 95,
  'todo-app': 90,
  blog: 85,
  restaurant: 80,
  'saas-dashboard': 60,
};

export function getAppTypeBlueprintByName(name: string | null | undefined): AppTypeBlueprint | null {
  const normalizedName = String(name || '').trim().toLowerCase();
  if (!normalizedName) return null;
  return APP_TYPE_BLUEPRINTS.find((appType) => appType.name === normalizedName) || null;
}

export function detectAppTypeFromPrompt(prompt: string): AppTypeBlueprint | null {
  const promptLower = String(prompt || '').trim().toLowerCase();
  if (!promptLower) return null;

  let bestMatch: AppTypeBlueprint | null = null;
  let bestScore = 0;
  let bestPriority = -1;

  APP_TYPE_BLUEPRINTS.forEach((appType) => {
    let score = 0;
    let matchedTriggerLength = 0;
    appType.triggers.forEach((trigger) => {
      if (triggerMatches(promptLower, trigger)) {
        score += 1;
        matchedTriggerLength = Math.max(matchedTriggerLength, trigger.length);
      }
    });
    const priority = APP_TYPE_PRIORITY[appType.name] || 0;
    const shouldReplace =
      score > bestScore ||
      (score > 0 && score === bestScore && priority > bestPriority) ||
      (
        score > 0 &&
        score === bestScore &&
        priority === bestPriority &&
        bestMatch &&
        matchedTriggerLength >
          Math.max(
            ...bestMatch.triggers
              .filter((trigger) => triggerMatches(promptLower, trigger))
              .map((trigger) => trigger.length),
            0
          )
      );

    if (shouldReplace) {
      bestScore = score;
      bestPriority = priority;
      bestMatch = appType;
    }
  });

  return bestScore > 0 ? bestMatch : null;
}
