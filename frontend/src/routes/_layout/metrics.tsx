import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import RequireRole from "@/auth/RequireRole"
import { MetricsService } from "@/client"

export const Route = createFileRoute("/_layout/metrics")({
  component: MetricsPage,
  head: () => ({
    meta: [
      {
        title: "Metrics - FastAPI Template",
      },
    ],
  }),
})

function MetricsPage() {
  return (
    <RequireRole action="metrics.view">
      <MetricsContent />
    </RequireRole>
  )
}

function MetricsContent() {
  const { data, isLoading } = useQuery({
    queryKey: ["metrics"],
    queryFn: () => MetricsService.readMetrics(),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Metrics</h1>
        <p className="text-muted-foreground">View system metrics and statistics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border p-6">
          <h2 className="text-base font-semibold mb-1">Users Total</h2>
          <p className="text-sm text-muted-foreground mb-4">Total number of users</p>
          {isLoading ? <div className="h-10 w-20 bg-muted animate-pulse rounded"></div> : <div className="text-3xl font-bold">{data?.users_total || 0}</div>}
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="text-base font-semibold mb-1">Active Today</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Users active in the last 24 hours
          </p>
          {isLoading ? <div className="h-10 w-20 bg-muted animate-pulse rounded"></div> : <div className="text-3xl font-bold">{data?.active_today || 0}</div>}
        </div>
      </div>
    </div>
  )
}
