// Ranks city/country rows for a typed query, ignoring case and accents ("sao paulo" finds São Paulo).
export type LocationRow = { id: string; city: string; country: string; countryCode: string };

export const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export const locationLabel = (row: Pick<LocationRow, "city" | "country">) => `${row.city}, ${row.country}`;

function score(row: LocationRow, query: string): number {
  const city = plain(row.city), country = plain(row.country);
  if (city === query) return 100;
  const squashed = city.replace(/ /g, ""), flat = query.replace(/ /g, ""); // "danang" finds Da Nang
  if (squashed === flat) return 98;
  if (flat.length > 2 && squashed.startsWith(flat)) return 85;
  if (city.startsWith(query)) return 90;
  if (country === query || row.countryCode.toLowerCase() === query) return 80;
  if (country.startsWith(query)) return 70;
  if (city.split(" ").some((word) => word.startsWith(query))) return 60;
  const full = plain(locationLabel(row));
  if (full.startsWith(query)) return 55; // "paris, fr..." style
  if (city.includes(query)) return 40;
  return 0;
}

export function rankLocations(rows: LocationRow[], rawQuery: string, limit: number): LocationRow[] {
  const query = plain(rawQuery);
  if (!query) return [];
  return rows
    .map((row) => ({ row, points: score(row, query) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.row.city.length - b.row.city.length || a.row.city.localeCompare(b.row.city))
    .slice(0, limit)
    .map((entry) => entry.row);
}
