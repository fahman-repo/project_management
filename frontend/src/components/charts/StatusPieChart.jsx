import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { useChartTheme } from './chartTheme';

/**
 * Donut chart showing the task status distribution.
 *
 * @param {object} props
 * @param {Array<{status:string,label:string,count:number,color:string}>} props.data
 * @param {number} [props.height]
 * @param {boolean} [props.showLegend]
 */
export function StatusPieChart({ data = [], height = 280, showLegend = true }) {
  const theme = useChartTheme();

  const rows = data.filter((item) => Number(item.count) > 0);
  const total = rows.reduce((sum, item) => sum + Number(item.count || 0), 0);

  if (!rows.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-400"
        style={{ height }}
      >
        Belum ada data status
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={2}
            stroke={theme.isDark ? '#0f172a' : '#ffffff'}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {rows.map((entry) => (
              <Cell key={entry.status || entry.label} fill={entry.color || theme.text} />
            ))}
          </Pie>

          <Tooltip
            content={
              <ChartTooltip
                formatter={(value) =>
                  `${value} task (${total ? Math.round((Number(value) / total) * 100) : 0}%)`
                }
              />
            }
          />

          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: theme.tick, fontSize: 12 }}>{value}</span>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default StatusPieChart;
