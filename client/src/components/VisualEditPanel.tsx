import { useEffect, useMemo, useState } from 'react';

export interface VisualEditAnchor {
  nodeId?: string;
  tagName?: string;
  className?: string;
  id?: string;
  innerText?: string;
  selector?: string;
  domPath?: string;
  sectionId?: string;
  routePath?: string;
  href?: string;
  role?: string;
  sourceId?: string;
}

export type VisualIntentOp =
  | 'replace_text'
  | 'add_class'
  | 'remove_class'
  | 'set_prop'
  | 'remove_prop';

export interface VisualEditIntent {
  op: VisualIntentOp;
  applyToAllSelected: boolean;
  value?: string;
  classes?: string[];
  prop?: string;
  propValue?: string;
}

type VisualPanelTab = 'text' | 'style' | 'props' | 'advanced';
type ApplyScope = 'single' | 'all';

interface VisualEditPanelProps {
  selectedAnchors: VisualEditAnchor[];
  validSelectedCount?: number;
  primaryIsValid?: boolean;
  isApplying: boolean;
  onApplyIntent: (intent: VisualEditIntent) => void;
}

const splitClasses = (value: string): string[] =>
  value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const applyToText = (input: string): string =>
  input.trim();

const STYLE_PRESETS: Array<{ label: string; classes: string }> = [
  { label: 'Card', classes: 'rounded-xl border border-slate-700 bg-slate-900/70 p-6' },
  { label: 'Pill', classes: 'rounded-full px-4 py-1.5 text-sm font-medium' },
  { label: 'Hero Text', classes: 'text-4xl md:text-6xl font-bold tracking-tight' },
  { label: 'Subtle', classes: 'opacity-80 text-slate-300' },
];

