import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import { PreviewCard } from '@base-ui/react/preview-card'
import { LoadingState } from '@/components/loading-state'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { MODEL_LAN_TYPE, CREATE_MODEL_TYPE } from '../../constants'
import { ossUploadImage } from '../../api'

type ImageItem = {
  id: string
  src: string // oss 最终地址，上传成功后填充
  previewUrl?: string // 本地 blob 预览地址，上传中临时用
  isFirstIem?: boolean
  isSeconfIem?: boolean
  file: File
  name: string
  isUploading?: boolean
}

interface PlaygroundImagesProps {
  config: any
  setConfig: (value: any) => void
  activeTab: number
  onImagesChange: (list: any[]) => void
  /** 文字模式提交成功后自增的信号：消息已带上图片，上传区清空列表 */
  resetSignal?: number
}

const CARD_W = 64
const GAP = 75
const PUSH = 10
const LIFT = 8
const SCALE = 1.18
const PAD = 16
const COLLAPSE_MS = 220
// 收拢 → 展开的停留阈值：低于这个时长的划过不展开
const EXPAND_MS = 120
const LEFT_ANGLE = -6
const RIGHT_ANGLE = 6

// 与卡片的 h-[5.5rem] 保持一致
const CARD_H = 88
// 旋转原点的竖直位置（L2 的 transformOrigin 与它联动，改一处即可）
const ROT_ORIGIN_Y = 0.92
// 旋转原点到卡片中心的竖直距离：旋转会把视觉中心左右推走 sin(θ)·ROT_PIVOT
const ROT_PIVOT = CARD_H * (ROT_ORIGIN_Y - 0.5)
// hover 时卡片顶边实际上移：抬升 + 以中心为原点的缩放增量
const HOVER_RISE = LIFT + (CARD_H / 2) * (SCALE - 1)
// 删除角标还从顶边往外探 6px，且同样被放大
const BADGE_RISE = 6 * SCALE
// 预览弹层要避开的垂直距离，额外留 12px 视觉间隙
const POPUP_OFFSET = Math.round(HOVER_RISE + BADGE_RISE) + 12

const EASE_SWIFT = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EASE_SPRING = 'cubic-bezier(0.34, 1.45, 0.64, 1)'

type ImageCardProps = {
  img: ImageItem
  index: number
  total: number
  expanded: boolean
  hoveredIndex: number | null
  onRemove: (id: string, e: ReactMouseEvent) => void
  /** 首尾帧模式：不倾斜不平移，静态平铺展示 */
  plain?: boolean
}

/**
 * 卡片放在模块作用域。
 * 若定义在组件内部，每次渲染都是新的函数引用，React 会整批卸载重挂，
 * PreviewCard 状态与过渡全部重置，这才是「动画断掉」的元凶之一。
 */
