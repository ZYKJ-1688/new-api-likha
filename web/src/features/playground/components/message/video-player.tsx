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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Download01Icon, ViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Loader } from '@/components/ai-elements/loader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const DEFAULT_VIDEO_FILE_NAME = 'video.mp4'
const MAX_CONTAINER_HEIGHT = 420

type VideoPlayerProps = {
  className?: string
  src: string
}

function getVideoFileName(src: string): string {
  const withoutQuery = src.split(/[?#]/)[0]
  const lastSegment = withoutQuery.split('/').pop()

  if (lastSegment && lastSegment.includes('.')) {
    return lastSegment
  }

  return DEFAULT_VIDEO_FILE_NAME
}

/**
 * 生成结果的视频播放器。
 * 地址一般来自对象存储，可能被 CORS / 签名过期拦掉，所以保留
 * 「新标签页打开」作为兜底，避免用户点了下载却没有任何反应。
 */
export function VideoPlayer({ className, src }: VideoPlayerProps) {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false)

  // 换地址（重新生成）时重置状态，否则新视频会沿用上一次的失败态
  useEffect(() => {
    setHasError(false)
    setIsMetadataLoaded(false)
  }, [src])

  const openInNewTab = useCallback(() => {
    window.open(src, '_blank', 'noopener,noreferrer')
  }, [src])

  const download = useCallback(async () => {
    const fileName = getVideoFileName(src)

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
      // 跨域 fetch 失败时退化成新标签页打开
      openInNewTab()
    }
  }, [openInNewTab, src])

  return (
    <div
      className={cn(
        'border-border/70 bg-muted/30 w-full max-w-lg overflow-hidden rounded-xl border',
        className
      )}
    >
      {hasError ? (
        <div className='flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-8'>
          <span className='text-muted-foreground text-sm'>
            {t('Video failed to load')}
          </span>
          <Button onClick={openInNewTab} size='sm' variant='outline'>
            <HugeiconsIcon icon={ViewIcon} />
            {t('Open in new tab')}
          </Button>
        </div>
      ) : (
        <div className='relative bg-black'>
          <video
            className='block w-full object-contain'
            controls
            onError={() => setHasError(true)}
            onLoadedMetadata={() => setIsMetadataLoaded(true)}
            playsInline
            preload='metadata'
            src={src}
            style={{ maxHeight: MAX_CONTAINER_HEIGHT }}
          />
          {!isMetadataLoaded && (
            <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
              <Loader className='text-white/80' size={20} />
            </div>
          )}
        </div>
      )}

      <div className='border-border/70 flex items-center gap-2 border-t px-2 py-1'>
        <span
          className='text-muted-foreground min-w-0 flex-1 truncate text-xs'
          title={src}
        >
          {getVideoFileName(src)}
        </span>
        {/* <Button
          aria-label={t('Open in new tab')}
          onClick={openInNewTab}
          size='icon-sm'
          title={t('Open in new tab')}
          variant='ghost'
        >
          <HugeiconsIcon icon={ViewIcon} />
        </Button> */}
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
    </div>
  )
}
