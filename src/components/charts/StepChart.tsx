import { Stack, Text } from '@mantine/core';
import { useState, type PointerEvent } from 'react';
import classes from './Chart.module.css';
import { ChartTable } from './ChartTable';

export interface StepPoint {
  /** Position along the x axis (epoch milliseconds). */
  x: number;
  y: number;
  /** Shown in the readout and the table when this point is selected. */
  label: string;
}

interface Props {
  points: readonly StepPoint[];
  ariaLabel: string;
  /** Text for the two end labels on the x axis. */
  startLabel: string;
  endLabel: string;
  /** "3 found" style text for a point's y value. */
  formatValue: (y: number) => string;
  columns: [string, string];
}

const W = 340;
const H = 170;
const LEFT = 26;
const RIGHT = 10;
const TOP = 10;
const BOTTOM = 24;
const MAX_DOTS = 24;

/** A cumulative count over time, drawn as a step line (it only ever goes up). */
export function StepChart({
  points,
  ariaLabel,
  startLabel,
  endLabel,
  formatValue,
  columns,
}: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const last = points.length - 1;
  const active = picked ?? last;

  const minX = points[0]?.x ?? 0;
  const maxX = points[last]?.x ?? 0;
  const maxY = Math.max(1, ...points.map((p) => p.y));
  const innerW = W - LEFT - RIGHT;
  const innerH = H - TOP - BOTTOM;

  const sx = (x: number) =>
    maxX === minX ? LEFT + innerW / 2 : LEFT + ((x - minX) / (maxX - minX)) * innerW;
  const sy = (y: number) => TOP + innerH - (y / maxY) * innerH;

  let path = '';
  points.forEach((p, i) => {
    path += i === 0 ? `M${sx(p.x)},${sy(p.y)}` : ` H${sx(p.x)} V${sy(p.y)}`;
  });

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(sx(p.x) - x) < Math.abs(sx(points[nearest]!.x) - x)) nearest = i;
    });
    setPicked(nearest);
  };

  const shown = points[active];
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
        <text className={classes.axisLabel} x={LEFT} y={H - 6} textAnchor="start">
          {startLabel}
        </text>
        <text className={classes.axisLabel} x={W - RIGHT} y={H - 6} textAnchor="end">
          {endLabel}
        </text>

        <path className={classes.line} d={path} />
        {shown ? (
          <line
            className={classes.cursor}
            x1={sx(shown.x)}
            x2={sx(shown.x)}
            y1={TOP}
            y2={TOP + innerH}
          />
        ) : null}
        {points.length <= MAX_DOTS
          ? points.map((p, i) => (
              <circle key={i} className={classes.dot} cx={sx(p.x)} cy={sy(p.y)} r={4} />
            ))
          : null}
        {shown ? <circle className={classes.dot} cx={sx(shown.x)} cy={sy(shown.y)} r={5} /> : null}
      </svg>

      {shown ? (
        <Text size="sm" aria-live="polite">
          <b>{formatValue(shown.y)}</b> · {shown.label}
        </Text>
      ) : null}

      <ChartTable
        caption={ariaLabel}
        columns={columns}
        rows={points.map((p) => ({ label: p.label, value: formatValue(p.y) }))}
      />
    </Stack>
  );
}
