import type { VisualPatchOperation } from './api';
import type { VisualEditIntent } from '../components/VisualEditPanel';

export interface VisualOperationAnchor {
  sourceId?: string;
}

interface BuildVisualOperationsInput<TAnchor extends VisualOperationAnchor> {
  intent: VisualEditIntent;
  selectedEditAnchor: TAnchor | null;
  selectedEditAnchors: TAnchor[];
  isReliableVisualAnchor: (anchor: TAnchor) => boolean;
  selectorForAnchor: (anchor: TAnchor) => string | null;
  resolveSourceFileFromSourceId: (sourceId?: string) => string | null;
}

export const buildVisualOperationsFromIntent = <TAnchor extends VisualOperationAnchor>(
  input: BuildVisualOperationsInput<TAnchor>
): VisualPatchOperation[] => {
  const anchors = input.intent.applyToAllSelected
    ? input.selectedEditAnchors
    : (input.selectedEditAnchor ? [input.selectedEditAnchor] : []);
  if (anchors.length === 0) return [];

  return anchors.reduce<VisualPatchOperation[]>((acc, anchor) => {
    if (!input.isReliableVisualAnchor(anchor)) return acc;
    const selector = input.selectorForAnchor(anchor);
    if (!selector) return acc;
    const sourceId = (anchor.sourceId || '').trim();
    if (!sourceId) return acc;
    const file = input.resolveSourceFileFromSourceId(anchor.sourceId);
    if (!file) return acc;

    if (input.intent.op === 'replace_text') {
      acc.push({
        op: 'replace_text',
        file,
        selector,
        sourceId,
        text: input.intent.value || '',
      });
      return acc;
    }

    if (input.intent.op === 'add_class' || input.intent.op === 'remove_class') {
      const classes = (input.intent.classes || []).map((entry) => entry.trim()).filter(Boolean);
      if (classes.length === 0) return acc;
      acc.push({
        op: input.intent.op,
        file,
        selector,
        sourceId,
        classes,
      });
      return acc;
    }

    if (input.intent.op === 'set_prop') {
      if (!input.intent.prop) return acc;
      const rawPropValue = input.intent.propValue || '';
      const normalizedPropValue =
        rawPropValue.startsWith('{') ||
        rawPropValue.startsWith('"') ||
        rawPropValue.startsWith('\'')
          ? rawPropValue
          : JSON.stringify(rawPropValue);
      acc.push({
        op: 'set_prop',
        file,
        selector,
        sourceId,
        prop: input.intent.prop,
        value: normalizedPropValue,
      });
      return acc;
    }

    if (!input.intent.prop) return acc;
    acc.push({
      op: 'remove_prop',
      file,
      selector,
      sourceId,
      prop: input.intent.prop,
    });
    return acc;
  }, []);
};
