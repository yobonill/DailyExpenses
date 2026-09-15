export type FilterSelection = string[] | null;

/** null means unrestricted; an empty selection deliberately shows no results. */
export function toggleFilterSelection(current: FilterSelection, value: string, values: string[]): FilterSelection {
  if (current === null) return [value];
  const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  return values.every(item => next.includes(item)) ? null : next;
}
