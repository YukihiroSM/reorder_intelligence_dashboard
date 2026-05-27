import type {
  AppConfig,
  Health,
  SKU,
  SKUTableQuery,
  Scenario,
  ScenarioCreate,
  ScenarioSaved,
} from '../types'
import { client } from './client'

export const PAGE_SIZE = 10

// Map the live scenario controls to the API's query overrides.
export function scenarioParams(s: Scenario) {
  return {
    growth_pct: s.growth,
    forecast_window: s.forecastDays,
    shipping_buffer: s.leadBuffer,
  }
}

// Fetch the full SKU set for a scenario (default urgency sort). Filtering/sorting
// for the table happens client-side so every section shares one fetch.
export async function getSKUs(scenario: Scenario): Promise<SKU[]> {
  const { data } = await client.get<SKU[]>('/api/skus', {
    params: scenarioParams(scenario),
  })
  return data
}

// Paginated table fetch (server-side filter + sort + slice). Reads the total
// from the X-Total-Count header so the infinite query knows when to stop.
export async function getSKUsPage(
  scenario: Scenario,
  q: SKUTableQuery,
  offset: number,
): Promise<{ items: SKU[]; total: number }> {
  const params: Record<string, unknown> = {
    ...scenarioParams(scenario),
    limit: PAGE_SIZE,
    offset,
    sort_by: q.sortBy,
    sort_dir: q.sortDir,
  }
  if (q.status.length) params.status = q.status
  if (q.category) params.category = q.category
  if (q.supplier) params.supplier = q.supplier
  if (q.search) params.search = q.search
  const res = await client.get<SKU[]>('/api/skus', {
    params,
    paramsSerializer: { indexes: null }, // status=A&status=B (no [] indices)
  })
  const total = Number(res.headers['x-total-count'] ?? res.data.length)
  return { items: res.data, total }
}

export async function getSKU(code: string, scenario: Scenario): Promise<SKU> {
  const { data } = await client.get<SKU>(`/api/skus/${encodeURIComponent(code)}`, {
    params: scenarioParams(scenario),
  })
  return data
}

export async function getConfig(): Promise<AppConfig> {
  const { data } = await client.get<AppConfig>('/api/config')
  return data
}

export async function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const { data } = await client.put<AppConfig>('/api/config', patch)
  return data
}

export async function getHealth(): Promise<Health> {
  const { data } = await client.get<Health>('/api/health')
  return data
}

export async function getScenarios(): Promise<ScenarioSaved[]> {
  const { data } = await client.get<ScenarioSaved[]>('/api/scenarios')
  return data
}

export async function createScenario(payload: ScenarioCreate): Promise<ScenarioSaved> {
  const { data } = await client.post<ScenarioSaved>('/api/scenarios', payload)
  return data
}

export async function deleteScenario(id: string): Promise<void> {
  await client.delete(`/api/scenarios/${id}`)
}
