import type { ContextItem } from '../../../shared/types';

export function rankItems(items: ContextItem[], budget: number): ContextItem[] {
  let remaining = budget;
  const selected: ContextItem[] = [];
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    if (item.tokenEstimate <= remaining) {
      selected.push(item);
      remaining -= item.tokenEstimate;
    }
  }
  return selected;
}
