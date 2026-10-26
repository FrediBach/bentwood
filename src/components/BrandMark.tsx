/** A continuous plywood ribbon, rounded into a W with two visible veneer edges. */
export default function BrandMark() {
  const ribbon =
    'M8 12 L11.7 26.1 Q12.7 30 14.4 26.3 L18.2 17.1 Q20 12.7 21.8 17.1 L25.6 26.3 Q27.3 30 28.3 26.1 L32 12'

  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="currentColor" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d={ribbon} stroke="#f1dfbd" strokeWidth="4.5" />
        <path d={ribbon} stroke="currentColor" strokeWidth="1.2" />
      </g>
    </svg>
  )
}
