import { useMemo, useState } from 'react';
import { LayoutGrid, X } from 'lucide-react';
import { GALLERY_TEMPLATES, type GalleryTemplate, type TemplateCategory } from '../data/templates';

const TEMPLATE_FILTERS: Array<'All' | TemplateCategory> = [
  'All',
  'Landing Page',
  'Dashboard',
  'E-Commerce',
  'Portfolio',
  'Blog',
  'Other',
];

interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  onUseTemplate: (template: GalleryTemplate) => void;
  loading?: boolean;
}

export default function TemplateGallery({
  open,
  onClose,
  onUseTemplate,
  loading = false,
}: TemplateGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<'All' | TemplateCategory>('All');

  const visibleTemplates = useMemo(() => {
    if (activeCategory === 'All') return GALLERY_TEMPLATES;
    return GALLERY_TEMPLATES.filter((template) => template.category === activeCategory);
  }, [activeCategory]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#07080d]/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-blue-300" />
          <p className="text-base font-semibold text-white">Template Gallery</p>
        </div>
        <button
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-slate-800 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {TEMPLATE_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveCategory(filter)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeCategory === filter
                  ? 'border-blue-400/40 bg-blue-500/15 text-blue-200'
                  : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTemplates.map((template) => (
            <div
              key={template.id}
              className="overflow-hidden rounded-2xl border border-slate-700 bg-[#121620] shadow-sm"
            >
              <div
                className={`flex h-36 items-end bg-gradient-to-br ${template.gradient} p-4`}
              >
                <p className="text-sm font-semibold text-white/90">{template.name}</p>
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-white">{template.name}</p>
                  <span className="rounded-full border border-slate-600 bg-slate-800/70 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                    {template.category}
                  </span>
                </div>
                <p className="min-h-[2.5rem] text-xs leading-relaxed text-slate-400">{template.description}</p>
                <button
                  onClick={() => onUseTemplate(template)}
                  disabled={loading}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