function ImageCard({ img, index, total, expanded, hoveredIndex, onRemove, plain = false }: ImageCardProps) {
  // 弹层用图：OSS 地址优先，上传中退回本地 blob 预览，两者都没有就交给下面的条件渲染
  const popupSrc = img.src || img.previewUrl

  const isHovered = hoveredIndex === index
  const hasHover = hoveredIndex !== null
  const hoverIdx = hoveredIndex ?? -1

  const deg = plain ? 0 : index % 2 === 0 ? LEFT_ANGLE : RIGHT_ANGLE
  const centerShift = ROT_PIVOT * Math.sin((deg * Math.PI) / 180)
  const baseX = expanded ? index * GAP + (hasHover && hoverIdx < index ? PUSH : 0) : 0
  const x = baseX - (expanded ? centerShift : 0)
  const spreadDelay = expanded ? index * 30 : (total - index - 1) * 20
  const ripple = hasHover ? Math.min(Math.abs(index - hoverIdx), 6) * 14 : 0
  const move = { transition: `transform 420ms ${EASE_SWIFT} ${spreadDelay + ripple}ms` }

  return (
    <div
      data-card-index={index}
      className="group absolute top-0 left-0 h-[5.5rem] w-16 cursor-pointer"
      style={{
        ...move,
        transform: `translate3d(${x}px, 0, 0)`,
        zIndex: isHovered ? 999 : index,
      }}
    >
      {/* L2 旋转层，L3 缩放层：都吃不到指针，命中区永远是 L1 的静态盒子 */}
      <div
        className="pointer-events-none h-full w-full"
        style={{ ...move, transformOrigin: `50% ${ROT_ORIGIN_Y * 100}%`, transform: `rotate(${deg}deg)` }}
      >
        <div
          className="relative h-full w-full will-change-transform border-[1.5px] border-[#ffffffb3]"
          style={{
            transform: `translate3d(0, ${isHovered ? -LIFT : 0}px, 0) scale(${isHovered ? SCALE : 1})`,
            transition: `transform 300ms ${EASE_SPRING}`,
          }}
        >
          <img
            src={img.previewUrl ?? img.src}
            alt={img.name}
            draggable={false}
            className={`
              pointer-events-auto h-full w-full rounded-[0.2rem] border border-black/5 object-cover transition-all duration-300
              group-hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.35)]
              ${img.isUploading ? 'blur-[4px] opacity-80' : 'blur-0 opacity-100'}
            `}
          />
           {img.isUploading && (
              <LoadingState
                inline
                size="sm"
                className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-[0.2rem]"
              />
            )}
          {/*
            角标必须住进缩放层：它挂在卡片盒子上、而卡片的旋转和缩放都发生在这层内部，
            只有放在里面才会跟着图片角一起走。再乘一个 1/SCALE 的反向缩放，
            抵消父级放大，让角标自身的视觉尺寸保持恒定。

            仅堆叠模式走这条路径。首尾帧（plain）不适用：L2 有 rotate(0deg)，
            变换同样会创建独立层叠上下文，角标这里的 z-20 被困在 L2 内部，
            整层的层级只等于 z-index 0，会被后面 z-10 的 PreviewCard.Trigger 整块盖住，
            点击全落到浮层上、onClick 永远不触发。plain 模式改用下面的平铺角标。
          */}
          {!plain && (
            <button
              type="button"
              onClick={(ev) => onRemove(img.id, ev)}
              className="absolute -top-1.5 -right-1.5 z-20 grid size-5 origin-center place-items-center rounded-full bg-black/70 text-base leading-none text-white opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100"
              style={{
                transform: `scale(${isHovered ? 1 / SCALE : 0.72})`,
                pointerEvents: isHovered ? 'auto' : 'none',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Trigger 只做一块透明覆盖层，位置永远等于未缩放的卡片盒子，预览定位不会抖 */}
      <PreviewCard.Root>
        <PreviewCard.Trigger
          delay={160}
          closeDelay={160}
          aria-label={img.name}
          className="absolute inset-0 z-10 rounded-[0.2rem] outline-none"
        />
        <PreviewCard.Portal>
          {/* sideOffset 按 hover 时的实际上移量算出来的，正好躲开删除角标 */}
          <PreviewCard.Positioner side="top" sideOffset={POPUP_OFFSET} align="center" collisionPadding={12}
              style={{ zIndex: 10000 }}>
            {/*
              预览尺寸只由这一行决定：
              w-60 (240px) 定宽，图片按原比例撑高；
              max-h 只为防止超长竖图顶出屏幕，正常图片走不到这条限制，
              所以不会裁切、不会变形。
            */}
            <PreviewCard.Popup
              data-stack-zone
              className="w-60 origin-bottom overflow-hidden rounded-sm bg-white shadow-2xl transition-[opacity,transform] duration-150 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 dark:bg-neutral-900"
            >
              {/*
                上传中 src 还是空串，直接塞给 src 会让浏览器把当前页面当图片再拉一次。
                上传中就退回本地 blob 预览，两张都没有时干脆不渲染这个元素。
              */}
              {popupSrc ? (
                <img
                  src={popupSrc}
                  className="block max-h-[min(75vh,28rem)] w-full object-contain"
                />
              ) : null}
              <div className="px-2 py-1.5">
                <p className="truncate text-xs text-muted-foreground">{img.name}</p>
              </div>
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>

      {/*
        首尾帧（plain）模式的删除角标：必须放在 PreviewCard.Root 外面，
        成为 Trigger 的直接兄弟、共享卡片容器这个层叠上下文。
        plain 模式没有旋转和缩放，角标贴在卡片右上角的位置和不参与变换时完全一致，
        却能用 z-30 直接压过 z-10 的 Trigger，整块 20×20 都能点到（嵌在 L2 里时
        会被 Trigger 盖住，只有探出卡片外的那一小撮边缘能命中）。
      */}
      {plain && (
        <button
          type="button"
          onClick={(ev) => onRemove(img.id, ev)}
          className="absolute -top-1.5 -right-1.5 z-30 grid size-5 origin-center place-items-center rounded-full bg-black/70 text-base leading-none text-white opacity-0 transition-[opacity,transform] duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
          style={{ transform: 'scale(0.85)' }}
        >
          ×
        </button>
      )}
    </div>
  )
}

export function PlaygroundInputImages({ config, setConfig, activeTab, onImagesChange, resetSignal = 0 }: PlaygroundImagesProps) {
  const { t } = useTranslation()
  const [imageList, setImageList] = useState<ImageItem[]>([])
  const [expanded, setExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  // 首尾帧模式：首帧 / 尾帧各自一个文件选择框
  const firstInputRef = useRef<HTMLInputElement>(null)
  const secondInputRef = useRef<HTMLInputElement>(null)

  /**
   * 列表镜像：只由 commitList 同步写入，不在渲染期回写。
   * 若靠渲染期赋值（listRef.current = imageList），并发上传时多个回调会挤在同一批次里连续执行，
   * 而这一批里 React 还没渲染，后一个回调读到的仍是旧列表，前一个的更新会被整批覆盖。
   */
  const listRef = useRef(imageList)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const hoveredRef = useRef<number | null>(null)

  const collapseTimer = useRef<number | null>(null)
  const pendingCollapse = useRef(false)
  // 展开意图的延时定时器（防抖用）
  const expandTimer = useRef<number | null>(null)

  const setHovered = (next: number | null) => {
    if (hoveredRef.current === next) return
    hoveredRef.current = next
    setHoveredIndex(next)
  }

  /**
   * 列表的唯一可写入口：先同步刷新镜像，再触发渲染，并把新列表原样返回给调用方。
   * 存在的意义有两条：
   * 1. updater 保持纯粹 —— 副作用（revoke blob、通知父组件）一律挪到外面。
   *    updater 一旦被 React 推迟到 render 阶段执行，写在里面的父组件 setState 就会命中
   *    "Cannot update a component while rendering a different component"。
   * 2. 回调里能同步拿到最新列表 —— 并发上传时逐个 resolve 也不会互相覆盖。
   */
  const commitList = (updater: (prev: ImageItem[]) => ImageItem[]) => {
    const next = updater(listRef.current)
    listRef.current = next
    setImageList(next)
    return next
  }

  const handleOpenFile = () => {
    inputRef.current?.click()
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const maxSize = 20 * 1024 * 1024
    const fileArr = Array.from(files).filter(f => {
      if (f.size > maxSize) {
        toast.warning(`图片 ${f.name} 超过 20MB 限制`)
        return false
      }
      return true
    })
  
    // ========== 第一阶段：立刻生成 blob 预览，先塞进列表，带模糊上传态 ==========
    const tempItems: ImageItem[] = fileArr.map(file => ({
      id: Math.random().toString(36),
      src: '',
      previewUrl: URL.createObjectURL(file),
      file,
      name: file.name,
      isUploading: true,
    }))
  
    // 追加到列表，页面立刻渲染带模糊的预览图
    // 这一批还没上传完，不通知父组件
    commitList(prev => [...prev, ...tempItems])
  
    if (inputRef.current) inputRef.current.value = ''
  
    // ========== 第二阶段：并发上传OSS，上传完成逐个更新 ==========
    const uploadSingle = async (temp: ImageItem) => {
      try {
        const res = await ossUploadImage(temp.file)
        const ossUrl = res?.url || ''
        // 接口没给地址等同于失败：走 catch 把它摘掉，绝不让空 src 流到父组件
        if (!ossUrl) throw new Error('OSS 未返回图片地址')

        // blob 预览地址用完即释放，放在 updater 外面 —— updater 必须是纯函数
        const target = listRef.current.find(item => item.id === temp.id)
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)

        // updater 只负责算新列表，不掺任何副作用
        const next = commitList(prev =>
          prev.map(item =>
            item.id === temp.id
              ? { ...item, src: ossUrl, previewUrl: undefined, isUploading: false }
              : item
          )
        )

        // 只有 OSS 返回地址后才同步父组件，且只同步已上传完成的部分
        onImagesChange(next)
      } catch (err) {
        console.error('OSS上传失败：', err)
        toast.error(`图片 ${temp.name} 上传失败`)
        // 上传失败，直接从列表移除，同样不通知父组件
        const target = listRef.current.find(item => item.id === temp.id)
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
        commitList(prev => prev.filter(item => item.id !== temp.id))
      }
    }
    // 并发执行所有上传任务
    await Promise.all(tempItems.map(item => uploadSingle(item)))
  }


  const handleRemove = (id: string, e: ReactMouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const target = listRef.current.find((item) => item.id === id)
    // blob 地址只挂在 previewUrl 上；src 是 OSS 远程地址，revoke 它是空操作
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    const nextList = commitList(prev => prev.filter((item) => item.id !== id))
    // 删一张时可能还有别的在上传，同样只把已完成的交给父组件
    onImagesChange(nextList)
    // 删掉的可能正是 hover 中的那张，索引已失效，先清空避免错位放大
    setHovered(null)
  }

  /**
   * 首尾帧模式：上传单个槽位的图片。
   * 与普通模式同一套流程 —— 先 blob 预览带模糊上传态，OSS 成功后再回填 src 并通知父组件；
   * 同槽位已有图（哪怕还在上传中）直接替换，槽位永远最多一张。
   */
  const uploadFrame = async (file: File, isFirst: boolean) => {
    const temp: ImageItem = {
      id: Math.random().toString(36),
      src: '',
      previewUrl: URL.createObjectURL(file),
      isFirstIem: isFirst,
      isSeconfIem: !isFirst,
      file,
      name: file.name,
      isUploading: true,
    }

    const old = listRef.current.find(item => (isFirst ? item.isFirstIem : item.isSeconfIem))
    if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl)
    commitList(prev => [...prev.filter(item => item.id !== old?.id), temp])

    try {
      const res = await ossUploadImage(file)
      const ossUrl = res?.url || ''
      // 接口没给地址等同于失败：走 catch 把它摘掉，绝不让空 src 流到父组件
      if (!ossUrl) throw new Error('OSS 未返回图片地址')

      // blob 预览地址用完即释放，放在 updater 外面 —— updater 必须是纯函数
      const target = listRef.current.find(item => item.id === temp.id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)

      const next = commitList(prev =>
        prev.map(item =>
          item.id === temp.id
            ? { ...item, src: ossUrl, previewUrl: undefined, isUploading: false }
            : item
        )
      )
      // 只有 OSS 返回地址后才同步父组件，且只同步已上传完成的部分
      onImagesChange(next)
    } catch (err) {
      console.error('OSS上传失败：', err)
      toast.error(`图片 ${file.name} 上传失败`)
      const target = listRef.current.find(item => item.id === temp.id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      commitList(prev => prev.filter(item => item.id !== temp.id))
    }
  }

/**
 * 处理帧文件变化的处理函数
 * @param isFirst - 布尔值，表示是否是第一个文件
 * @returns 返回一个异步函数，用于处理文件输入的变化事件
 */
  const handleFrameFileChange = (isFirst: boolean) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      toast.warning(`图片 ${file.name} 超过 20MB 限制`)
      return
    }
    await uploadFrame(file, isFirst)
  }

  /** 首尾帧互换：交换两项的首/尾标记，没传的槽位自然落空 */
  const handleSwapFrames = () => {
    const next = commitList(prev =>
      prev.map(item => {
        if (item.isFirstIem) return { ...item, isFirstIem: false, isSeconfIem: true }
        if (item.isSeconfIem) return { ...item, isFirstIem: true, isSeconfIem: false }
        return item
      })
    )
    onImagesChange(next)
  }

  // 切换 Tab 清空图片
  useEffect(() => {
    listRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    })
    commitList(() => [])
    onImagesChange([])
    setHovered(null)
    setExpanded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, config.createVideoMode])

  // 文字模式提交成功后清空列表：图片已经挂到刚发出的 user 消息上，
  // 输入区不保留，避免下一条消息把旧图再带一遍
  useEffect(() => {
    if (!resetSignal) return
    listRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    })
    commitList(() => [])
    onImagesChange([])
    setHovered(null)
    setExpanded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  /**
   * 指针状态机：不再依赖任何元素的 mouseenter / mouseleave。
   * pointermove 只记录坐标，真正的判定在 rAF 里做几何校验 —— 哪怕中间漏掉几帧，
   * 下一次移动或任何一次 scroll / leave 都会把状态纠正回来，不存在「卡在放大态」。
   */
  useEffect(() => {
    if (imageList.length === 0) return

    let raf = 0
    let px = 0
    let py = 0
    let hasPos = false

    const clearCollapse = () => {
      pendingCollapse.current = false
      if (collapseTimer.current) {
        window.clearTimeout(collapseTimer.current)
        collapseTimer.current = null
      }
    }

    const clearExpand = () => {
      if (expandTimer.current) {
        window.clearTimeout(expandTimer.current)
        expandTimer.current = null
      }
    }

    const reset = () => {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      hasPos = false
      clearExpand()
      clearCollapse()
      setExpanded(false)
      setHovered(null)
    }

    // 展开区的几何包围盒，用布局位置算，不受过渡中间态影响
    const zoneRect = () => {
      const el = stackRef.current
      if (!el) return null
      const r = el.getBoundingClientRect()
      // 收拢态只认卡片本身（外扩 6px），不做 16px 大外扩，
      // 否则贴着卡片右下角的加号按钮会先被热区吞掉
      const pad = expandedRef.current ? PAD : 6
      const far = expandedRef.current ? listRef.current.length * GAP + CARD_W : CARD_W
      return {
        left: r.left - pad,
        right: r.left + far + pad,
        top: r.top - pad,
        bottom: r.bottom + pad,
      }
    }

    const evaluate = () => {
      raf = 0
      if (!hasPos) return

      /**
       * 圆形加号自己占的那块面积，从展开判定里整块抠掉。
       * 必须按「圆」抠而不是按矩形：按钮的盒是 32×32 的方块，
       * 四个角在视觉上早就出了圆外，按矩形抠会把卡片右下的边角判成死区。
       * 也不能只靠 elementFromPoint：卡片 hover 时 z-index 会升到 999 盖住加号，
       * 命中结果就变成卡片了。
       */
      const addRect = addBtnRef.current?.getBoundingClientRect()
      if (addRect) {
        const cx = addRect.left + addRect.width / 2
        const cy = addRect.top + addRect.height / 2
        const hitR = Math.max(addRect.width, addRect.height) / 2 + 8
        const dx = px - cx
        const dy = py - cy
        if (dx * dx + dy * dy <= hitR * hitR) {
          clearExpand()
          setHovered(null)
          return
        }
      }

      const zone = zoneRect()
      if (!zone) return

      const inZone = px >= zone.left && px <= zone.right && py >= zone.top && py <= zone.bottom

      // 视觉上指针下面到底是什么元素
      const el = document.elementFromPoint(px, py) as HTMLElement | null
      const overPopup = !!el?.closest<HTMLElement>('[data-stack-zone]')
      const overStack = !!el && !!stackRef.current?.contains(el)

      if (!inZone && !overPopup) {
        clearExpand()
        if (expandedRef.current && !pendingCollapse.current) {
          pendingCollapse.current = true
          collapseTimer.current = window.setTimeout(() => {
            pendingCollapse.current = false
            setExpanded(false)
            setHovered(null)
          }, COLLAPSE_MS)
        }
        setHovered(null)
        return
      }

      // 停在预览弹层上：保持展开，别把卡片收回去
      if (overPopup) {
        clearExpand()
        clearCollapse()
        return
      }

      // 指针停在「新增图片」的圆形加号上：不触发展开，保持收拢
      if (el?.closest<HTMLElement>('[data-stack-ignore]')) {
        clearExpand()
        setHovered(null)
        return
      }

      /**
       * 收拢态下必须真的压在堆叠元素上才展开。
       * 几何热区只描述「位置」，不描述「谁在上面」——页面上有 Modal / Sheet / 遮罩时，
       * 指针其实落在弹窗上，坐标却仍然在热区里，只看坐标就会误展开。
       * 展开后不再做这个判断：卡片之间本来就有 11px 缝隙，按元素命中会一路抖。
       */
      if (!expandedRef.current && !overStack) {
        clearExpand()
        setHovered(null)
        return
      }

      // 到这里才算「压在堆叠上」
      clearCollapse()

      if (expandedRef.current) {
        const card = el?.closest<HTMLElement>('[data-card-index]')
        const idx = card ? Number(card.dataset.cardIndex) : NaN
        setHovered(Number.isInteger(idx) ? idx : null)
        return
      }

      if (expandTimer.current) return
      expandTimer.current = window.setTimeout(() => {
        expandTimer.current = null
        if (!hasPos) return

        const z = zoneRect()
        const elNow = document.elementFromPoint(px, py) as HTMLElement | null
        const stillIn =
          !!z && px >= z.left && px <= z.right && py >= z.top && py <= z.bottom
        if (!stillIn || !elNow || !stackRef.current?.contains(elNow)) return

        // 只展开，不在这里定 hover：卡片散开后指针下面是另一张，
        // 交给下一次 pointermove 重新判定，避免「放大的是已经滑走的那张」
        setExpanded(true)
      }, EXPAND_MS)
    }

    const onMove = (e: PointerEvent) => {
      px = e.clientX
      py = e.clientY
      hasPos = true
      if (!raf) raf = requestAnimationFrame(evaluate)
    }

    const onViewportChange = () => {
      if (!hasPos) return
      if (!raf) raf = requestAnimationFrame(evaluate)
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('scroll', onViewportChange, true)
    document.documentElement.addEventListener('pointerleave', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('resize', onViewportChange)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
      if (expandTimer.current) window.clearTimeout(expandTimer.current)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('scroll', onViewportChange, true)
      document.documentElement.removeEventListener('pointerleave', reset)
      window.removeEventListener('blur', reset)
      window.removeEventListener('resize', onViewportChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageList.length])

  const addIndex = imageList.length
  // 尾部的虚线加号卡和图片卡用同一套倾斜 + 中心补偿，间距才接得上
  const addDeg = expanded ? (addIndex % 2 === 0 ? LEFT_ANGLE : RIGHT_ANGLE) : 0
  const addX =
    (expanded ? addIndex * GAP : 0) -
    (expanded ? ROT_PIVOT * Math.sin((addDeg * Math.PI) / 180) : 0)

  // 首尾帧模式：两张倾斜卡，中间以互换图标连接；点击占位卡上传，点击图标互换
  if (config?.createVideoMode === CREATE_MODEL_TYPE.headAndTail && config?.type === MODEL_LAN_TYPE.video) {
    const firstFrame = imageList.find(item => item.isFirstIem)
    const secondFrame = imageList.find(item => item.isSeconfIem)

    const renderSlot = (frame: ImageItem | undefined, isFirst: boolean) => (
      // ImageCard 是绝对定位，必须包一层带倾斜角的相对容器
      <div className={`relative h-[5.5rem] w-16 ${isFirst ? '-rotate-6' : 'rotate-6'}`}>
        {frame ? (
          <ImageCard
            key={frame.id}
            img={frame}
            index={0}
            total={1}
            expanded={false}
            hoveredIndex={null}
            onRemove={handleRemove}
            plain
          />
        ) : (
          <div
            onClick={() => (isFirst ? firstInputRef : secondInputRef).current?.click()}
            className="flex h-[5.2rem] w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xs border border-dashed border-border/70 bg-white shadow-sm transition-colors hover:bg-neutral-50"
          >
            <span className="text-3xl font-light text-[#999]">+</span>
            <span className="text-xs text-center text-[#999]">{isFirst ? t('First Frame') : t('Last Frame')}</span>
          </div>
        )}
      </div>
    )

    return (
      <div className="flex h-36 w-50 items-center justify-center p-2">
        <div className="flex items-center gap-2">
          {renderSlot(firstFrame, true)}

          <button
            type="button"
            onClick={handleSwapFrames}
            aria-label="交换首尾帧"
            className="cursor-pointer text-lg leading-none text-[#bbb] transition-colors hover:text-[#777]"
          >
            <svg width="1em" height="1em" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" role="presentation" xmlns="http://www.w3.org/2000/svg"><g><path data-follow-fill="currentColor" d="M8.5 5.5a1 1 0 0 0-1.707-.707l-3 3A1 1 0 0 0 4.5 9.5h15a1 1 0 0 0 0-2h-11v-2Zm7 13a1 1 0 0 0 1.707.707l3-3A1 1 0 0 0 19.5 14.5h-15a1 1 0 1 0 0 2h11v2Z" clip-rule="evenodd" fill-rule="evenodd" fill="currentColor"></path></g></svg>
          </button>

          {renderSlot(secondFrame, false)}
        </div>

        <input
          ref={firstInputRef}
          type="file"
          accept="image/*"
          onChange={handleFrameFileChange(true)}
          className="hidden"
        />
        <input
          ref={secondInputRef}
          type="file"
          accept="image/*"
          onChange={handleFrameFileChange(false)}
          className="hidden"
        />
      </div>
    )
  }

  return (
    <div className="h-36 w-36 p-2">
      <div className="relative flex h-full w-full items-center justify-center">
        {imageList.length === 0 ? (
          <div
            onClick={handleOpenFile}
            className="flex h-[6.25rem] w-20 rotate-[-6deg] cursor-pointer items-center justify-center rounded-xs border border-dashed border-border/70 shadow-sm bg-gray-50 transition-colors hover:bg-neutral-100"
          >
            <span className="text-4xl font-light text-[#999]">+</span>
          </div>
        ) : (
          <>
            {!expanded && (
              <button
                ref={addBtnRef}
                type="button"
                data-stack-ignore
                onClick={handleOpenFile}
                className="absolute right-4 bottom-4 z-[10] flex size-8 items-center justify-center rounded-full bg-black/80 text-2xl text-white"
              >
                +
              </button>
            )}

            <div ref={stackRef} className="relative h-[6rem] w-16">
              {imageList.map((img, idx) => (
                <ImageCard
                  key={img.id}
                  img={img}
                  index={idx}
                  total={imageList.length}
                  expanded={expanded}
                  hoveredIndex={hoveredIndex}
                  onRemove={handleRemove}
                />
              ))}

              <div
                onClick={handleOpenFile}
                className="absolute top-0 left-0 flex h-[5.8rem] w-16 cursor-pointer items-center justify-center rounded-sm border border-dashed border-border/70 bg-neutral-800/40 text-white transition-[transform,opacity,background-color] duration-300 hover:bg-neutral-700/40"
                style={{
                  transform: `translate3d(${addX}px, 0, 0) rotate(${addDeg}deg)`,
                  opacity: expanded ? 1 : 0,
                  pointerEvents: expanded ? 'auto' : 'none',
                  transitionDelay: `${expanded ? addIndex * 30 : 0}ms`,
                  transitionTimingFunction: EASE_SWIFT,
                  zIndex: addIndex,
                }}
              >
                <span className="text-5xl font-light">+</span>
              </div>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
