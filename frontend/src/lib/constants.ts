import type { Scenario, StockStatus } from '../types'

// Confidence-flag dictionary (ported from the design's FLAG_DEFS, extended to the
// backend's full 7-flag set). `kind` drives chip/pill coloring.
export interface FlagDef {
  label: string
  kind: 'warn' | 'info'
  icon: string
  explain: string
}

export const FLAG_DEFS: Record<string, FlagDef> = {
  RECENT_STOCKOUT: {
    label: 'Recent stockout',
    kind: 'warn',
    icon: '!',
    explain:
      'Trailing zero-sales days suggest the SKU was out of stock; recent velocity is suppressed and may understate true demand.',
  },
  LEADING_ZEROS: {
    label: 'New launch',
    kind: 'info',
    icon: 'N',
    explain:
      'Leading zero-sales days indicate a recent launch. Velocity may be unstable until the SKU matures.',
  },
  MOQ_OVERSHOOT: {
    label: 'MOQ overshoot',
    kind: 'warn',
    icon: 'M',
    explain:
      "MOQ is much larger than near-term demand. You'll commit cash to many months of stock.",
  },
  HIGH_VOLATILITY: {
    label: 'High volatility',
    kind: 'warn',
    icon: 'V',
    explain: 'Daily sales swing widely. Treat velocity averages with caution.',
  },
  DECLINING_TREND: {
    label: 'Declining trend',
    kind: 'warn',
    icon: '↓',
    explain:
      'Recent velocity is meaningfully below the longer trend. Consider whether to maintain inventory levels.',
  },
  VELOCITY_DIVERGENCE: {
    label: 'Velocity divergence',
    kind: 'warn',
    icon: '≠',
    explain:
      'Short-window (7d) velocity diverges sharply from the longer (14d) trend — the forecast is less reliable.',
  },
  SPARSE_DATA: {
    label: 'Sparse data',
    kind: 'warn',
    icon: '?',
    explain:
      'Too few non-zero sales days in the window to forecast confidently.',
  },
}

// Category -> data-viz color (ported from the design).
export const CATEGORY_COLORS: Record<string, string> = {
  Supplements: '#0F766E',
  Vitamins: '#0369A1',
  'Sports Nutrition': '#7C3AED',
  Beauty: '#D97706',
  Bundles: '#65A30D',
}
export const FALLBACK_CATEGORY_COLOR = '#78716C'

// Urgency ordering for default sort + sectioning.
export const STATUS_ORDER: Record<StockStatus, number> = {
  STOCKOUT: 0,
  CRITICAL: 1,
  LOW: 2,
  HEALTHY: 3,
}

// Scenario controls
export const DEFAULT_SCENARIO: Scenario = { growth: 0, leadBuffer: 7, forecastDays: 60 }
export const GROWTH_TICKS = [-20, -10, 0, 10, 20, 30, 50, 100]
export const LEAD_BUFFERS = [0, 7, 14, 21]
export const FORECAST_WINDOWS = [30, 60, 90]
