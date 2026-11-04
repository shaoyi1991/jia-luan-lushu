import { useEffect, useRef, useState } from 'react'

// 一屏构图、进入视口自动演一次：对比同时在场，动画只负责"怎么长出来"。
// simple（减少动效/暂停）时不演出，直接呈现最终状态；重播通过 key 重挂载重启动画。
export function usePlay<T extends HTMLElement>(simple: boolean) {
  const ref = useRef<T>(null)
  const [played, setPlayed] = useState(false)
  const [run, setRun] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element || simple || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setPlayed(true)
        observer.disconnect()
      }
    }, { rootMargin: '-12% 0px -12% 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [simple])
  return { ref, played, run, replay: () => setRun(value => value + 1) }
}
