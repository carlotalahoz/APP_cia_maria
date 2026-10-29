/** Reglas de documentos: PDF, JPG/PNG o Excel; máximo 2 MB. */
export const DOC_MAX_BYTES = 2 * 1024 * 1024
export const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,.xls,.xlsx,application/pdf,image/jpeg,image/png'
const DOC_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

/** Valida formato (PDF, JPG/PNG, Excel) y tamaño máximo de 2 MB. Devuelve un mensaje de error o null. */
export function validateDocument(f: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  const okType = DOC_MIMES.includes(f.type) || ['pdf', 'jpg', 'jpeg', 'png', 'xls', 'xlsx'].includes(ext)
  if (!okType) return `${f.name}: formato no permitido (PDF, JPG, PNG o Excel).`
  if (f.size > DOC_MAX_BYTES) return `${f.name} supera el máximo de 2 MB.`
  return null
}

