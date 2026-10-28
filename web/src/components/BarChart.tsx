/** Gráfico de barras SVG sencillo (sin dependencias). Valores en 0–max. */
export function BarChart({
  data,
  max,
  unit = '',
  height = 160,
  color = 'var(--primary-2)',
}: {
  data: { label: string; value: number | null }[]
  max?: number
  unit?: string
  height?: number
  color?: string
}) {
  if (!data.length) return <p className="muted small">Sin datos para el gráfico.</p>
  const top = max ?? Math.max(1, ...data.map((d) => Math.abs(d.value ?? 0)))
  const w = 100 / data.length
  return (
    <svg className="bar-chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Gráfico">
      {data.map((d, i) => {
        const v = d.value ?? 0
        const h = (Math.abs(v) / top) * (height - 30)
        return (
          <g key={i}>
            <rect x={i * w + w * 0.15} y={height - 18 - h} width={w * 0.7} height={h} fill={v < 0 ? 'var(--danger)' : color} rx="0.8">
              <title>
                {d.label}: {d.value == null ? '—' : `${Math.round(v)}${unit}`}
              </title>
            </rect>
            <text x={i * w + w / 2} y={height - 22 - h} fontSize="4" textAnchor="middle" fill="currentColor">
              {d.value == null ? '' : `${Math.round(v)}${unit}`}
            </text>
            <text x={i * w + w / 2} y={height - 6} fontSize="3.6" textAnchor="middle" fill="currentColor" opacity="0.7">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
