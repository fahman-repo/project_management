import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
 * Area chart of created vs completed tasks over time.
 *
 * @param {object} props
 * @param {Array<{date:string,completed:number,created:number}>} props.data
 * @param {number} [props.height]
 */
export function TrendAreaChart({ data = [], height = 300 }) {
  const theme = useChartTheme();

  const rows = data.map((item) => ({
    ...item,
    label: formatTick(item.date),
    completed: Number(item.completed || 0),
    created: Number(item.created || 0),
  }));

  if (!rows.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-400"
        style={{ height }}
      >
        Belum ada data tren
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="trend-completed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS.emerald} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES_COLORS.emerald} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="trend-created" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS.sky} stopOpacity={0.3} />
              <stop offset="100%" stopColor={SERIES_COLORS.sky} stopOpacity={0.02} />
            </linearGradient>
          </defs>

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

          <Area
            type="monotone"
            dataKey="created"
            name="Task Dibuat"
            stroke={SERIES_COLORS.sky}
            strokeWidth={2}
            fill="url(#trend-created)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="completed"
            name="Task Selesai"
            stroke={SERIES_COLORS.emerald}
            strokeWidth={2}
            fill="url(#trend-completed)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TrendAreaChart;
