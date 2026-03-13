export interface ParsedSection {
  index: number
  title: string
  content: string
  level: number
  textType: 'narrative' | 'setting' | 'dialogue' | 'description'
  entities: string[]
  charCount: number
}

export interface ParsedDocument {
  fileName: string
  sections: ParsedSection[]
  totalChars: number
  totalSections: number
}

const CHAPTER_MARKER_REGEX = /(第[一二三四五六七八九十百千\d]+章|chapter\s+\d+|chapter\s+[ivxlcdm]+)/i
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/

/** 小段落合并目标字符数：相邻段落不足此值时合并 */
const MERGE_TARGET_CHARS = 1200
/** 最大 section 数量硬上限 */
const MAX_SECTIONS = 500

export class TextParser {
  private static readonly CHUNK_SIZE = 64 * 1024

  /**
   * 兼容旧接口：一次性解析
   */
  static parse(input: string, fileName = ''): ParsedDocument {
    const normalized = input.replace(/\r\n/g, '\n').trim()
    let sections = Array.from(this.parseStreaming(normalized, fileName))

    const isMarkdown = /\.md$|\.markdown$/i.test(fileName)
    if (!isMarkdown) {
      sections = this.mergeSections(sections)
    }

    if (sections.length > MAX_SECTIONS) {
      sections = this.downsampleSections(sections, MAX_SECTIONS)
    }

    return {
      fileName,
      sections,
      totalChars: normalized.length,
      totalSections: sections.length
    }
  }

  /**
   * 合并相邻小段落，让每个 section 达到 MERGE_TARGET_CHARS 以上
   */
  private static mergeSections(sections: ParsedSection[]): ParsedSection[] {
    if (sections.length <= MAX_SECTIONS) return sections

    const merged: ParsedSection[] = []
    let buffer: ParsedSection[] = []
    let bufferChars = 0

    const flush = () => {
      if (!buffer.length) return
      if (buffer.length === 1) {
        merged.push(buffer[0])
      } else {
        const first = buffer[0]
        const content = buffer.map((s) => s.content).join('\n\n')
        merged.push({
          index: merged.length,
          title: first.title,
          content,
          level: first.level,
          textType: this.detectTextType(content),
          entities: this.extractEntities(content),
          charCount: content.length
        })
      }
      buffer = []
      bufferChars = 0
    }

    for (const section of sections) {
      const isChapter = CHAPTER_MARKER_REGEX.test(section.title)
      if (isChapter && buffer.length) {
        flush()
      }

      buffer.push(section)
      bufferChars += section.charCount

      if (bufferChars >= MERGE_TARGET_CHARS || isChapter) {
        flush()
      }
    }

    flush()

    // 重新编号
    merged.forEach((s, i) => (s.index = i))
    return merged
  }

  /**
   * 均匀采样缩减到 maxCount 个 section
   */
  private static downsampleSections(sections: ParsedSection[], maxCount: number): ParsedSection[] {
    const step = sections.length / maxCount
    const result: ParsedSection[] = []
    for (let i = 0; i < maxCount; i++) {
      const idx = Math.min(Math.floor(i * step), sections.length - 1)
      result.push({ ...sections[idx], index: i })
    }
    return result
  }

  /**
   * 流式解析大文件，返回分段迭代器
   */
  static *parseStreaming(content: string, fileName?: string): Generator<ParsedSection> {
    const isMarkdown = /\.md$|\.markdown$/i.test(fileName || '')
    let offset = 0
    let sectionIndex = 0

    while (offset < content.length) {
      const end = Math.min(offset + this.CHUNK_SIZE, content.length)
      const safeEnd = end >= content.length ? content.length : this.findSafeBoundary(content, end)
      const safeChunk = content.slice(offset, safeEnd)

      const sections = isMarkdown
        ? this.parseMarkdownChunk(safeChunk, sectionIndex)
        : this.parsePlainTextChunk(safeChunk, sectionIndex)

      for (const section of sections) {
        yield section
        sectionIndex++
      }

      offset = safeEnd
    }
  }

  /**
   * 在 chunk 边界找到安全截断位置，避免截断段落
   */
  private static findSafeBoundary(content: string, position: number): number {
    const doubleNewline = content.indexOf('\n\n', position)
    if (doubleNewline !== -1 && doubleNewline - position < 4096) {
      return doubleNewline + 2
    }

    const singleNewline = content.indexOf('\n', position)
    if (singleNewline !== -1 && singleNewline - position < 2048) {
      return singleNewline + 1
    }

    for (let i = position; i < Math.min(position + 1024, content.length); i++) {
      const ch = content[i]
      if (ch === '。' || ch === '！' || ch === '？' || ch === '.' || ch === '!' || ch === '?') {
        return i + 1
      }
    }

    return Math.min(position, content.length)
  }

