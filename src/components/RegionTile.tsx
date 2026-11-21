import { memo } from 'react';
import type { Region } from '../data/regions';
import classes from './RegionTile.module.css';

interface Props {
  region: Region;
  count: number;
  onTap: (regionId: string) => void;
}

function RegionTileImpl({ region, count, onTap }: Props) {
  const found = count > 0;
  const label = found
    ? `${region.name}, seen ${count} ${count === 1 ? 'time' : 'times'}`
    : `${region.name}, not seen yet`;

  return (
    <button
      type="button"
      className={classes.tile}
      data-found={found || undefined}
      aria-label={label}
      onClick={() => onTap(region.id)}
    >
      <span className={classes.code}>{region.code}</span>
      <span className={classes.name}>{region.name}</span>
      {count > 1 ? <span className={classes.count}>{count}</span> : null}
    </button>
  );
}

export const RegionTile = memo(RegionTileImpl);
