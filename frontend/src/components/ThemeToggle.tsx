import React from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

interface ThemeToggleProps {
  /** Optional theme override if used as standalone controlled component */
  theme?: 'light' | 'dark'
  /** Optional toggle handler if used as standalone controlled component */
  onToggle?: () => void
  /** Size variant: 'sm' (compact toolbar), 'md' (standard), or 'icon' (circular button) */
  size?: 'sm' | 'md' | 'icon'
  /** Optional extra CSS class */
  className?: string
  /** Show descriptive text label alongside icons */
  showLabel?: boolean
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme: controlledTheme,
  onToggle: controlledOnToggle,
  size = 'sm',
  className = '',
  showLabel = false,
}) => {
  // Use ThemeContext if available, otherwise fallback to controlled props or internal state
  let currentTheme: 'light' | 'dark' = 'light'
  let handleToggle = () => {}

  try {
    const context = useTheme()
    currentTheme = controlledTheme ?? context.theme
    handleToggle = controlledOnToggle ?? context.toggleTheme
  } catch {
    // If rendered outside ThemeProvider, use controlled props
    currentTheme = controlledTheme ?? 'light'
    handleToggle = controlledOnToggle ?? (() => {})
  }

  const isLight = currentTheme === 'light'

  // Circular Icon Button Variant
  if (size === 'icon') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Switch to ${isLight ? 'dark' : 'light'} theme`}
        title={`Current: ${isLight ? 'Light' : 'Dark'} Mode (Click to toggle)`}
        style={{
          backgroundColor: isLight ? '#FFFFFF' : '#1E2430',
          border: isLight ? '1px solid #CBD5E1' : '1px solid var(--neu-border)',
          boxShadow: isLight
            ? '0 1px 3px rgba(15, 23, 42, 0.1)'
            : '4px 4px 10px #131720, -4px -4px 10px #293140',
        }}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 cursor-pointer ${className}`}
      >
        {isLight ? (
          <Sun className="w-4 h-4 text-amber-500 transition-transform duration-300 hover:rotate-45" />
        ) : (
          <Moon className="w-4 h-4 text-sky-400 transition-transform duration-300 hover:-rotate-12" />
        )}
      </button>
    )
  }

  // Pill Sliding Toggle Switch (Compact / Standard)
  const isSmall = size === 'sm'
  const trackWidth = isSmall ? 'w-14' : 'w-16'
  const trackHeight = isSmall ? 'h-7' : 'h-8'
  const thumbSize = isSmall ? 'w-5 h-5' : 'w-6 h-6'
  const iconSize = isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const translateDistance = isSmall ? 'translate-x-7' : 'translate-x-8'

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {showLabel && (
        <span
          className="text-xs font-semibold font-mono tracking-wide select-none"
          style={{ color: isLight ? '#718096' : '#94A3B8' }}
        >
          {isLight ? 'LIGHT' : 'DARK'}
        </span>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={!isLight}
        aria-label={`Toggle theme (currently ${isLight ? 'light' : 'dark'})`}
        onClick={handleToggle}
        title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
        style={{
          backgroundColor: isLight ? '#F1F5F9' : '#1E2430',
          border: isLight ? '1px solid #CBD5E1' : '1px solid var(--neu-border)',
          boxShadow: isLight
            ? 'inset 0 1px 3px rgba(15, 23, 42, 0.08)'
            : 'inset 3px 3px 6px #131720, inset -3px -3px 6px #293140',
        }}
        className={`relative ${trackWidth} ${trackHeight} rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer flex items-center select-none`}
      >
        {/* Track Icon Backgrounds (subtle indicator glyphs) */}
        <div className="absolute inset-0 flex items-center justify-between px-1.5 pointer-events-none opacity-40">
          <Sun className={`${iconSize} ${isLight ? 'text-amber-500' : 'text-slate-500'}`} />
          <Moon className={`${iconSize} ${isLight ? 'text-slate-400' : 'text-cyan-400'}`} />
        </div>

        {/* Sliding Thumb Handle */}
        <div
          style={{
            backgroundColor: isLight ? '#FFFFFF' : '#1E2430',
            border: isLight ? '1px solid #CBD5E1' : '1px solid var(--neu-border)',
            boxShadow: isLight
              ? '0 1px 3px rgba(15, 23, 42, 0.15)'
              : '3px 3px 6px #131720, -3px -3px 6px #293140',
          }}
          className={`${thumbSize} rounded-full flex items-center justify-center transform transition-transform duration-300 ease-out ${
            isLight ? 'translate-x-0' : translateDistance
          }`}
        >
          {isLight ? (
            <Sun className={`${iconSize} text-amber-500 drop-shadow-sm`} />
          ) : (
            <Moon className={`${iconSize} text-sky-300 drop-shadow-sm`} />
          )}
        </div>
      </button>
    </div>
  )
}
