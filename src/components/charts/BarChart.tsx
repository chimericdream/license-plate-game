import { Stack, Text } from '@mantine/core';
import { useState, type PointerEvent } from 'react';
import classes from './Chart.module.css';
import { ChartTable } from './ChartTable';

export interface Bar {
  key: string;
  value: number;
  /** Short text under the bar (e.g. "Nov 21"). */
  axisLabel: string;
  /** Full text for the readout and the table. */
  label: string;
}

interface Props {
  bars: readonly Bar[];
  ariaLabel: string;
  formatValue: (value: number) => string;
  columns: [string, string];
}

const W = 340;
const H = 170;
const LEFT = 26;
const RIGHT = 10;
const TOP = 10;
const BOTTOM = 24;
const MAX_BAR_WIDTH = 32;

/** Bar with only its data end (the top) rounded, anchored on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return (
    `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} ` +
    `Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
  );
}

export function BarChart({ bars, ariaLabel, formatValue, columns }: Props) {
  const [picked, setPicked] = useState<number | null>(null);

  const maxY = Math.max(1, ...bars.map((b) => b.value));
  const innerW = W - LEFT - RIGHT;
  const innerH = H - TOP - BOTTOM;
  const band = innerW / Math.max(1, bars.length);
  const barWidth = Math.min(MAX_BAR_WIDTH, band * 0.7);
  const sy = (value: number) => TOP + innerH - (value / maxY) * innerH;
  const showEveryLabel = bars.length <= 8;

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W - LEFT;
    setPicked(Math.min(bars.length - 1, Math.max(0, Math.floor(x / band))));
  };

  const shown = picked === null ? undefined : bars[picked];
  const gridValues = maxY >= 4 ? [0, Math.round(maxY / 2), maxY] : [0, maxY];

  return (
    <Stack gap="xs">
      <svg
        className={classes.svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setPicked(null);
        }}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line className={classes.grid} x1={LEFT} x2={W - RIGHT} y1={sy(value)} y2={sy(value)} />
            <text className={classes.axisLabel} x={LEFT - 6} y={sy(value) + 3} textAnchor="end">
              {value}
            </text>
          </g>
        ))}

        {bars.map((bar, i) => {
          const cx = LEFT + band * i + band / 2;
          const height = (bar.value / maxY) * innerH;
          const labelled = showEveryLabel || i === 0 || i === bars.length - 1;
          return (
            <g key={bar.key}>
              <path
                className={classes.bar}
                data-dim={picked !== null && picked !== i ? true : undefined}
                d={barPath(cx - barWidth / 2, sy(bar.value), barWidth, height)}
              />
              {labelled ? (
                <text
                  className={classes.axisLabel}
                  x={cx}
                  y={H - 6}
                  textAnchor={showEveryLabel ? 'middle' : i === 0 ? 'start' : 'end'}
                >
                  {bar.axisLabel}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <Text size="sm" aria-live="polite" c={shown ? undefined : 'dimmed'}>
        {shown ? (
          <>
            <b>{formatValue(shown.value)}</b> · {shown.label}
          </>
        ) : (
          'Tap a bar to see its day.'
        )}
      </Text>

      <ChartTable
        caption={ariaLabel}
        columns={columns}
        rows={bars.map((b) => ({ label: b.label, value: formatValue(b.value) }))}
      />
    </Stack>
  );
}