  private static parseMarkdownChunk(chunk: string, startIndex: number): ParsedSection[] {
    const lines = chunk.split('\n')
    const sections: ParsedSection[] = []
    let localIndex = startIndex

    let currentTitle = 'Untitled Section'
    let currentLevel = 1
    let buffer: string[] = []

    const flush = () => {
      const content = buffer.join('\n').trim()
      if (!content) return
      sections.push({
        index: localIndex,
        title: currentTitle,
        content,
        level: currentLevel,
        textType: this.detectTextType(content),
        entities: this.extractEntities(content),
        charCount: content.length
      })
      localIndex++
      buffer = []
    }

    for (const line of lines) {
      const heading = line.match(HEADING_REGEX)
      if (heading) {
        flush()
        currentLevel = heading[1].length
        currentTitle = heading[2].trim()
      } else {
        buffer.push(line)
      }
    }

    flush()

    if (sections.length === 0 && chunk.trim()) {
      sections.push({
        index: localIndex,
        title: 'Document',
        content: chunk.trim(),
        level: 1,
        textType: this.detectTextType(chunk),
        entities: this.extractEntities(chunk),
        charCount: chunk.trim().length
      })
    }

    return sections
  }

  private static parsePlainTextChunk(text: string, startIndex: number): ParsedSection[] {
    const blocks = text
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean)

    const sections: ParsedSection[] = []
    let localIndex = startIndex

    for (const block of blocks) {
      const firstLine = block.split('\n')[0]?.trim() || ''
      const hasChapterMarker = CHAPTER_MARKER_REGEX.test(firstLine)
      const hasLongTitleLine = firstLine.length > 0 && firstLine.length <= 40

      const title = hasChapterMarker
        ? firstLine
        : hasLongTitleLine
          ? firstLine
          : this.extractSectionTitle(block, localIndex)

      sections.push({
        index: localIndex,
        title,
        content: block,
        level: 1,
        textType: this.detectTextType(block),
        entities: this.extractEntities(block),
        charCount: block.length
      })
      localIndex++
    }

    return sections
  }

  /**
   * 从段落内容中提取有意义的标题，避免生成 "Section N"
   */
  private static extractSectionTitle(block: string, index: number): string {
    // Try to find a chapter marker anywhere in the first line
    const firstLine = block.split('\n')[0]?.trim() || ''
    const chapterMatch = firstLine.match(CHAPTER_MARKER_REGEX)
    if (chapterMatch) return chapterMatch[0]

    // Extract first sentence (up to Chinese/English sentence-ending punctuation)
    const sentenceMatch = block.match(/^(.{2,30}?)[。！？.!?\n]/)
    if (sentenceMatch) return sentenceMatch[1].trim()

    // Extract first clause (up to comma/semicolon)
    const clauseMatch = block.match(/^(.{2,25}?)[，,；;：:]/)
    if (clauseMatch) return clauseMatch[1].trim()

    // Truncate first line to 30 chars
    if (firstLine.length > 30) {
      return `${firstLine.slice(0, 28)}…`
    }

    return `段落 ${index + 1}`
  }

  /**
   * 文本类型检测
   */
  static detectTextType(text: string): ParsedSection['textType'] {
    const dialoguePattern = /[「」『』""'']/
    const dialogueVerbPattern = /[\u4e00-\u9fff]{1,4}(说|道|问|答|叹|喊|笑)/
    const settingPattern = /设定|规则|系统|种族|职业|技能|属性|魔法/

    if (dialoguePattern.test(text) || dialogueVerbPattern.test(text)) return 'dialogue'
    if (settingPattern.test(text)) return 'setting'
    if (text.length > 200) return 'narrative'
    return 'description'
  }

  static extractEntities(text: string): string[] {
    const candidates = new Set<string>()

    const quoted = text.match(/[“\"]([^”\"\n]{2,20})[”\"]/g) || []
    for (const item of quoted) {
      const cleaned = item.replace(/[“”\"]/g, '').trim()
      if (cleaned.length >= 2 && cleaned.length <= 20) {
        candidates.add(cleaned)
      }
    }

    const properNouns = text.match(/[A-Z][a-zA-Z]{2,20}/g) || []
    for (const item of properNouns) {
      candidates.add(item)
    }

    // 只匹配带有地名/组织/种族等后缀的中文专有名词
    const chineseNames = text.match(/[\u4e00-\u9fa5]{2,6}(王国|帝国|公会|学院|教会|城堡|城市|城|镇|村|河|山脉|山|森林|大陆|世界|联盟|军团|神殿|宫殿|种族)/g) || []
    for (const item of chineseNames) {
      candidates.add(item)
    }

    // 匹配书名号内的实体
    const bookTitle = text.match(/[《]([^》\n]{2,20})[》]/g) || []
    for (const item of bookTitle) {
      const cleaned = item.replace(/[《》]/g, '').trim()
      if (cleaned.length >= 2) {
        candidates.add(cleaned)
      }
    }

    return Array.from(candidates).slice(0, 30)
  }
}
