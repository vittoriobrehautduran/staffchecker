import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Animated placeholder block — matches layout shape while data loads.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-skeleton rounded-md bg-muted', className)}
      aria-hidden
      {...props}
    />
  )
}
