import classes from './Chart.module.css';

interface Props {
  caption: string;
  columns: [string, string];
  rows: { label: string; value: string | number }[];
}

/** The same data as the chart, for screen readers and anyone who prefers numbers. */
export function ChartTable({ caption, columns, rows }: Props) {
  return (
    <details>
      <summary className={classes.summary}>Show as table</summary>
      <table className={classes.table}>
        <caption className="mantine-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{columns[0]}</th>
            <th scope="col">{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
