import initSqlJs from 'sql.js'

initSqlJs({
  // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
  // You can omit locateFile completely when running in node
  locateFile: (file) => `https://sql.js.org/dist/${file}`,
}).then((SQL) => {
  console.warn('Database is now available globally')
  window['SQL'] = SQL
})

/**
 * consoleTableHTML(data, columns?, options?) -> string
 * Returns an HTML <table> string similar to console.table’s output.
 */
window['consoleTableHTML'] = function (data, columns, options: any = {}) {
  const {
    className = 'console-table',
    indexLabel = '',
    maxCellLength = 2000, // truncate long cells (for readability)
  } = options

  const esc = (s) =>
    String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')

  const isPlainObject = (v) =>
    Object.prototype.toString.call(v) === '[object Object]'

  const toCell = (v) => {
    if (v == null) return ''
    if (typeof v === 'string')
      return v.length > maxCellLength ? v.slice(0, maxCellLength) + '…' : v
    if (
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      typeof v === 'bigint'
    )
      return String(v)
    if (typeof v === 'function') return '[Function]'
    if (Array.isArray(v)) {
      try {
        const s = JSON.stringify(v)
        return s.length > maxCellLength ? s.slice(0, maxCellLength) + '…' : s
      } catch {
        return '[Array]'
      }
    }
    if (isPlainObject(v)) {
      try {
        const s = JSON.stringify(v)
        return s.length > maxCellLength ? s.slice(0, maxCellLength) + '…' : s
      } catch {
        return '[Object]'
      }
    }
    // e.g. Date, Map, Set, custom classes
    return String(v)
  }

  // Normalize input into { rows: Array<Record<string,unknown>>, index: string[] }
  function normalize(input) {
    // Map / Set support
    if (input instanceof Map) {
      return {
        rows: Array.from(input, ([k, v]) =>
          isPlainObject(v) ? v : { Key: k, Value: v }
        ),
        index: Array.from(input, ([k]) => k),
      }
    }
    if (input instanceof Set) {
      return {
        rows: Array.from(input, (v) => (isPlainObject(v) ? v : { Value: v })),
        index: Array.from(input, (_, i) => i),
      }
    }

    // Arrays
    if (Array.isArray(input)) {
      if (input.every(isPlainObject)) {
        return { rows: input, index: input.map((_, i) => i) }
      }
      // primitives / mixed → single "Value" column
      return {
        rows: input.map((v) => (isPlainObject(v) ? v : { Value: v })),
        index: input.map((_, i) => i),
      }
    }

    // Plain object
    if (isPlainObject(input)) {
      const keys = Object.keys(input)
      if (keys.length === 0) return { rows: [], index: [] }

      const values = keys.map((k) => input[k])
      // object of objects?
      if (values.every(isPlainObject)) {
        return { rows: values, index: keys }
      }
      // fallback: key/value table
      return {
        rows: keys.map((k) => ({ Key: k, Value: input[k] })),
        index: keys,
      }
    }

    // Everything else → single cell
    return { rows: [{ Value: input }], index: [0] }
  }

  const { rows, index } = normalize(data)

  // Collect columns
  let cols
  if (Array.isArray(columns) && columns.length) {
    cols = [...columns]
  } else {
    const set = new Set()
    for (const r of rows) for (const k of Object.keys(r)) set.add(k)
    cols = [...set]
  }

  // Empty case
  if (rows.length === 0) {
    return `<table class="${esc(className)}"><thead><tr><th>${esc(
      indexLabel
    )}</th></tr></thead><tbody></tbody></table>`
  }

  // Build thead
  let html = `<table class="${esc(className)}">`
  html += '<thead><tr>'
  html += `<th>${esc(indexLabel)}</th>`
  for (const col of cols) html += `<th>${esc(col)}</th>`
  html += '</tr></thead>'

  // Build tbody
  html += '<tbody>'
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {}
    html += '<tr>'
    html += `<td>${esc(index[i])}</td>`
    for (const col of cols) {
      const val = col in r ? r[col] : ''
      html += `<td>${esc(toCell(val))}</td>`
    }
    html += '</tr>'
  }
  html += '</tbody>'

  // Optional minimal styling (inline to keep it portable)
  html += `
<style>
  table.${esc(
    className
  )}{border-collapse:collapse;font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
  .${esc(className)} th, .${esc(
    className
  )} td{border:1px solid #ffffffff;padding:4px 8px;vertical-align:top;white-space:pre-wrap;max-width:40ch;overflow-wrap:anywhere}
  .${esc(className)} thead th{font-weight:600}
  .${esc(className)} tbody tr:nth-child(even){background:#fafbfc88}
  .${esc(className)} td:first-child, .${esc(
    className
  )} th:first-child{background:#f6f8fa88;font-weight:600}
</style>`

  html += '</table>'
  return html
}
