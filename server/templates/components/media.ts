import { buildComponentLibrary } from './shared.js';

export const MEDIA_COMPONENTS = buildComponentLibrary('media', [
  {
    name: 'ImageGalleryGrid',
    description: 'Responsive image gallery grid with optional lightbox trigger.',
    tags: ['media', 'gallery', 'images'],
  },
  {
    name: 'ImageGalleryCarousel',
    description: 'Sliding image carousel with controls and thumbnail indicators.',
    tags: ['media', 'carousel', 'images'],
  },
  {
    name: 'VideoEmbed',
    description: 'YouTube/Vimeo embed wrapper with responsive aspect ratio.',
    tags: ['media', 'video', 'embed'],
  },
  {
    name: 'VideoBackground',
    description: 'Full-screen video background section with overlay content area.',
    tags: ['media', 'video', 'background'],
  },
  {
    name: 'Avatar',
    description: 'User avatar component with fallback initials and status ring.',
    tags: ['media', 'avatar', 'profile'],
    supabaseRequired: true,
  },
  {
    name: 'AvatarGroup',
    description: 'Stacked avatar group with +N overflow indicator.',
    tags: ['media', 'avatars', 'team'],
    supabaseRequired: true,
  },
  {
    name: 'ImageWithCaption',
    description: 'Image block with caption text and optional credit line.',
    tags: ['media', 'image', 'caption'],
  },
  {
    name: 'BeforeAfter',
    description: 'Draggable before/after media comparison module.',
    tags: ['media', 'comparison', 'slider'],
  },
  {
    name: 'MapPlaceholder',
    description: 'Styled map placeholder with pin and location details.',
    tags: ['media', 'map', 'location'],
  },
  {
    name: 'IconGrid',
    description: 'Icon grid with labels for tools, integrations, or capabilities.',
    tags: ['media', 'icons', 'grid'],
  },
  {
    name: 'EmojiReactions',
    description: 'Emoji reaction buttons with counters and active states.',
    tags: ['media', 'emoji', 'reactions'],
    supabaseRequired: true,
  },
  {
    name: 'FileUploadZone',
    description: 'Drag-and-drop upload zone with preview and progress handling.',
    tags: ['media', 'upload', 'dropzone'],
    supabaseRequired: true,
  },
]);
