import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseStories, parseEditionStories, parseEditionEditorial } from './src/lib/story'

function storyArchive(): Plugin {
  const source = fileURLToPath(new URL('./docs/STORY.md', import.meta.url))
  return {
    name: 'story-archive',
    resolveId(id) {
      if (id === 'virtual:stories' || id === 'virtual:edition-stories') return '\0' + id
    },
    load(id) {
      const parse = id === '\0virtual:stories' ? parseStories : id === '\0virtual:edition-stories' ? parseEditionStories : null
      if (!parse) return
      this.addWatchFile(source)
      const markdown = readFileSync(source, 'utf8')
      const editorial = parse === parseEditionStories ? `export const editorial = ${JSON.stringify(parseEditionEditorial(markdown))};` : ''
      return `${editorial} export default ${JSON.stringify(parse(markdown))}`
    },
    handleHotUpdate({ file, server }) {
      if (file !== source) return
      for (const id of ['\0virtual:stories', '\0virtual:edition-stories']) {
        const mod = server.moduleGraph.getModuleById(id)
        if (mod) server.moduleGraph.invalidateModule(mod)
      }
      server.ws.send({ type:'full-reload' })
      return []
    },
  }
}
export default defineConfig(({ command }) => ({
  plugins: [react(), storyArchive()],
  base: process.env.VITE_BASE || (command === 'serve' ? '/' : './'),
  build: { rollupOptions: { input: {
    index: fileURLToPath(new URL('./index.html', import.meta.url)),
    legacy: fileURLToPath(new URL('./old.html', import.meta.url)),
  } } },
  server: { host:'0.0.0.0', port:4721, strictPort:true },
  preview: { host:'0.0.0.0', port:4721, strictPort:true },
}))
