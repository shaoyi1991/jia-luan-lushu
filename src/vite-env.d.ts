/// <reference types="vite/client" />
declare module 'virtual:stories' {
  const stories: import('./lib/story').Story[]
  export default stories
}
declare module 'virtual:edition-stories' {
  export const editorial: ReturnType<typeof import('./lib/story').parseEditionEditorial>
  const stories: import('./lib/story').Story[]
  export default stories
}
