/**
 * Shared Recharts tooltip renderer.
 *
 * Uses the design-system surface classes so the tooltip follows the active
 * light/dark theme automatically.
 *
 * @param {object} props recharts tooltip props
 * @param {boolean} props.active
 * @param {Array} props.payload
 * @param {any} props.label
 * @param {(value:any, entry:object) => any} [props.formatter]
 * @param {(label:any) => any} [props.labelFormatter]
 */
export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload || !payload.length) return null;

  const heading = labelFormatter ? labelFormatter(label) : label;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-dropdown backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      {heading !== undefined && heading !== null && heading !== '' && (
        <p className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {heading}
        </p>
      )}

      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div
            key={`${entry.dataKey ?? entry.name}-${index}`}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color || entry.fill || entry.stroke }}
            />
            <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900 dark:text-white">
              {formatter ? formatter(entry.value, entry) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChartTooltip;
