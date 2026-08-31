import { Skeleton } from '@/components/ui/skeleton'
import { ClubPageShell, ClubSoftPanel } from '@/pages/club/clubUi'

// Page-shaped loading placeholders — animate while data loads.

export function DashboardSkeleton() {
  return (
    <ClubPageShell>
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-48 max-w-full" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MonthSummarySkeleton />
        <MonthSummarySkeleton />
      </div>
      <ClubSoftPanel title="Genvägar">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-11 w-full sm:w-40" />
          <Skeleton className="h-11 w-full sm:w-36" />
        </div>
      </ClubSoftPanel>
    </ClubPageShell>
  )
}

function MonthSummarySkeleton() {
  return (
    <ClubSoftPanel>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-xl bg-muted/30 px-3 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
          </div>
        ))}
      </div>
    </ClubSoftPanel>
  )
}

export function PreviewSkeleton() {
  return (
    <ClubPageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <ClubSoftPanel>
        <div className="mb-4 flex justify-between gap-2">
          <div className="space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4"
            >
              <div className="flex justify-between gap-2">
                <Skeleton className="h-5 w-48 max-w-[70%]" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </ClubSoftPanel>
    </ClubPageShell>
  )
}

// Inner schedule panel skeleton (used inside ClubPageShell).
export function ClubSchedulePanelSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Laddar schema">
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.25rem] rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-2xl border border-border/60 p-4"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-11 w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AttendanceDaySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Laddar närvaro">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="space-y-4 rounded-2xl border border-border/80 bg-background/60 p-4 md:p-5"
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-52 max-w-full" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-4 w-20" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, playerIndex) => (
              <div key={playerIndex} className="space-y-2 rounded-md border p-3">
                <Skeleton className="h-5 w-40" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ListPanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Laddar">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border/60 p-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      ))}
    </div>
  )
}
