// Mirrors the backend Pydantic schemas. Keep in sync with:
//   backend/app/schemas/sku.py    -> SKUMetricsDTO
//   backend/app/schemas/config.py -> AppConfigOut

export type StockStatus = 'HEALTHY' | 'LOW' | 'CRITICAL' | 'STOCKOUT'
export type Trend = 'up' | 'down' | 'flat'

export interface SKU {
  sku_code: string
  name: string
  category: string
  supplier: string

  current_stock: number
  moq: number
  cost_per_unit_usd: number
  retail_price_usd: number

  production_lead_days: number
  shipping_days: number
  total_lead_days: number

  velocity_7d: number
  velocity_14d: number
  effective_velocity: number
  projected_velocity: number

  days_of_stock: number | null
  reorder_date: string | null // ISO date
  recommended_po_qty: number
  moq_binding: boolean
  estimated_reorder_cost: number

  status: StockStatus
  trend: Trend
  confidence_flags: string[]

  sales_last_30_days: number[] | null // only on the detail endpoint
}

export interface AppConfig {
  shipping_buffer_days: number
  forecast_window_days: number
  growth_pct: number
  critical_multiplier: number
  low_multiplier: number
  velocity_window_short: number
  velocity_window_long: number
  volatility_cv_threshold: number
  velocity_divergence_threshold: number
  sparse_data_min_days: number
  moq_overshoot_multiplier: number
  updated_at: string
  updated_by: string | null
}

export interface Health {
  status: string
  data_date: string | null
  skus_loaded: number
}

// Live scenario controls (client state). Maps to the API's query overrides.
export interface Scenario {
  growth: number // %  -> growth_pct
  leadBuffer: number // days -> shipping_buffer
  forecastDays: number // days -> forecast_window
}

export type SortField = 'urgency' | 'code' | 'name' | 'stock' | 'days' | 'cost'
export type SortDir = 'asc' | 'desc'

// Server-side query for the paginated inventory table.
export interface SKUTableQuery {
  status: StockStatus[]
  category: string | null
  supplier: string | null
  search: string
  sortBy: SortField
  sortDir: SortDir
}

// Mirrors backend ScenarioOut / ScenarioCreate (saved config snapshots).
export interface ScenarioSaved {
  id: string
  name: string
  kind: 'BASELINE' | 'CUSTOM'
  description: string | null
  shipping_buffer_days: number
  forecast_window_days: number
  growth_pct: number
  critical_multiplier: number
  low_multiplier: number
  created_at: string
}

export interface ScenarioCreate {
  name: string
  shipping_buffer_days: number
  forecast_window_days: number
  growth_pct: number
}
