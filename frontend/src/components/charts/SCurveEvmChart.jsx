import { useMemo, useState } from 'react';
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
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Percent,
} from 'lucide-react';
import { ChartTooltip } from './ChartTooltip';
import { useChartTheme } from './chartTheme';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { cn } from '../../utils/cn';

function formatTick(value) {
  if (!value) return '';
  const raw = String(value);
  const [datePart] = raw.split('T');
  const parts = datePart.split('-');
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}`;
}

export function SCurveEvmChart({ data, height = 340 }) {
  const theme = useChartTheme();
  const [mode, setMode] = useState('cost'); // 'cost' | 'percent'

  const summary = data?.summary || {};
  const series = data?.series || [];
  const isCurrency = summary.unit !== 'weight';

  const rows = useMemo(() => {
    return series.map((item) => {
      const isPercent = mode === 'percent';
      return {
        date: item.date,
        label: formatTick(item.date),
        pv: isPercent ? item.pvPercent : item.pv,
        ev: isPercent ? item.evPercent : item.ev,
        ac: isPercent ? item.acPercent : item.ac,
        rawPv: item.pv,
        rawEv: item.ev,
        rawAc: item.ac,
        rawPvPercent: item.pvPercent,
        rawEvPercent: item.evPercent,
        rawAcPercent: item.acPercent,
      };
    });
  }, [series, mode]);

  const statusTick = useMemo(() => {
    if (!summary.statusDate) return '';
    return formatTick(summary.statusDate);
  }, [summary.statusDate]);

  if (!series.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-400"
        style={{ height }}
      >
        Belum ada data jadwal atau estimasi biaya untuk membentuk Kurva-S
      </div>
    );
  }

  const cpi = summary.cpi;
  const spi = summary.spi;
  const isCpiGood = cpi !== null && cpi >= 1;
  const isSpiGood = spi !== null && spi >= 1;

  return (
    <div className="space-y-4">
      {/* EVM KPI Tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              BAC (Baseline RAB)
            </span>
            <Wallet className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <p className="mt-1 text-sm font-bold tabular-nums text-slate-900 dark:text-white">
            {isCurrency ? formatCurrency(summary.bac || 0) : `${formatNumber(summary.bac || 0)} pt`}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Total Anggaran Rencana</span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              PV (Planned Value)
            </span>
            <Calendar className="h-3.5 w-3.5 text-indigo-500" />
          </div>
          <p className="mt-1 text-sm font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {isCurrency ? formatCurrency(summary.pv || 0) : `${formatNumber(summary.pv || 0)} pt`}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {summary.plannedProgress}% target s/d saat ini
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              EV (Earned Value)
            </span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <p className="mt-1 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {isCurrency ? formatCurrency(summary.ev || 0) : `${formatNumber(summary.ev || 0)} pt`}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {summary.earnedProgress}% progres tercapai
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              AC (Actual Cost)
            </span>
            <Wallet className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="mt-1 text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {isCurrency ? formatCurrency(summary.ac || 0) : `${formatNumber(summary.ac || 0)} pt`}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {summary.actualCostRate}% serapan biaya
          </span>
        </div>

        {/* CPI */}
        <div className={cn(
          "rounded-lg border p-2.5 transition-colors",
          isCpiGood
            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
            : cpi !== null
              ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20"
              : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              CPI (Cost Index)
            </span>
            {isCpiGood ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
            )}
          </div>
          <p className={cn(
            "mt-1 text-sm font-bold tabular-nums",
            isCpiGood
              ? "text-emerald-700 dark:text-emerald-300"
              : cpi !== null
                ? "text-rose-700 dark:text-rose-300"
                : "text-slate-700 dark:text-slate-300"
          )}>
            {cpi !== null ? Number(cpi).toFixed(2) : '-'}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {cpi === null ? 'Belum ada biaya' : isCpiGood ? 'Efisien (Under Budget)' : 'Over Budget (Boros)'}
          </span>
        </div>

        {/* SPI */}
        <div className={cn(
          "rounded-lg border p-2.5 transition-colors",
          isSpiGood
            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
            : spi !== null
              ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
              : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              SPI (Schedule Index)
            </span>
            {isSpiGood ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            )}
          </div>
          <p className={cn(
            "mt-1 text-sm font-bold tabular-nums",
            isSpiGood
              ? "text-emerald-700 dark:text-emerald-300"
              : spi !== null
                ? "text-amber-700 dark:text-amber-300"
                : "text-slate-700 dark:text-slate-300"
          )}>
            {spi !== null ? Number(spi).toFixed(2) : '-'}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {spi === null ? '-' : isSpiGood ? 'Tepat / Cepat' : 'Terlambat (Behind)'}
          </span>
        </div>
      </div>

      {/* Chart Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span>Prakiraan Selesai (EAC):</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
            {isCurrency ? formatCurrency(summary.eac || 0) : `${formatNumber(summary.eac || 0)} pt`}
          </span>
          <span className="text-slate-400">|</span>
          <span>Cost Variance (CV):</span>
          <span className={cn(
            "font-semibold tabular-nums",
            summary.cv >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          )}>
            {isCurrency ? formatCurrency(summary.cv || 0) : `${summary.cv > 0 ? '+' : ''}${formatNumber(summary.cv || 0)} pt`}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode('cost')}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              mode === 'cost'
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            )}
          >
            Nilai Biaya (Rp)
          </button>
          <button
            type="button"
            onClick={() => setMode('percent')}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              mode === 'percent'
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            )}
          >
            Bobot Progres (%)
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 16, left: 10, bottom: 4 }}>
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
              tickFormatter={(val) => {
                if (mode === 'percent') return `${val}%`;
                if (val >= 1000000000) return `${(val / 1000000000).toFixed(1)}M`;
                if (val >= 1000000) return `${(val / 1000000).toFixed(0)}jt`;
                if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`;
                return val;
              }}
              domain={mode === 'percent' ? [0, 'auto'] : [0, 'auto']}
            />

            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={(val) => {
                    const match = rows.find((r) => r.label === val);
                    return match ? `Tanggal: ${match.date}` : String(val);
                  }}
                  formatter={(val, entry) => {
                    if (val === null || val === undefined) return '-';
                    if (mode === 'percent') {
                      return `${val}%`;
                    }
                    return isCurrency ? formatCurrency(val) : `${formatNumber(val)} pt`;
                  }}
                />
              }
              cursor={{ stroke: theme.axis, strokeDasharray: '4 4' }}
            />

            <Legend
              verticalAlign="top"
              height={32}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: theme.tick, fontSize: 12, fontWeight: 500 }}>
                  {value}
                </span>
              )}
            />

            {/* PV Curve */}
            <Line
              type="monotone"
              dataKey="pv"
              name="PV (Planned Value / Rencana)"
              stroke="#4f46e5"
              strokeWidth={2.2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />

            {/* EV Curve */}
            <Line
              type="monotone"
              dataKey="ev"
              name="EV (Earned Value / Realisasi Bobot)"
              stroke="#10b981"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* AC Curve */}
            <Line
              type="monotone"
              dataKey="ac"
              name="AC (Actual Cost / Realisasi Biaya)"
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />

            {statusTick && (
              <ReferenceLine
                x={statusTick}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{
                  value: 'Hari Ini',
                  fill: '#ef4444',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default SCurveEvmChart;

