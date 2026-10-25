export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
      <path
        d="M7 8h5.5a3 3 0 0 1 3 3v6"
        stroke="var(--background)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7.4" cy="8" r="2.4" fill="var(--flow)" />
    </svg>
  )
}
