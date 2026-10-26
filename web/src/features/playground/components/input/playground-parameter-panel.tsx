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
import { useState } from 'react'
import { SlidersHorizontalIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Sparkle } from 'lucide-react'
import { Popover } from '@base-ui/react/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  DEFAULT_IMAGE_COUNT,
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_RATIO,
  DEFAULT_VIDEO_SIZE,
  MODEL_LAN_TYPE,
} from '../../constants'

import {
  getParameterControlValueText,
  normalizeParameterNumberValue,
  PLAYGROUND_PARAMETER_CONTROLS,
  PLAYGROUND_PARAMETER_PANEL_SCROLL_CLASS,
  type PlaygroundParameterKey,
} from '../../lib/parameters/playground-parameters'
import type { ParameterEnabled, PlaygroundConfig } from '../../types'

type PlaygroundParameterPanelProps = {
  config: PlaygroundConfig
  disabled?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onParameterEnabledChange: (
    key: PlaygroundParameterKey,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
  activeTab: number
}

type PlaygroundParameterContentProps = PlaygroundParameterPanelProps & {
  compact?: boolean
}

type ImageSize = { width: number; height: number }

// 图片模式：分辨率 + 比例对应的固定尺寸
const IMAGE_SIZE_MAP: Record<
  string,
  Record<string, ImageSize>
> = {
  '1k': {
    '1/1': { width: 1024, height: 1024 },
    '4/3': { width: 1152, height: 864 },
    '3/4': { width: 864, height: 1152 },
    '16/9': { width: 1424, height: 800 },
    '9/16': { width: 800, height: 1424 },
  },
  '1.5k': {
    '1/1': { width: 1536, height: 1536 },
    '4/3': { width: 1792, height: 1344 },
    '3/4': { width: 1344, height: 1792 },
    '16/9': { width: 2048, height: 1152 },
    '9/16': { width: 1152, height: 2048 },
  },
  '2k': {
    '1/1': { width: 2048, height: 2048 },
    '4/3': { width: 2368, height: 1776 },
    '3/4': { width: 1776, height: 2368 },
    '16/9': { width: 2816, height: 1584 },
    '9/16': { width: 1584, height: 2816 },
  },
}

const IMAGE_RESOLUTION_ORDER = ['1k', '1.5k', '2k'] as const
const DEFAULT_IMAGE_RATIO = '1/1'
const DEFAULT_IMAGE_RESOLUTION = '1k'
// 时长滑杆的最小档位，低于这个值不写入 config
const MIN_VIDEO_DURATION = 4

function formatImageSize(size?: ImageSize): string | undefined {
  if (!size) return undefined
  return `${size.width}x${size.height}`
}

// 由 config.size（形如 "1536x1536"）反推面板上的比例与分辨率选项
function resolveImageSizeSelection(size?: string): {
  ratio: string
  resolution: string
} {
  const fallback = {
    ratio: DEFAULT_IMAGE_RATIO,
    resolution: DEFAULT_IMAGE_RESOLUTION,
  }

  if (!size) return fallback

  const [rawWidth, rawHeight] = size.split('x')
  const width = Number(rawWidth)
  const height = Number(rawHeight)

  if (!width || !height) return fallback

  for (const resolution of IMAGE_RESOLUTION_ORDER) {
    const matched = Object.entries(IMAGE_SIZE_MAP[resolution] ?? {}).find(
      ([, dimension]) =>
        dimension.width === width && dimension.height === height
    )
    if (matched) {
      return { ratio: matched[0], resolution }
    }
  }

  return fallback
}

function PlaygroundParameterContent({
  compact = false,
  config,
  disabled,
  onConfigChange,
  onParameterEnabledChange,
  parameterEnabled,
  activeTab,
}: PlaygroundParameterContentProps) {
  const { t } = useTranslation()
  // 图片模式：比例 / 分辨率直接由 config.size 反推，保证面板与入参一致
  const imageSelection = resolveImageSizeSelection(config.size)
  const selectedRatio = imageSelection.ratio
  const selectedRes = imageSelection.resolution
  const [videoGenCount, setVideoGenCount] = useState(DEFAULT_IMAGE_COUNT)
  // 比例 / 分辨率 / 时长直接由 config 驱动，保证面板与请求入参一致
  const videoRatio = config.ratio ?? DEFAULT_VIDEO_RATIO
  const videoSize = config.videoSize ?? DEFAULT_VIDEO_SIZE
  const videoDuration = config.videoDuration ?? DEFAULT_VIDEO_DURATION

  // 图片模式：把当前比例 + 分辨率换算成 "宽x高" 写入 config.size
  const updateImageSize = (ratio: string, resolution: string) => {
    const nextSize = formatImageSize(IMAGE_SIZE_MAP[resolution]?.[ratio])
    if (!nextSize) return
    onConfigChange('size', nextSize)
  }

  const handleImageRatioChange = (value: string) => {
    updateImageSize(value, selectedRes)
  }

  const handleImageResolutionChange = (value: string) => {
    updateImageSize(selectedRatio, value)
  }

  const handleVideoRatioChange = (value: string) => {
    console.log(value)
    onConfigChange('ratio', value)
  }

  const handleVideoSizeChange = (value: string) => {
    onConfigChange('videoSize', value)
  }

  // 滑杆回调给的可能是数组也可能是标量，统一取第一个值
  const handleVideoDurationChange = (
    nextValue: number | readonly number[]
  ) => {
    const firstValue = Array.isArray(nextValue) ? nextValue[0] : nextValue
    if (firstValue < MIN_VIDEO_DURATION) return
    onConfigChange('videoDuration', firstValue)
  }

  const updateParameterConfig = (
    key: PlaygroundParameterKey,
    value: number | null
  ) => {
    if (key === 'seed') {
      onConfigChange('seed', value)
      return
    }

    onConfigChange(key, value ?? 0)
  }

  const ratioOptions = [
    { label: '1:1', value: '1/1', ratio: 1, icon: <div className="w-4 h-4 border-2 border-[#575757] rounded-[4px]"></div> },
    { label: '4:3', value: '4/3', ratio: 4/3, icon: <div className="w-4 h-3 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '3:4', value: '3/4', ratio: 3/4, icon: <div className="w-3 h-4 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '16:9', value: '16/9', ratio: 16/9, icon: <div className="w-5 h-3 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '9:16', value: '9/16', ratio: 9/16, icon: <div className="w-3 h-5 border-2 border-[#575757] rounded-[4px]"/> },
  ]

  const videoOptions = [
    { label: '1:1', value: '1:1', ratio: 1, icon: <div className="w-4 h-4 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '3:4', value: '3:4', ratio: 3/4, icon: <div className="w-3 h-4 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '4:3', value: '4:3', ratio: 4/3, icon: <div className="w-4 h-3 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '9:16', value: '9:16', ratio: 9/16, icon: <div className="w-3 h-5 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '16:9', value: '16:9', ratio: 16/9, icon: <div className="w-5 h-3 border-2 border-[#575757] rounded-[4px]"/> },
    { label: '21:9', value: '21:9', ratio: 21/9, icon: <div className="w-6 h-2.5 border-2 border-[#575757] rounded-[4px]"/> },
  ]
  
  // 分辨率
  const resolutionOptions = [
    { label: '标清 1K', value: '1k' },
    { label: '高清 1.5K', value: '1.5k', plus: true },
    { label: '超清 2K', value: '2k', plus: true },
  ]

  // 视频分辨率
  const videoResolutionOptions = [
    { label: '480p', value: '480p' },
    { label: '720p', value: '720p' },
    { label: '1080p', value: '1080p', plus: true },
  ]

  const currentSize = IMAGE_SIZE_MAP[selectedRes]?.[selectedRatio]

  return (
    <div
      className={cn(
        'grid gap-3',
        PLAYGROUND_PARAMETER_PANEL_SCROLL_CLASS,
        compact ? 'px-4 pb-4' : 'p-1'
      )}
    >
      {
        activeTab === MODEL_LAN_TYPE.text && 
        PLAYGROUND_PARAMETER_CONTROLS.map((control) => {
          const enabled = parameterEnabled[control.key]
          const value = config[control.key]
          const controlId = `playground-${control.key}`
  
          return (
            <div
              className={cn(
                'border-border/70 bg-background/60 grid gap-2 rounded-lg border p-3 transition-opacity',
                (!enabled || disabled) && 'opacity-55'
              )}
              key={control.key}
            >
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0 space-y-1'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <label
                      className='truncate text-sm leading-5 font-medium'
                      htmlFor={controlId}
                    >
                      {t(control.labelKey)}
                    </label>
                    <Badge
                      className='h-5 max-w-24 shrink-0 px-1.5 font-mono text-[11px]'
                      variant='outline'
                    >
                      {t(getParameterControlValueText(control.key, value))}
                    </Badge>
                  </div>
                  <p className='text-muted-foreground text-xs leading-4'>
                    {t(control.descriptionKey)}
                  </p>
                </div>
  
                <Switch
                  aria-label={t('Enable {{parameter}}', {
                    parameter: t(control.labelKey),
                  })}
                  checked={enabled}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onParameterEnabledChange(control.key, checked)
                  }
                  size='sm'
                />
              </div>
  
              {control.valueType === 'slider' ? (
                <Slider
                  className='py-1.5'
                  disabled={disabled || !enabled}
                  id={controlId}
                  max={control.max}
                  min={control.min}
                  onValueChange={(nextValue) => {
                    const firstValue = Array.isArray(nextValue)
                      ? nextValue[0]
                      : nextValue
                    updateParameterConfig(
                      control.key,
                      normalizeParameterNumberValue(control.key, firstValue)
                    )
                  }}
                  step={control.step}
                  value={[Number(value)]}
                />
              ) : (
                <Input
                  disabled={disabled || !enabled}
                  id={controlId}
                  inputMode='numeric'
                  max={control.max}
                  min={control.min}
                  onChange={(event) => {
                    updateParameterConfig(
                      control.key,
                      normalizeParameterNumberValue(
                        control.key,
                        event.target.value
                      )
                    )
                  }}
                  step={control.step}
                  type='number'
                  value={value ?? ''}
                />
              )}
            </div>
          )
        })
      }
      {
        activeTab === MODEL_LAN_TYPE.image && <div className="w-full p-0 space-y-6 text-slate-800 dark:text-slate-100">
          {/* 选择比例 */}
          <div>
            <p className="text-sm font-medium mb-3 text-slate-600 dark:text-slate-300">选择比例</p>
            <RadioGroup
              value={selectedRatio}
              onValueChange={handleImageRatioChange}
              className="grid grid-cols-5 gap-[2px] bg-black/5 p-[2px] rounded-sm"
            >
              {ratioOptions.map(option => (
                <Radio.Root
                  key={option.value}
                  value={option.value}
                  className="
                    flex flex-col items-center justify-center gap-3 py-3 px-2 rounded-sm
                    data-[checked]:bg-white/64 dark:data-[checked]:bg-white/15 data-[checked]:shadow-sm
                    hover:bg-white/64 dark:hover:bg-white/15 transition-colors cursor-pointer
                  "
                >
                  {option.icon}
                  <span className="text-xs">{option.label}</span>
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
    
          <div>
            <p className="text-sm font-medium mb-3 text-slate-600 dark:text-slate-300">选择分辨率</p>
            <RadioGroup
              value={selectedRes}
              onValueChange={handleImageResolutionChange}
              className="grid grid-cols-3 gap-[2px] bg-black/5 p-[2px] rounded-sm"
            >
              {resolutionOptions.map(opt => (
                <Radio.Root
                  key={opt.value}
                  value={opt.value}
                  className="
                    flex flex-row items-center justify-center gap-2 py-[0.7rem] px-2 rounded-sm
                    data-[checked]:bg-white/64 dark:data-[checked]:bg-white/15 data-[checked]:shadow-sm
                    hover:bg-white/64 dark:hover:bg-white/15 transition-colors cursor-pointer
                  "
                >
                  <span>{opt.label}</span>
                  {opt.plus && <Sparkle size={10} stroke="#3b82f6" fill="#3b82f6" />}
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
    
          {/* <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">选择生成数量</p>
              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">限免1张</span>
            </div>
            <RadioGroup
              value={String(genCount)}
              onValueChange={(v)=>handleImageCountChange(Number(v))}
              className="grid grid-cols-4 gap-[2px] bg-black/5 p-[2px] rounded-sm"
            >
              {[1,2,3,4].map(num => (
                <Radio.Root
                  key={num}
                  value={String(num)}
                  className="
                    flex flex-row items-center justify-center gap-2 py-[0.6rem] px-2 rounded-sm
                    data-[checked]:bg-white/64 dark:data-[checked]:bg-white/15 data-[checked]:shadow-sm
                    hover:bg-white/64 dark:hover:bg-white/15 transition-colors cursor-pointer
                  "
                >
                  <span className="text-sm">{num}</span>
                </Radio.Root>
              ))}
            </RadioGroup>
          </div> */}
    
          <div>
            <p className="text-sm font-medium mb-3 text-slate-600 dark:text-slate-300">尺寸</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1">
                <span className="w-8 text-slate-500">W</span>
                <div className="w-full px-3 py-2 rounded-sm border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 select-none">
                  {currentSize?.width ?? '-'}
                </div>
              </div>
              <div className="flex items-center flex-1">
                <span className="w-8 text-slate-500">H</span>
                <div className="w-full px-3 py-2 rounded-sm border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 select-none">
                  {currentSize?.height ?? '-'}
                </div>
              </div>
              <span className="text-slate-500 w-10">PX</span>
            </div>
          </div>
        </div>
      }
      {
        activeTab === MODEL_LAN_TYPE.video && <div className="w-full p-0 space-y-6 text-slate-800 dark:text-slate-100">
          {/* 选择比例 */}
          <div>
            <p className="text-sm font-medium mb-3 text-slate-600 dark:text-slate-300">选择比例</p>
            <RadioGroup
              value={videoRatio}
              onValueChange={handleVideoRatioChange}
              className="grid grid-cols-6 gap-[2px] bg-black/5 p-[2px] rounded-sm"
            >
              {videoOptions.map(option => (
                <Radio.Root
                  key={option.value}
                  value={option.value}
                  className="
                    flex flex-col items-center justify-between h-full py-3 px-2 rounded-sm
                    data-[checked]:bg-white/64 dark:data-[checked]:bg-white/15 data-[checked]:shadow-sm
                    hover:bg-white/64 dark:hover:bg-white/15 transition-colors cursor-pointer
                  "
                >
                  {/* 1. 包裹一层固定高度的 div，确保所有图标都在同一水平线上 */}
                  <div className="flex h-6 mb-2 w-full items-center justify-center">
                    {option.icon}
                  </div>
                  
                  {/* 2. 文字部分 */}
                  <span className="text-xs leading-none">{option.label}</span>
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
    
          <div>
            <p className="text-sm font-medium mb-3 text-slate-600 dark:text-slate-300">选择分辨率</p>
            <RadioGroup
              value={videoSize}
              onValueChange={handleVideoSizeChange}
              className="grid grid-cols-3 gap-[2px] bg-black/5 p-[2px] rounded-sm"
            >
              {videoResolutionOptions.map(opt => (
                <Radio.Root
                  key={opt.value}
                  value={opt.value}
                  className="
                    flex flex-row items-center justify-center gap-2 py-[0.7rem] px-2 rounded-sm
                    data-[checked]:bg-white/64 dark:data-[checked]:bg-white/15 data-[checked]:shadow-sm
                    hover:bg-white/64 dark:hover:bg-white/15 transition-colors cursor-pointer
                  "
                >
                  <span>{opt.label}</span>
                  {opt?.plus && <Sparkle size={10} stroke="#3b82f6" fill="#3b82f6" />}
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
    
          {/* <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">选择生成数量</p>
            </div>
            <RadioGroup
              value={String(videoGenCount)}
              onValueChange={(v)=>setVideoGenCount(Number(v))}
              className="grid grid-cols-4 gap-[2px] bg-black/5 p-[2px] rounded-sm"
            >
              {[1,2,3,4].map(num => (
                <Radio.Root
                  key={num}
                  value={String(num)}
                  className="
                    flex flex-row items-center justify-center gap-2 py-[0.6rem] px-2 rounded-sm
                    data-[checked]:bg-white/64 dark:data-[checked]:bg-white/15 data-[checked]:shadow-sm
                    hover:bg-white/64 dark:hover:bg-white/15 transition-colors cursor-pointer
                  "
                >
                  <span className="text-sm">{num}</span>
                </Radio.Root>
              ))}
            </RadioGroup>
          </div> */}
    
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">选择视频生成时长</p>
            </div>
            <div className='flex flex-row gap-5'>
              <div className='flex-1'>
                <Slider
                  className='py-1.5'
                  // disabled={disabled || !enabled}
                  max={15}
                  min={0}
                  onValueChange={handleVideoDurationChange}
                  step={1}
                  value={videoDuration}
                />
                <div className='flex flex-row justify-between text-xm'>
                  <span>0s</span>
                  <span>15s</span>
                </div>
              </div>
              <div>{`${videoDuration} s`}</div>
            </div>
          </div>
        </div>
      }
    </div>
  )
}

export function PlaygroundParameterPanel(props: PlaygroundParameterPanelProps) {
  const { activeTab } = props
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const activeCount = PLAYGROUND_PARAMETER_CONTROLS.filter(
    (control) => props.parameterEnabled[control.key]
  ).length

  const trigger = (
    <PromptInputButton
      aria-label={t('Parameters')}
      className='text-muted-foreground hover:text-foreground hover:bg-muted/70 relative font-medium'
      disabled={props.disabled}
      variant='ghost'
    >
      <SlidersHorizontalIcon size={16} />
      <span className='bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] leading-none font-semibold'>
        {activeCount}
      </span>
    </PromptInputButton>
  )

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger render={trigger} />
        <SheetContent
          className='max-h-[85vh] overflow-hidden rounded-t-xl'
          side='bottom'
        >
          <SheetHeader>
            <SheetTitle>{t('Parameter settings')}</SheetTitle>
          </SheetHeader>
          <PlaygroundParameterContent {...props} compact />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} style={{ zIndex: 10000 }}>
          <Popover.Popup>
            <div className={cn('bg-white dark:bg-muted border border-border/70 gap-3 flex flex-col p-2.5 rounded-lg text-sm shadow-md outline-hidden duration-100',
                activeTab === MODEL_LAN_TYPE.text ? 'w-[22rem]' : activeTab === 1 ? 'w-[36rem]' : 'w-[24rem]'
              )}>
              <div className='space-y-1 px-1'>
                <div className='text-sm font-semibold'>{t('Parameter settings')}</div>
                <div className='text-muted-foreground text-xs leading-4'>
                  {t('Only enabled parameters are sent with the request.')}
                </div>
              </div>
              <PlaygroundParameterContent {...props} />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

