import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { SERIES_COLORS, useChartTheme } from './chartTheme';

/**
 * Format a chart date label, tolerating both `YYYY-MM-DD` strings and
 * ISO date-times.
 *
 * @param {any} value
 * @returns {string}
 */
function formatTick(value) {
  if (!value) return '';
  const raw = String(value);
  const [datePart] = raw.split('T');
  const parts = datePart.split('-');
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Burndown line chart comparing remaining work against the ideal line.
 *
 * @param {object} props
 * @param {Array<{date:string,remaining:number,ideal:number,scope:number}>} props.data
 * @param {number} [props.height]
 */
export function BurndownChart({ data = [], height = 300 }) {
  const theme = useChartTheme();

  const points = Array.isArray(data)
    ? data
    : Array.isArray(data?.series)
      ? data.series
      : [];

  const rows = points.map((item) => ({
    ...item,
    label: formatTick(item.date),
    remaining: Number(item.remaining || 0),
    ideal: Number(item.ideal || 0),
    scope: Number(item.scope || 0),
  }));

  if (!rows.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-400"
        style={{ height }}
      >
        Belum ada data burndown
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="label"
            stroke={theme.axis}
            tick={{ fill: theme.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            minTickGap={24}
          />

          <YAxis
            stroke={theme.axis}
            tick={{ fill: theme.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, 'auto']}
          />

          <Tooltip
            content={
              <ChartTooltip
                labelFormatter={(value) => {
                  const raw = String(value);
                  const [datePart] = raw.split('T');
                  return `Tanggal ${datePart}`;
                }}
              />
            }
            cursor={{ stroke: theme.axis, strokeDasharray: '4 4' }}
          />

          <Legend
            verticalAlign="top"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span style={{ color: theme.tick, fontSize: 12 }}>{value}</span>
            )}
          />

          <Line
            type="monotone"
            dataKey="remaining"
            name="Sisa Task"
            stroke={SERIES_COLORS.brand}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="ideal"
            name="Garis Ideal"
            stroke={SERIES_COLORS.slate}
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine
            y={0}
            stroke={theme.axis}
            strokeDasharray="3 3"
            ifOverflow="extendDomain"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BurndownChart;