export default function VisualEditPanel({
  selectedAnchors,
  validSelectedCount,
  primaryIsValid,
  isApplying,
  onApplyIntent,
}: VisualEditPanelProps) {
  const [activeTab, setActiveTab] = useState<VisualPanelTab>('style');
  const [scope, setScope] = useState<ApplyScope>('single');

  const [content, setContent] = useState('');
  const [textColorClass, setTextColorClass] = useState('');
  const [backgroundClass, setBackgroundClass] = useState('');
  const [marginClass, setMarginClass] = useState('');
  const [paddingClass, setPaddingClass] = useState('');
  const [fontSizeClass, setFontSizeClass] = useState('');
  const [fontWeightClass, setFontWeightClass] = useState('');
  const [alignClass, setAlignClass] = useState('');
  const [advancedAddClass, setAdvancedAddClass] = useState('');
  const [advancedRemoveClass, setAdvancedRemoveClass] = useState('');
  const [propName, setPropName] = useState('');
  const [propValue, setPropValue] = useState('');

  const selectedCount = selectedAnchors.length;
  const primary = selectedAnchors[0] || null;
  const normalizedValidCount = Math.max(0, Math.min(selectedCount, validSelectedCount ?? selectedCount));
  const invalidCount = Math.max(0, selectedCount - normalizedValidCount);

  useEffect(() => {
    if (selectedCount <= 1 && scope === 'all') {
      setScope('single');
    }
  }, [scope, selectedCount]);

  const selectedLabel = useMemo(() => {
    if (!primary) return 'No element selected';
    const tag = (primary.tagName || 'element').toLowerCase();
    const idPart = primary.id ? `#${primary.id}` : '';
    return `${tag}${idPart}`;
  }, [primary]);

  const applyToAllSelected = scope === 'all' && selectedCount > 1;
  const baseCanApply = !isApplying && selectedCount > 0;
  const canApplySingle = baseCanApply && primaryIsValid !== false;
  const canApplyAll = baseCanApply && normalizedValidCount > 0;
  const canApply = applyToAllSelected ? canApplyAll : canApplySingle;

  const applyIntent = (intent: Omit<VisualEditIntent, 'applyToAllSelected'>) => {
    if (!canApply) return;
    onApplyIntent({
      ...intent,
      applyToAllSelected,
    });
  };

  const applyClasses = (rawClasses: string, remove = false) => {
    const classes = splitClasses(rawClasses);
    if (classes.length === 0) return;
    applyIntent({
      op: remove ? 'remove_class' : 'add_class',
      classes,
    });
  };

  const applyText = () => {
    const next = applyToText(content);
    if (!next) return;
    applyIntent({
      op: 'replace_text',
      value: next,
    });
  };

  const applySetProp = () => {
    if (!propName.trim()) return;
    applyIntent({
      op: 'set_prop',
      prop: propName.trim(),
      propValue,
    });
  };

  const applyRemoveProp = () => {
    if (!propName.trim()) return;
    applyIntent({
      op: 'remove_prop',
      prop: propName.trim(),
    });
  };

  const resetDrafts = () => {
    setContent('');
    setTextColorClass('');
    setBackgroundClass('');
    setMarginClass('');
    setPaddingClass('');
    setFontSizeClass('');
    setFontWeightClass('');
    setAlignClass('');
    setAdvancedAddClass('');
    setAdvancedRemoveClass('');
    setPropName('');
    setPropValue('');
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-[#171922] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-200">{selectedLabel}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {selectedCount} selected, {normalizedValidCount} valid
          </p>
        </div>
        <button
          type="button"
          onClick={resetDrafts}
          className="rounded-md border border-slate-700 bg-[#0f1118] px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200"
        >
          Reset
        </button>
      </div>

      {invalidCount > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
          {invalidCount} selected element{invalidCount !== 1 ? 's are' : ' is'} missing a stable source-id and will be skipped.
        </div>
      )}

      <div className="mt-3 rounded-lg border border-slate-800 bg-[#0f1118] p-1">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setScope('single')}
            className={`rounded-md px-2 py-1.5 text-[11px] font-semibold ${
              scope === 'single'
                ? 'bg-slate-200 text-slate-900'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            Primary
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            disabled={selectedCount <= 1}
            className={`rounded-md px-2 py-1.5 text-[11px] font-semibold ${
              scope === 'all'
                ? 'bg-slate-200 text-slate-900'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            All selected
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg border border-slate-800 bg-[#0f1118] p-1">
        {([
          { key: 'style', label: 'Style' },
          { key: 'text', label: 'Text' },
          { key: 'props', label: 'Props' },
          { key: 'advanced', label: 'Adv' },
        ] as Array<{ key: VisualPanelTab; label: string }>).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-2 py-1.5 text-[11px] font-semibold ${
              activeTab === tab.key
                ? 'bg-slate-200 text-slate-900'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {activeTab === 'text' && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Replace Text</p>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="New content"
              rows={3}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={applyText}
              disabled={!canApply || applyToText(content).length === 0}
              className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply text
            </button>
          </section>
        )}

        {activeTab === 'style' && (
          <section className="space-y-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Quick Presets</p>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyClasses(preset.classes)}
                    disabled={!canApply}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Colors</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={textColorClass}
                  onChange={(event) => setTextColorClass(event.target.value)}
                  placeholder="text-*"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  value={backgroundClass}
                  onChange={(event) => setBackgroundClass(event.target.value)}
                  placeholder="bg-*"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
              <button
                type="button"
                onClick={() => applyClasses(`${textColorClass} ${backgroundClass}`)}
                disabled={!canApply || splitClasses(`${textColorClass} ${backgroundClass}`).length === 0}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply colors
              </button>
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Spacing & Type</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={marginClass}
                  onChange={(event) => setMarginClass(event.target.value)}
                  placeholder="m-*"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  value={paddingClass}
                  onChange={(event) => setPaddingClass(event.target.value)}
                  placeholder="p-*"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  value={fontSizeClass}
                  onChange={(event) => setFontSizeClass(event.target.value)}
                  placeholder="text-size"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  value={fontWeightClass}
                  onChange={(event) => setFontWeightClass(event.target.value)}
                  placeholder="font-*"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
              <input
                value={alignClass}
                onChange={(event) => setAlignClass(event.target.value)}
                placeholder="text-left | text-center | text-right"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => applyClasses(`${marginClass} ${paddingClass} ${fontSizeClass} ${fontWeightClass} ${alignClass}`)}
                disabled={!canApply || splitClasses(`${marginClass} ${paddingClass} ${fontSizeClass} ${fontWeightClass} ${alignClass}`).length === 0}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply spacing/type
              </button>
            </div>
          </section>
        )}

        {activeTab === 'props' && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Component Props</p>
            <input
              value={propName}
              onChange={(event) => setPropName(event.target.value)}
              placeholder="Prop name (e.g. href)"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              value={propValue}
              onChange={(event) => setPropValue(event.target.value)}
              placeholder="Prop value"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={applySetProp}
                disabled={!canApply || propName.trim().length === 0}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Set prop
              </button>
              <button
                type="button"
                onClick={applyRemoveProp}
                disabled={!canApply || propName.trim().length === 0}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove prop
              </button>
            </div>
          </section>
        )}

        {activeTab === 'advanced' && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Manual Classes</p>
            <input
              value={advancedAddClass}
              onChange={(event) => setAdvancedAddClass(event.target.value)}
              placeholder="Add classes"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => applyClasses(advancedAddClass)}
              disabled={!canApply || splitClasses(advancedAddClass).length === 0}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add class(es)
            </button>
            <input
              value={advancedRemoveClass}
              onChange={(event) => setAdvancedRemoveClass(event.target.value)}
              placeholder="Remove classes"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => applyClasses(advancedRemoveClass, true)}
              disabled={!canApply || splitClasses(advancedRemoveClass).length === 0}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove class(es)
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
