import { supabase } from './supabase'

import { validateDocument } from './docRules'

export { DOC_ACCEPT, DOC_MAX_BYTES, validateDocument } from './docRules'

export function safeName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_')
}

export function mimeFor(f: File) {
  if (f.type) return f.type
  const ext = f.name.split('.').pop()?.toLowerCase()
  return ext === 'pdf' ? 'application/pdf' : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream'
}

/** Sube un fichero al bucket privado de documentos y devuelve la ruta. */
export async function uploadDocument(prefix: string, f: File): Promise<string> {
  const err = validateDocument(f)
  if (err) throw new Error(err)
  const path = `${prefix}/${crypto.randomUUID()}-${safeName(f.name)}`
  const { error } = await supabase.storage.from('documentos').upload(path, f, { contentType: mimeFor(f) })
  if (error) throw new Error(error.message)
  return path
}

export async function downloadDocument(path: string, fileName: string, bucket = 'documentos') {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60, { download: fileName })
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank', 'noopener')
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Descarga varios documentos y los empaqueta en un ZIP (solo los que el usuario puede leer). */
export async function downloadZip(items: { path: string; file_name: string; folder?: string }[], zipName: string) {
  const { zipSync } = await import('fflate')
  const files: Record<string, Uint8Array> = {}
  const skipped: string[] = []
  for (const it of items) {
    const { data, error } = await supabase.storage.from('documentos').download(it.path)
    if (error || !data) {
      skipped.push(it.file_name)
      continue
    }
    let name = `${it.folder ? it.folder + '/' : ''}${safeName(it.file_name)}`
    let n = 1
    while (files[name]) name = `${it.folder ? it.folder + '/' : ''}${n++}_${safeName(it.file_name)}`
    files[name] = new Uint8Array(await data.arrayBuffer())
  }
  if (!Object.keys(files).length) throw new Error('No hay documentos descargables.')
  const zipped = zipSync(files)
  saveBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), zipName)
  return skipped
}
