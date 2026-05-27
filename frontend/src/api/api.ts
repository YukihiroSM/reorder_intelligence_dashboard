import type {
  AppConfig,
  Health,
  SKU,
  Scenario,
  ScenarioCreate,
  ScenarioSaved,
} from '../types'
import { client } from './client'

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
