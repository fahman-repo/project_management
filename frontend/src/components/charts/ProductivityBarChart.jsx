import {
  Bar,
  BarChart,
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
 * Horizontal bar chart comparing completed vs open tasks per team member.
 *
 * @param {object} props
 * @param {Array<{userId:number,name:string,total:number,completed:number,open:number}>} props.data
 * @param {number} [props.height]
 */
export function ProductivityBarChart({ data = [], height = 320 }) {
  const theme = useChartTheme();

  const rows = data.map((item) => ({
    ...item,
    name: item.name || 'Tanpa nama',
    completed: Number(item.completed || 0),
    open: Number(item.open || 0),
  }));

  if (!rows.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-400"
        style={{ height }}
      >
        Belum ada data produktivitas
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid
            stroke={theme.grid}
            strokeDasharray="3 3"
            horizontal={false}
          />

          <XAxis
            type="number"
            stroke={theme.axis}
            tick={{ fill: theme.tick, fontSize: 11 }}
            tickLine={false}
            allowDecimals={false}
          />

          <YAxis
            type="category"
            dataKey="name"
            stroke={theme.axis}
            tick={{ fill: theme.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={110}
          />

          <Tooltip
            cursor={{ fill: theme.isDark ? 'rgba(148,163,184,0.08)' : 'rgba(79,70,229,0.05)' }}
            content={<ChartTooltip />}
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

          <Bar
            dataKey="completed"
            name="Selesai"
            stackId="tasks"
            fill={SERIES_COLORS.emerald}
            radius={[0, 0, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="open"
            name="Belum Selesai"
            stackId="tasks"
            fill={SERIES_COLORS.sky}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ProductivityBarChart;
