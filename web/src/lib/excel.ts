import { saveBlob } from './files'

export interface Sheet {
  name: string
  columns: { header: string; key: string; width?: number }[]
  rows: object[]
}

/** Genera y descarga un .xlsx (exceljs se carga bajo demanda). */
export async function downloadExcel(fileName: string, sheets: Sheet[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AD Compañía de María'
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31))
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }))
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF015092' } }
    s.rows.forEach((r) => ws.addRow(r))
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const buf = await wb.xlsx.writeBuffer()
  saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName)
}

/** Lee la primera hoja de un .xlsx como filas {cabecera: valor}. */
export async function readExcel(file: File): Promise<Record<string, unknown>[]> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []
  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.text ?? '').trim()
  })
  const rows: Record<string, unknown>[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const obj: Record<string, unknown> = {}
    let any = false
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = headers[col]
      if (!h) return
      const v = cell.value
      const val = v instanceof Date ? v : typeof v === 'object' && v !== null ? cell.text : v
      if (val !== null && val !== undefined && String(val).trim() !== '') any = true
      obj[h] = val
    })
    if (any) rows.push(obj)
  })
  return rows
}
