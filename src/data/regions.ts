export type Country = 'US' | 'CA' | 'MX';

export interface Region {
  /** Stable id, e.g. `US-CO`. Stored on sightings, so never change these. */
  id: string;
  /** Short code shown on the tile, e.g. `CO`. */
  code: string;
  name: string;
  country: Country;
}

export const COUNTRIES: readonly { id: Country; label: string }[] = [
  { id: 'US', label: 'US' },
  { id: 'CA', label: 'Canada' },
  { id: 'MX', label: 'Mexico' },
];

type Entry = readonly [code: string, name: string];

// 50 states + DC.
const US: readonly Entry[] = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

// 10 provinces + 3 territories.
const CA: readonly Entry[] = [
  ['AB', 'Alberta'],
  ['BC', 'British Columbia'],
  ['MB', 'Manitoba'],
  ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'],
  ['NT', 'Northwest Territories'],
  ['NS', 'Nova Scotia'],
  ['NU', 'Nunavut'],
  ['ON', 'Ontario'],
  ['PE', 'Prince Edward Island'],
  ['QC', 'Québec'],
  ['SK', 'Saskatchewan'],
  ['YT', 'Yukon'],
];

// 31 states + Mexico City, using ISO 3166-2:MX codes.
const MX: readonly Entry[] = [
  ['AGU', 'Aguascalientes'],
  ['BCN', 'Baja California'],
  ['BCS', 'Baja California Sur'],
  ['CAM', 'Campeche'],
  ['CHP', 'Chiapas'],
  ['CHH', 'Chihuahua'],
  ['CMX', 'Ciudad de México'],
  ['COA', 'Coahuila'],
  ['COL', 'Colima'],
  ['DUR', 'Durango'],
  ['GUA', 'Guanajuato'],
  ['GRO', 'Guerrero'],
  ['HID', 'Hidalgo'],
  ['JAL', 'Jalisco'],
  ['MEX', 'Estado de México'],
  ['MIC', 'Michoacán'],
  ['MOR', 'Morelos'],
  ['NAY', 'Nayarit'],
  ['NLE', 'Nuevo León'],
  ['OAX', 'Oaxaca'],
  ['PUE', 'Puebla'],
  ['QUE', 'Querétaro'],
  ['ROO', 'Quintana Roo'],
  ['SLP', 'San Luis Potosí'],
  ['SIN', 'Sinaloa'],
  ['SON', 'Sonora'],
  ['TAB', 'Tabasco'],
  ['TAM', 'Tamaulipas'],
  ['TLA', 'Tlaxcala'],
  ['VER', 'Veracruz'],
  ['YUC', 'Yucatán'],
  ['ZAC', 'Zacatecas'],
];

function build(country: Country, entries: readonly Entry[]): Region[] {
  return entries.map(([code, name]) => ({
    id: `${country}-${code}`,
    code,
    name,
    country,
  }));
}

export const REGIONS: readonly Region[] = [
  ...build('US', US),
  ...build('CA', CA),
  ...build('MX', MX),
];

const BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

export function getRegion(id: string): Region | undefined {
  return BY_ID.get(id);
}

export function regionsFor(country: Country): Region[] {
  return REGIONS.filter((r) => r.country === country);
}

/** Lowercase and strip accents so "queretaro" finds "Querétaro". */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function searchRegions(query: string): Region[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  return REGIONS.filter(
    (r) => normalizeForSearch(r.name).includes(q) || normalizeForSearch(r.code).startsWith(q),
  );
}
