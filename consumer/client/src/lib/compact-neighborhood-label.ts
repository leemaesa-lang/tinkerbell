export function formatCompactNeighborhoodLabel(regionNames: string[]): string {
  const uniqueNames = Array.from(new Set(regionNames.map((name) => name.trim()).filter(Boolean)));
  if (uniqueNames.length <= 1) return uniqueNames[0] ?? "동네 선택";
  return `${uniqueNames[0]} 외`;
}
