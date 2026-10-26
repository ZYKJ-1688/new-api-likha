/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import {
  Add01Icon,
  Cancel01Icon,
  Download01Icon,
  MinusSignIcon,
  Refresh01Icon,
  RotateLeft01Icon,
  RotateRight01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '@/components/ui/button'

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const SCALE_STEP = 0.25
const ROTATION_STEP = 90
const DEFAULT_SCALE = 1
const DEFAULT_ROTATION = 0
const DOUBLE_CLICK_SCALE = 2
// 滚轮缩放灵敏度：exp(-deltaY * 灵敏度)，指数式缩放各档位手感一致
const WHEEL_SENSITIVITY = 0.0015
// 单次滚轮事件的最大缩放倍率，避免某些鼠标一次 delta 过大直接跳到底
const MAX_WHEEL_FACTOR = 1.25

type Offset = { x: number; y: number }
type Size = { height: number; width: number }

type ImagePreviewDialogProps = {
  alt?: string
  onOpenChange: (open: boolean) => void
  open: boolean
  src: string
}

const ZERO_OFFSET: Offset = { x: 0, y: 0 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampScale(value: number): number {
  return clamp(Number(value.toFixed(3)), MIN_SCALE, MAX_SCALE)
}

/** deltaMode: 0=像素 1=行 2=页，统一折算成像素量级 */
function getWheelUnit(deltaMode: number): number {
  if (deltaMode === 1) return 16
  if (deltaMode === 2) return 100
  return 1
}

/**
 * 限制平移范围：图片比舞台大的部分才允许拖动，
 * 且旋转后的外接矩形也要算进去，否则旋转 90° 后边缘会拖不回来。
 */
function clampOffset(
  offset: Offset,
  scale: number,
  rotation: number,
  size: Size
): Offset {
  if (size.width <= 0 || size.height <= 0) return offset

  const radians = (rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))

  const boxWidth = size.width * scale
  const boxHeight = size.height * scale
  const boundingWidth = boxWidth * cos + boxHeight * sin
  const boundingHeight = boxWidth * sin + boxHeight * cos

  const maxX = Math.max(0, (boundingWidth - size.width) / 2)
  const maxY = Math.max(0, (boundingHeight - size.height) / 2)

  return { x: clamp(offset.x, -maxX, maxX), y: clamp(offset.y, -maxY, maxY) }
}

function getFileName(src: string): string {
  if (src.startsWith('data:')) {
    const mimeType = src.slice('data:'.length, src.indexOf(';'))
    const extension = mimeType.split('/')[1] ?? 'png'
    return `image.${extension === 'jpeg' ? 'jpg' : extension}`
  }

  const withoutQuery = src.split(/[?#]/)[0]
  const lastSegment = withoutQuery.split('/').pop()
  if (lastSegment && lastSegment.includes('.')) {
    return lastSegment
  }
  return 'image.png'
}

export function ImagePreviewDialog({
  alt = '',
  onOpenChange,
  open,
  src,
}: ImagePreviewDialogProps) {
  const { t } = useTranslation()
  const [scale, setScale] = useState(DEFAULT_SCALE)
  const [rotation, setRotation] = useState(DEFAULT_ROTATION)
  const [offset, setOffset] = useState<Offset>(ZERO_OFFSET)
  const [stageSize, setStageSize] = useState<Size>({ height: 0, width: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef<Offset>(ZERO_OFFSET)
  const dragRef = useRef<{
    originX: number
    originY: number
    pointerId: number
    startX: number
    startY: number
  } | null>(null)

  const applyOffset = useCallback((next: Offset) => {
    offsetRef.current = next
    setOffset(next)
  }, [])

  // 每次打开新图片都重置视图状态
  useEffect(() => {
    if (!open) return
    setScale(DEFAULT_SCALE)
    setRotation(DEFAULT_ROTATION)
    applyOffset(ZERO_OFFSET)
  }, [open, src, applyOffset])

  // 舞台尺寸用于计算平移边界
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !open) return

    const update = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      // 尺寸没变就复用旧对象，避免 ResizeObserver 触发无意义的重渲染
      setStageSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { height, width }
      )
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [open])

  // 缩放 / 旋转 / 尺寸变化后收紧平移偏移，避免图片被拖出可视区
  useEffect(() => {
    const next = clampOffset(offsetRef.current, scale, rotation, stageSize)
    if (next.x !== offsetRef.current.x || next.y !== offsetRef.current.y) {
      applyOffset(next)
    }
  }, [scale, rotation, stageSize, applyOffset])

  // 用原生监听器绑定 wheel：React 的 onWheel 是被动的，无法 preventDefault。
  // 缩放只改 scale、不动 offset —— 图片中心恒定在「舞台中心 + offset」，
  // 因此缩放天然以图片中心为原点展开。
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !open) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY * getWheelUnit(event.deltaMode)
      const factor = clamp(
        Math.exp(-delta * WHEEL_SENSITIVITY),
        1 / MAX_WHEEL_FACTOR,
        MAX_WHEEL_FACTOR
      )
      setScale((previous) => clampScale(previous * factor))
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [open])

  const zoomIn = useCallback(() => {
    setScale((previous) => clampScale(previous + SCALE_STEP))
  }, [])

  const zoomOut = useCallback(() => {
    setScale((previous) => clampScale(previous - SCALE_STEP))
  }, [])

  const rotateLeft = useCallback(() => {
    setRotation((previous) => previous - ROTATION_STEP)
  }, [])

  const rotateRight = useCallback(() => {
    setRotation((previous) => previous + ROTATION_STEP)
  }, [])

  const reset = useCallback(() => {
    setScale(DEFAULT_SCALE)
    setRotation(DEFAULT_ROTATION)
    applyOffset(ZERO_OFFSET)
  }, [applyOffset])

  const toggleZoom = useCallback(() => {
    setScale((previous) =>
      previous > DEFAULT_SCALE ? DEFAULT_SCALE : DOUBLE_CLICK_SCALE
    )
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = {
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      }
      setIsDragging(true)
    },
    []
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      applyOffset(
        clampOffset(
          {
            x: drag.originX + (event.clientX - drag.startX),
            y: drag.originY + (event.clientY - drag.startY),
          },
          scale,
          rotation,
          stageSize
        )
      )
    },
    [applyOffset, rotation, scale, stageSize]
  )

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const download = useCallback(async () => {
    const fileName = getFileName(src)
    // 跨域图片（如带签名的对象存储链接）fetch 可能被 CORS 拦掉，
    // 这时退化成新标签页打开，至少不至于点了没反应。
    try {
      const response = await fetch(src, { mode: 'cors' })
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = fileName
      link.rel = 'noopener'
      link.click()
      // 立即 revoke 可能让部分浏览器取消下载，推迟到下一个事件循环
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch {
      window.open(src, '_blank', 'noopener,noreferrer')
    }
  }, [src])

  let cursorClass = 'cursor-zoom-in'
  if (isDragging) {
    cursorClass = 'cursor-grabbing'
  } else if (scale > DEFAULT_SCALE) {
    cursorClass = 'cursor-grab'
  }

  return (
    // 这里直接用 base-ui 原语而不是 ui/dialog 的 DialogContent：
    // DialogContent 自带 grid / p-4 / gap-4 / overflow-y-auto，灯箱需要的
    // flex 列布局 + flex-1 min-h-0 会被它盖掉，图片会按原始尺寸撑出可视区。
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className='supports-[backdrop-filter]:backdrop-blur-sm fixed inset-0 z-50 bg-black/70' />
        <DialogPrimitive.Popup className='border-border/70 bg-background fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border shadow-2xl md:inset-10'>
          <div className='border-border/70 flex items-center justify-between gap-2 border-b px-4 py-2'>
            <DialogPrimitive.Title className='truncate text-sm font-medium'>
              {alt || t('Image')}
            </DialogPrimitive.Title>
            <Button
              aria-label={t('Close')}
              onClick={() => onOpenChange(false)}
              size='icon-sm'
              variant='ghost'
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>

          <div
            className={`bg-muted/30 relative min-h-0 flex-1 touch-none select-none overflow-hidden ${cursorClass}`}
            onDoubleClick={toggleZoom}
            onPointerCancel={endDrag}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            ref={stageRef}
          >
            {src ? (
              // 图片始终居中于舞台，缩放只改自身尺寸 → 天然以中心为原点；
              // 放大后超出的部分靠拖动这层 wrapper 来平移查看。
              <div
                className='absolute inset-0 flex items-center justify-center'
                style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
              >
                <img
                  alt={alt}
                  className='pointer-events-none max-w-none object-contain'
                  draggable={false}
                  src={src}
                  style={{
                    width: `${scale * 100}%`,
                    height: `${scale * 100}%`,
                    transform: `rotate(${rotation}deg)`,
                    transition: 'transform 150ms ease-out',
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className='border-border/70 flex flex-wrap items-center justify-center gap-1 border-t px-4 py-2'>
            <Button
              aria-label={t('Zoom out')}
              onClick={zoomOut}
              size='icon-sm'
              title={t('Zoom out')}
              variant='ghost'
            >
              <HugeiconsIcon icon={MinusSignIcon} />
            </Button>
            <span className='text-muted-foreground w-14 text-center text-xs tabular-nums'>
              {Math.round(scale * 100)}%
            </span>
            <Button
              aria-label={t('Zoom in')}
              onClick={zoomIn}
              size='icon-sm'
              title={t('Zoom in')}
              variant='ghost'
            >
              <HugeiconsIcon icon={Add01Icon} />
            </Button>
            <Button
              aria-label={t('Rotate left')}
              onClick={rotateLeft}
              size='icon-sm'
              title={t('Rotate left')}
              variant='ghost'
            >
              <HugeiconsIcon icon={RotateLeft01Icon} />
            </Button>
            <Button
              aria-label={t('Rotate right')}
              onClick={rotateRight}
              size='icon-sm'
              title={t('Rotate right')}
              variant='ghost'
            >
              <HugeiconsIcon icon={RotateRight01Icon} />
            </Button>
            <Button
              aria-label={t('Reset')}
              onClick={reset}
              size='icon-sm'
              title={t('Reset')}
              variant='ghost'
            >
              <HugeiconsIcon icon={Refresh01Icon} />
            </Button>
            <Button
              aria-label={t('Download')}
              onClick={() => void download()}
              size='icon-sm'
              title={t('Download')}
              variant='ghost'
            >
              <HugeiconsIcon icon={Download01Icon} />
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
