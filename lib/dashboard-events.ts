export type DashboardEventType = 'package_created' | 'asset_reused'

export interface DashboardEvent {
  eventType: DashboardEventType
  createdAt: string
  metadata: Record<string, unknown>
}

export interface EventMetrics {
  productsPackaged: number
  filesReused: number
  lastExport: string | null
}

export function aggregateDashboardEvents(events: DashboardEvent[]): EventMetrics {
  let productsPackaged = 0
  let filesReused = 0
  let lastExport: string | null = null

  for (const event of events) {
    if (event.eventType === 'package_created') {
      productsPackaged += 1
      if (!lastExport || new Date(event.createdAt).getTime() > new Date(lastExport).getTime()) {
        lastExport = event.createdAt
      }
    }
    if (event.eventType === 'asset_reused') filesReused += 1
  }

  return { productsPackaged, filesReused, lastExport }
}
