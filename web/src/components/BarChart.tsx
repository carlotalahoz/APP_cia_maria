/** Gráfico de barras con HTML/CSS (legible a cualquier ancho y al imprimir). */
export function BarChart({
  data,
  max,
  unit = '',
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
  return (
    <div className="bar-chart" role="img" aria-label="Gráfico">
      {data.map((d, i) => {
        const v = d.value ?? 0
        return (
          <div key={i} className="bar-col" title={`${d.label}: ${d.value == null ? '—' : Math.round(v) + unit}`}>
            <span className="bar-value">{d.value == null ? '' : `${Math.round(v)}${unit}`}</span>
            <div className="bar" style={{ height: `${(Math.abs(v) / top) * 100}%`, background: v < 0 ? 'var(--danger)' : color }} />
            <span className="bar-label">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}
