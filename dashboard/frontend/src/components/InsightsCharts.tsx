import { useState } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Label,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import type {
  InsightsAggregateResponse,
  InsightsAggregateSummary,
  InsightsAggregateTokenEntry,
  InsightsAggregateCostEntry,
  InsightsRequestTimeline,
  InsightsTokenTimeline,
} from '../pages/insightsPageTypes'
import styles from './InsightsCharts.module.css'

interface InsightsChartsProps {
  aggregate: InsightsAggregateResponse
  autoRefresh?: boolean
  onAutoRefreshChange?: (value: boolean) => void
  onRefresh?: () => void
}

const COLORS = ['#76b900', '#8fd400', '#6ba300', '#5a8f00', '#718096', '#5a6c7d', '#606c7a', '#556b7d']
const GREEN_PALETTE = ['#76b900', '#4a8000', '#2d5200', '#9fd400', '#b8e04a', '#c8e87a', '#3d6e00', '#638f00']

interface PieLabelProps {
  cx: number
  cy: number
  midAngle: number
  outerRadius: number
  percent: number
  name: string
}

const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: PieLabelProps) => {
  const radian = Math.PI / 180
  const radius = outerRadius + 25
  const x = cx + radius * Math.cos(-midAngle * radian)
  const y = cy + radius * Math.sin(-midAngle * radian)

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      style={{ fontSize: '11px', fontWeight: 500 }}
    >
      {`${name}: ${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

const renderDonutLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: PieLabelProps) => {
  if (percent < 0.03) return null
  const radian = Math.PI / 180
  const radius = outerRadius + 30
  const x = cx + radius * Math.cos(-midAngle * radian)
  const y = cy + radius * Math.sin(-midAngle * radian)
  const anchor = x > cx ? 'start' : 'end'
  const shortName = name.includes('/') ? name.split('/').pop()! : name
  const label = shortName.length > 16 ? `${shortName.slice(0, 15)}…` : shortName

  return (
    <text fill="white" textAnchor={anchor} style={{ fontSize: '11px' }}>
      <tspan x={x} y={y} dy="-0.55em" fontWeight={600}>{label}</tspan>
      <tspan x={x} dy="1.2em" fill="rgba(255,255,255,0.6)">{`${(percent * 100).toFixed(1)}%`}</tspan>
    </text>
  )
}

const generateBarColors = (count: number): string[] => {
  const colors: string[] = []
  for (let i = 0; i < count; i += 1) {
    const ratio = i / Math.max(count - 1, 1)
    const r = Math.round(118 + (156 - 118) * ratio)
    const g = Math.round(185 + (163 - 185) * ratio)
    const b = Math.round(0 + (175 - 0) * ratio)
    colors.push(`rgb(${r}, ${g}, ${b})`)
  }
  return colors
}

const formatCurrency = (value: number, currency?: string) => {
  if (!currency) {
    return 'N/A'
  }

  try {
    const minimumFractionDigits = Math.abs(value) >= 0.01 ? 2 : 4
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits: 4,
    }).format(value)
  } catch {
    return `${value.toFixed(4)} ${currency}`
  }
}

const formatTokenCount = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)

const formatCompactTokenCount = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)

const formatPercent = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A'
  }

  return `${(value * 100).toFixed(1)}%`
}

const formatAxisLabel = (value: string) => (value.length > 20 ? `${value.slice(0, 17)}...` : value)

interface TokenBreakdownChartProps {
  title: string
  data: InsightsAggregateTokenEntry[]
}

function TokenBreakdownChart({ title, data }: TokenBreakdownChartProps) {
  return (
    <div className={styles.chartSection}>
      <h3 className={styles.chartTitle}>
        <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19h16" />
          <path d="M7 16V8" />
          <path d="M12 16V5" />
          <path d="M17 16v-6" />
        </svg>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis
            dataKey="name"
            angle={-30}
            textAnchor="end"
            height={90}
            interval={0}
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            tickFormatter={formatAxisLabel}
          />
          <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} tickFormatter={formatCompactTokenCount} />
          <Tooltip
            cursor={false}
            formatter={(value: number | string, name: string) => [formatTokenCount(Number(value)), name]}
            labelFormatter={(label) => String(label)}
            contentStyle={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              color: 'var(--color-text-primary)',
            }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
          />
          <Legend verticalAlign="top" height={30} />
          <Bar dataKey="input_tokens" name="Input Tokens" fill="#76b900" radius={[6, 6, 0, 0]} />
          <Bar dataKey="output_tokens" name="Output Tokens" fill="#00d4ff" radius={[6, 6, 0, 0]} />
          <Bar dataKey="total_tokens" name="Total Tokens" fill="#f59e0b" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}


function TokenDistributionPie({ data }: { data: InsightsAggregateTokenEntry[] }) {
  const [tokenType, setTokenType] = useState<'input' | 'output'>('input')
  const pieData = data.map((entry) => ({
    name: entry.name,
    value: tokenType === 'input' ? entry.input_tokens : entry.output_tokens,
  }))
  const total = pieData.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className={styles.chartSection}>
      <div className={styles.chartTitleRow}>
        <h3 className={styles.chartTitle}>
          <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2 L12 12 L20 12" />
          </svg>
          Token Distribution by Model
        </h3>
        <div className={styles.toggleGroup}>
          <button
            type="button"
            className={`${styles.toggleButton} ${tokenType === 'input' ? styles.toggleButtonActive : ''}`}
            onClick={() => setTokenType('input')}
          >
            Input
          </button>
          <button
            type="button"
            className={`${styles.toggleButton} ${tokenType === 'output' ? styles.toggleButtonActive : ''}`}
            onClick={() => setTokenType('output')}
          >
            Output
          </button>
        </div>
      </div>
      <div className={styles.pieRow}>
        <ResponsiveContainer width="50%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={100}
              dataKey="value"
              stroke="rgba(6,10,9,0.9)"
              strokeWidth={3}
              label={renderDonutLabel}
              labelLine={{ stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }}
            >
              {pieData.map((_entry, index) => (
                <Cell key={`token-dist-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
              <Label
                value={formatCompactTokenCount(total)}
                position="center"
                fill="var(--color-text)"
                style={{ fontSize: '1.3rem', fontWeight: 700 }}
              />
            </Pie>
            <Tooltip
              formatter={(value: number | string) => [formatTokenCount(Number(value)), tokenType === 'input' ? 'Input Tokens' : 'Output Tokens']}
              contentStyle={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                color: 'var(--color-text-primary)',
              }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.pieLegend}>
          {pieData.map((entry, index) => {
            const color = COLORS[index % COLORS.length]
            return (
              <div key={entry.name} className={styles.pieLegendItem} style={{ borderLeftColor: color }}>
                <span className={styles.pieLegendValue} style={{ color }}>
                  {formatCompactTokenCount(entry.value)} tok
                </span>
                <span className={styles.pieLegendName}>{entry.name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CostByModelChart({ data, currency }: { data: InsightsAggregateCostEntry[]; currency?: string }) {
  const chartHeight = Math.max(300, data.length * 56 + 40)
  const barSize = Math.max(8, Math.min(22, Math.round(44 / data.length)))
  return (
    <div className={styles.chartSection}>
      <h3 className={styles.chartTitle}>
        <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        Cost by Model
        <span className={styles.infoIcon} aria-label="Baseline cost info">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
            <circle cx="8" cy="8" r="7" />
            <line x1="8" y1="7" x2="8" y2="11" />
            <circle cx="8" cy="4.5" r="0.5" fill="currentColor" stroke="none" />
          </svg>
          <span className={styles.infoTooltip}>
            <strong>Baseline</strong> is what each request would have cost if routed to the most expensive configured model, using the actual token counts. <strong>Actual</strong> is what was charged at the selected model's rates. The difference is the saving from routing.
          </span>
        </span>
      </h3>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            tickFormatter={(v: number) => formatCurrency(v, currency)}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            tickFormatter={formatAxisLabel}
          />
          <Tooltip
            cursor={false}
            formatter={(value: number | string, name: string) => [formatCurrency(Number(value), currency), name]}
            contentStyle={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              color: 'var(--color-text-primary)',
            }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
          />
          <Legend verticalAlign="bottom" align="right" height={28} />
          <Bar dataKey="actual_cost" name="Actual" fill="#76b900" radius={[0, 4, 4, 0]} barSize={barSize} />
          <Bar dataKey="baseline_cost" name="Baseline" fill="#4d6e00" radius={[0, 4, 4, 0]} barSize={barSize} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function formatTimelineLabel(timestamp: string, interval: string): string {
  const d = new Date(timestamp)
  if (interval === '1d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function RequestTimelineChart({ timeline }: { timeline: InsightsRequestTimeline }) {
  const { models, points, bucket_interval } = timeline
  const chartData = points.map((pt) => ({
    timestamp: formatTimelineLabel(pt.timestamp, bucket_interval),
    ...Object.fromEntries(models.map((m) => [m, pt.counts[m] ?? 0])),
  }))

  return (
    <div className={styles.chartSection}>
      <h3 className={styles.chartTitle}>
        <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="18" />
          <rect x="14" y="8" width="7" height="13" />
        </svg>
        Routed Requests over Time
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            angle={-30}
            textAnchor="end"
            height={70}
            interval="preserveStartEnd"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
          />
          <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
          <Tooltip
            cursor={false}
            contentStyle={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              color: 'var(--color-text-primary)',
            }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
          />
          <Legend verticalAlign="bottom" height={30} />
          {models.map((model, index) => (
            <Bar key={model} dataKey={model} stackId="requests" fill={GREEN_PALETTE[index % GREEN_PALETTE.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function TokenVolumeTimelineChart({ timeline }: { timeline: InsightsTokenTimeline }) {
  const { points, bucket_interval } = timeline
  const chartData = points.map((pt) => ({
    timestamp: formatTimelineLabel(pt.timestamp, bucket_interval),
    input_tokens: pt.input_tokens,
    output_tokens: pt.output_tokens,
  }))

  return (
    <div className={styles.chartSection}>
      <h3 className={styles.chartTitle}>
        <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19h16" />
          <path d="M7 16V8" />
          <path d="M12 16V5" />
          <path d="M17 16v-6" />
        </svg>
        Total Token Volume over Time
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            angle={-30}
            textAnchor="end"
            height={70}
            interval="preserveStartEnd"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
          />
          <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} tickFormatter={formatCompactTokenCount} />
          <Tooltip
            cursor={false}
            formatter={(value: number | string, name: string) => [formatTokenCount(Number(value)), name]}
            contentStyle={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              color: 'var(--color-text-primary)',
            }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
          />
          <Legend verticalAlign="bottom" height={30} />
          <Bar dataKey="input_tokens" name="Input Tokens" stackId="tokens" fill="#76b900" />
          <Bar dataKey="output_tokens" name="Output Tokens" stackId="tokens" fill="#a3cc66" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const summaryCards = (summary: InsightsAggregateSummary) => [
  {
    label: 'Baseline Spend',
    value: formatCurrency(summary.baseline_spend, summary.currency),
    accentClassName: '',
    cardClassName: '',
  },
  {
    label: 'Total Saved',
    value: formatCurrency(summary.total_saved, summary.currency),
    accentClassName: styles.summaryValuePositive,
    cardClassName: '',
  },
  {
    label: 'Total Saved %',
    value:
      summary.cost_record_count > 0 && summary.baseline_spend > 0
        ? formatPercent(summary.total_saved / summary.baseline_spend)
        : 'N/A',
    accentClassName: styles.summaryValueHighlight,
    cardClassName: styles.summaryCardHighlight,
  },
  {
    label: 'Actual Spend',
    value: formatCurrency(summary.actual_spend, summary.currency),
    accentClassName: styles.summaryValueNeutral,
    cardClassName: '',
  },
]

export default function InsightsCharts({ aggregate, autoRefresh = false, onAutoRefreshChange, onRefresh }: InsightsChartsProps) {
  const summary = aggregate.summary
  const modelData = aggregate.model_selection
  const decisionData = aggregate.decision_distribution
  const signalData = aggregate.signal_distribution
  const tokenVolume = aggregate.token_volume
  const tokenBreakdown = aggregate.token_breakdown
  const tokenValues = [
    { name: 'Input Tokens', value: tokenVolume.input_tokens, fill: '#76b900' },
    { name: 'Output Tokens', value: tokenVolume.output_tokens, fill: '#00d4ff' },
    { name: 'Total Tokens', value: tokenVolume.total_tokens, fill: '#f59e0b' },
  ]
  const barColors = generateBarColors(modelData.length)

  if (aggregate.record_count === 0) {
    return null
  }

  return (
    <section className={styles.container}>
      {(onAutoRefreshChange ?? onRefresh) ? (
        <div className={styles.chartsToolbar}>
          {onAutoRefreshChange ? (
            <label className={styles.chartsToggle}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => onAutoRefreshChange(event.target.checked)}
              />
              <span>Auto-refresh</span>
            </label>
          ) : null}
          {onRefresh ? (
            <button type="button" onClick={onRefresh} className={styles.chartsRefreshButton}>
              Refresh
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={styles.summaryGrid}>
        {summaryCards(summary).map((card) => (
          <article
            key={card.label}
            className={`${styles.summaryCard} ${card.cardClassName}`.trim()}
          >
            <span className={styles.summaryLabel}>{card.label}</span>
            <strong className={`${styles.summaryValue} ${card.accentClassName}`.trim()}>{card.value}</strong>
          </article>
        ))}
      </div>

      {summary.excluded_record_count > 0 ? (
        <p className={styles.summaryHint}>
          {summary.excluded_record_count} filtered record{summary.excluded_record_count === 1 ? '' : 's'} excluded from cost totals because usage or pricing data is incomplete.
        </p>
      ) : null}

      <div className={styles.tokenBreakdownRow}>
        {tokenBreakdown.by_selected_model?.length > 0 ? (
          <TokenDistributionPie data={tokenBreakdown.by_selected_model} />
        ) : null}
        {aggregate.cost_by_model?.length > 0 ? (
          <CostByModelChart data={aggregate.cost_by_model} currency={aggregate.summary.currency} />
        ) : null}
      </div>

      {aggregate.request_timeline?.points?.length > 0 ? (
        <RequestTimelineChart timeline={aggregate.request_timeline} />
      ) : null}

      {aggregate.token_timeline?.points?.length > 0 ? (
        <TokenVolumeTimelineChart timeline={aggregate.token_timeline} />
      ) : null}

      <div className={styles.chartsRow}>
        <div className={styles.chartSection}>
          <h3 className={styles.chartTitle}>
            <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" />
              <rect x="14" y="8" width="7" height="13" />
            </svg>
            Model Selection
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={modelData} margin={{ top: 20, right: 0, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
              <Tooltip
                cursor={false}
                contentStyle={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  color: 'var(--color-text-primary)',
                }}
                itemStyle={{ color: 'var(--color-text-primary)' }}
              />
              <Bar dataKey="value" name="Count">
                {modelData.map((_entry, index) => (
                  <Cell key={`model-${index}`} fill={barColors[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartSection}>
          <h3 className={styles.chartTitle}>
            <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2 L12 12 L20 12" />
            </svg>
            Decision Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={decisionData}
                cx="50%"
                cy="50%"
                labelLine={{ stroke: 'var(--color-text-secondary)', strokeWidth: 1 }}
                label={renderCustomLabel}
                outerRadius={70}
                dataKey="value"
              >
                {decisionData.map((_entry, index) => (
                  <Cell key={`decision-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  color: 'var(--color-text-primary)',
                }}
                itemStyle={{ color: 'var(--color-text-primary)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartSection}>
          <h3 className={styles.chartTitle}>
            <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2 L12 12 L20 12" />
            </svg>
            Signal Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={signalData}
                cx="50%"
                cy="50%"
                labelLine={{ stroke: 'var(--color-text-secondary)', strokeWidth: 1 }}
                label={renderCustomLabel}
                outerRadius={70}
                dataKey="value"
              >
                {signalData.map((_entry, index) => (
                  <Cell key={`signal-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  color: 'var(--color-text-primary)',
                }}
                itemStyle={{ color: 'var(--color-text-primary)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.chartSection}>
        <h3 className={styles.chartTitle}>
          <svg className={styles.chartIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19h16" />
            <path d="M7 16V8" />
            <path d="M12 16V5" />
            <path d="M17 16v-6" />
          </svg>
          Token Volume
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={tokenValues} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
            <YAxis
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickFormatter={formatCompactTokenCount}
            />
            <Tooltip
              cursor={false}
              formatter={(value: number | string, name: string) => [formatTokenCount(Number(value)), name]}
              contentStyle={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                color: 'var(--color-text-primary)',
              }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
            />
            <Bar dataKey="value" name="Tokens" radius={[8, 8, 0, 0]}>
              {tokenValues.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {tokenVolume.excluded_record_count > 0 ? (
          <p className={styles.summaryHint}>
            {tokenVolume.excluded_record_count} filtered record{tokenVolume.excluded_record_count === 1 ? '' : 's'} excluded from token totals because usage data is incomplete.
          </p>
        ) : null}
      </div>

      <div className={styles.tokenBreakdownRow}>
        <TokenBreakdownChart title="Tokens by Decision" data={tokenBreakdown.by_decision} />
        <TokenBreakdownChart title="Tokens by Selected Model" data={tokenBreakdown.by_selected_model} />
      </div>

    </section>
  )
}
