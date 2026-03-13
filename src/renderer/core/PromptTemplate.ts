/**
 * PromptTemplate — Lightweight template engine for AI prompt construction.
 *
 * Supports:
 *   {{variable}}          — Variable interpolation
 *   {{#if key}}...{{/if}} — Conditional blocks (truthy check)
 *   {{#each key}}...{{/each}} — Iteration over arrays ({{.}} for current item)
 *
 * Templates are plain strings. No external dependencies.
 */

export class PromptTemplate {
  /**
   * Render a template string with the given data context.
   */
  static render(template: string, data: Record<string, any>): string {
    let result = template

    // 1. Process {{#each key}}...{{/each}} blocks
    result = result.replace(
      /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match, key: string, body: string) => {
        const list = data[key]
        if (!Array.isArray(list) || list.length === 0) return ''
        return list
          .map((item, index) => {
            // Replace {{.}} with current item (for primitive arrays)
            let rendered = body.replace(/\{\{\.\}\}/g, String(item))
            // Replace {{@index}} with current index
            rendered = rendered.replace(/\{\{@index\}\}/g, String(index))
            // If item is an object, allow {{propName}}
            if (typeof item === 'object' && item !== null) {
              for (const [k, v] of Object.entries(item)) {
                rendered = rendered.replace(
                  new RegExp(`\\{\\{${k}\\}\\}`, 'g'),
                  v != null ? String(v) : ''
                )
              }
            }
            return rendered
          })
          .join('')
      }
    )

    // 2. Process {{#if key}}...{{/if}} blocks (no else support to keep it simple)
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_match, key: string, body: string) => {
        const value = data[key]
        if (value && (!Array.isArray(value) || value.length > 0)) {
          return body
        }
        return ''
      }
    )

    // 3. Process {{variable}} interpolation
    result = result.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = data[key]
      if (value === undefined || value === null) return ''
      if (typeof value === 'object') return JSON.stringify(value, null, 2)
      return String(value)
    })

    return result
  }

  /**
   * Parse front-matter from a prompt template string.
   * Expects YAML-like key: value pairs between --- delimiters.
   * Returns { meta, body }.
   */
  static parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
    if (!match) {
      return { meta: {}, body: raw }
    }
    const meta: Record<string, string> = {}
    for (const line of match[1].split('\n')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        meta[key] = value
      }
    }
    return { meta, body: match[2] }
  }
}
