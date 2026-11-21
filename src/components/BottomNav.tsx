import { IconChartBar, IconLayoutGrid, IconListDetails, IconRoute } from '@tabler/icons-react';
import classes from './BottomNav.module.css';

export type Tab = 'plates' | 'timeline' | 'stats' | 'trips';

const TABS = [
  { id: 'plates', label: 'Plates', Icon: IconLayoutGrid },
  { id: 'timeline', label: 'Timeline', Icon: IconListDetails },
  { id: 'stats', label: 'Stats', Icon: IconChartBar },
  { id: 'trips', label: 'Trips', Icon: IconRoute },
] as const;

interface Props {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

export function BottomNav({ tab, onChange }: Props) {
  return (
    <nav className={classes.nav} aria-label="Main">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={classes.item}
          data-active={tab === id || undefined}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={24} stroke={tab === id ? 2.4 : 1.8} aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  );
}
