/** Escudo provisional hasta disponer del logotipo oficial de la agrupación. */
export function Shield({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 3 8 11v19c0 15 10 26 24 31 14-5 24-16 24-31V11L32 3Z" fill="var(--brand)" />
      <path d="M32 9 14 15v15c0 11 7 20 18 24 11-4 18-13 18-24V15L32 9Z" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx="32" cy="31" r="10" fill="none" stroke="#fff" strokeWidth="2.5" />
      <path d="M22 31h20M32 21v20M25 24c4 4 4 10 0 14M39 24c-4 4-4 10 0 14" stroke="#fff" strokeWidth="2" fill="none" />
    </svg>
  )
}
