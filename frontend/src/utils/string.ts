// Function to capitalize the first letter of each word in a string
export const capitalizeFirstLetter = (string: string): string => {
  if (!string) return '';
  return string
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/** Public boards and link-public pages: first name plus the second name's initial. */
export function publicDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return capitalizeFirstLetter(parts[0]);
  return capitalizeFirstLetter(`${parts[0]} ${parts[1].charAt(0)}`);
}

// Generic function to group array elements by a key
export function groupBy<T, K extends keyof any>(
  array: T[],
  keyGetter: (item: T) => K,
): Record<K, T[]> {
  return array.reduce(
    (accumulator: Record<K, T[]>, currentItem: T) => {
      const key: K = keyGetter(currentItem);
      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push(currentItem);
      return accumulator;
    },
    {} as Record<K, T[]>,
  );
}

interface Encounters {
  encounterScore: number;
}

export function sumBy<T extends Encounters, K extends keyof any>(array: T[], keyGetter: (item: T) => K,): Record<K, number> {
  return array.reduce(
    (accumulator: Record<K, number>, currentItem: T) => {
      const key: K = keyGetter(currentItem);
      if (!accumulator[key]) {
        accumulator[key] = 0;
      }
      accumulator[key] = accumulator[key] + currentItem.encounterScore;
      return accumulator;
    },
    {} as Record<K, number>,
  );
}
