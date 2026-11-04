export interface Story { id: string; title: string; when: string; text: string; quote: string }
// Only explicitly published fields enter the client bundle. Internal notes stay in Markdown.
export function parseStories(markdown: string): Story[] {
  const body = markdown.replace(/```[\s\S]*?```/g, '')
  const sections = body.split(/^## /m).slice(1)
  return sections.flatMap(section => {
    const header = section.split('\n')[0]
    const match = header.match(/^(life-[a-z0-9-]+) · (.+)$/)
    const field = (key: string) => section.match(new RegExp(`^- ${key}：(.+)$`, 'm'))?.[1].trim() ?? ''
    if (!match || field('页面展示') !== '是') return []
    const when = field('页面时间'), text = field('可用表述')
    if (!when || !text) throw new Error(`故事 ${match[1]} 缺少页面时间或可用表述`)
    return [{id:match[1],title:match[2],when,text,quote:field('页面摘录')}]
  })
}

// Preserve the original allowlist and expose edition fields only in its own entry.
export function parseEditionStories(markdown: string): Story[] {
  const body = markdown.replace(/```[\s\S]*?```/g, '')
  const sections = body.split(/^## /m).slice(1)
  return parseStories(markdown).map(story => {
    const section = sections.find(part => part.startsWith(story.id + ' · ')) ?? ''
    const field = (key: string) => section.match(new RegExp(`^- ${key}：(.+)$`, 'm'))?.[1].trim()
    return {
      ...story,
      when: field('新版时间') || story.when,
      text: field('新版正文') || story.text,
      quote: field('新版摘录') || story.quote,
    }
  })
}

export function parseEditionEditorial(markdown: string) {
  const section = markdown.split(/^## 新版编辑文案\s*$/m)[1]?.split(/^## /m)[0] ?? ''
  return {
    opening: section.match(/^- 新版开场：(.+)$/m)?.[1] ?? '',
    ending: section.match(/^- 新版结语：(.+)$/m)?.[1] ?? '',
  }
}
