// Logo original de diarLinux: un cuaderno con un lápiz, de línea simple.
export function Logo({ tam = 40 }: { tam?: number }): React.JSX.Element {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="6" width="26" height="36" rx="3" />
      <path d="M15 6v36" />
      <path d="M20 15h9M20 21h9M20 27h5" />
      <path d="M41 17l-12 12-4 1 1-4 12-12z" />
    </svg>
  )
}
