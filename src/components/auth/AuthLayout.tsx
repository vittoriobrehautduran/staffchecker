import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

// Auth screens use a fixed neutral palette so they never follow app light/dark or localStorage.

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#eef0f4] via-[#e8eaef] to-[#dde1e8] p-4 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,rgba(255,255,255,0.55),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(100 116 139 / 0.11) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  )
}

export function AuthCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        'rounded-2xl border-stone-200/90 bg-white text-stone-900 shadow-[0_24px_48px_-14px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.05)]',
        className
      )}
      {...props}
    />
  )
}

/** Inputs on auth pages: always light surface, ignores global theme tokens. */
export const authInputClassName = cn(
  'border-stone-300 bg-white text-stone-900 shadow-sm placeholder:text-stone-400',
  'focus-visible:border-stone-500 focus-visible:ring-stone-500/20 focus-visible:ring-offset-0'
)
