import { describe, expect, it } from 'vitest';
import { REGIONS, regionsFor, searchRegions } from './regions';

describe('regions', () => {
  it('has the expected number per country', () => {
    expect(regionsFor('US')).toHaveLength(51);
    expect(regionsFor('CA')).toHaveLength(13);
    expect(regionsFor('MX')).toHaveLength(32);
    expect(REGIONS).toHaveLength(96);
  });

  it('has unique ids', () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
  });

  it('searches by name without caring about accents or case', () => {
    expect(searchRegions('queretaro').map((r) => r.id)).toEqual(['MX-QUE']);
    expect(searchRegions('QUÉBEC').map((r) => r.id)).toEqual(['CA-QC']);
  });

  it('matches codes by prefix and returns nothing for an empty query', () => {
    expect(searchRegions('co').map((r) => r.id)).toContain('US-CO');
    expect(searchRegions('  ')).toEqual([]);
  });
});
