import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Stone rings for auth / neutral surfaces (ignores app theme primary). */
  variant?: 'default' | 'neutral'
}

export function LoadingSpinner({ size = 'md', className, variant = 'default' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  const ringMuted =
    variant === 'neutral' ? 'border-stone-200' : 'border-primary/20'
  const ringActive =
    variant === 'neutral' ? 'border-t-stone-700' : 'border-t-primary'

  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      <div className={cn('absolute inset-0 rounded-full border-4', ringMuted)} />
      <div
        className={cn(
          'absolute inset-0 animate-spin rounded-full border-4 border-transparent',
          ringActive
        )}
      />
    </div>
  )
}

interface LoadingOverlayProps {
  message?: string
}

export function LoadingOverlay({ message = 'Laddar...' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <LoadingSpinner size="lg" />
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
        </div>
        <p className="text-sm font-medium text-muted-foreground animate-pulse">{message}</p>
      </div>
    </div>
  )
}

interface PremiumLoadingOverlayProps {
  message?: string
  /** Matches neutral auth screens (no app light/dark). */
  variant?: 'default' | 'neutral'
}

export function PremiumLoadingOverlay({
  message = 'Loggar in...',
  variant = 'default',
}: PremiumLoadingOverlayProps) {
  if (variant === 'neutral') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#e8eaef]/92 backdrop-blur-md">
        <div className="flex flex-col items-center gap-6">
          <LoadingSpinner size="lg" variant="neutral" />
          <p className="text-sm font-semibold text-stone-700">{message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-blue-50/95 via-indigo-50/95 to-purple-50/95 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/95 backdrop-blur-md">
      <div className="flex flex-col items-center gap-8">
        {/* Large animated spinner */}
        <div className="relative">
          {/* Outer ring */}
          <div className="h-24 w-24 rounded-full border-8 border-blue-200 dark:border-blue-900/30"></div>
          {/* Animated ring */}
          <div className="absolute inset-0 h-24 w-24 rounded-full border-8 border-transparent border-t-blue-600 dark:border-t-blue-400 animate-spin"></div>
          {/* Inner pulsing circle */}
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse shadow-lg shadow-blue-500/50"></div>
          {/* Center dot */}
          <div className="absolute inset-8 rounded-full bg-white dark:bg-gray-900"></div>
        </div>
        
        {/* Animated dots */}
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="h-3 w-3 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="h-3 w-3 rounded-full bg-purple-600 dark:bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
        
        {/* Message */}
        <p className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent animate-pulse">
          {message}
        </p>
      </div>
    </div>
  )
}

interface ButtonLoadingSpinnerProps {
  className?: string
}

export function ButtonLoadingSpinner({ className }: ButtonLoadingSpinnerProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LoadingSpinner size="sm" />
      <span className="text-sm">Laddar...</span>
    </div>
  )
}

