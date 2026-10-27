/** Escudo oficial de la Agrupación Deportiva Compañía de María (Zaragoza). */
export function Shield({ size = 40 }: { size?: number }) {
  return <img src="/escudo.png" alt="Escudo AD Compañía de María" width={Math.round(size * 0.83)} height={size} className="shield" />
}
