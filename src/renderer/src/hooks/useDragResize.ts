import { useCallback, useRef } from 'react'

/**
 * Handles the mouse-event boilerplate for drag-to-resize handles.
 *
 * onStart  – called once at mousedown; use it to snapshot the start value.
 * onMove   – called on every mousemove with delta = currentPos − startPos.
 * onEnd    – called on mouseup.
 *
 * Callbacks are stored in refs so they never need useCallback wrappers at the
 * call site and the returned handler is stable as long as `axis` doesn't change.
 */
export function useDragResize({
  axis = 'x',
  onStart,
  onMove,
  onEnd,
}: {
  axis?: 'x' | 'y'
  onStart?: () => void
  onMove: (delta: number) => void
  onEnd?: () => void
}): (e: React.MouseEvent) => void {
  const onStartRef = useRef(onStart)
  const onMoveRef = useRef(onMove)
  const onEndRef = useRef(onEnd)
  onStartRef.current = onStart
  onMoveRef.current = onMove
  onEndRef.current = onEnd

  return useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startPos = axis === 'x' ? e.clientX : e.clientY
    onStartRef.current?.()

    const handleMove = (ev: MouseEvent): void => {
      const currentPos = axis === 'x' ? ev.clientX : ev.clientY
      onMoveRef.current(currentPos - startPos)
    }
    const handleUp = (): void => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      onEndRef.current?.()
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [axis])
}
