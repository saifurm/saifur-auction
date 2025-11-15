import type { CategoryConfig, PlayerSlot } from "../types";

const CATEGORY_ORDER: CategoryConfig["label"][] = ["A", "B", "C", "D", "E"];

export const buildPlayerQueue = (
  categories: CategoryConfig[] | undefined
): PlayerSlot[] => {
  if (!categories || !categories.length) return [];

  const sorted = [...categories].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.label) - CATEGORY_ORDER.indexOf(b.label)
  );

  return sorted.flatMap((category) =>
    category.players.map((playerName, idx) => ({
      key: `${category.id}-${idx}`,
      name: playerName,
      categoryLabel: category.label,
      basePrice: category.basePrice
    }))
  );
};
