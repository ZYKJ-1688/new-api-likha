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
import { useCallback, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { Loader } from '@/components/ai-elements/loader'
import { MessageContent } from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import { cn } from '@/lib/utils'

import { MESSAGE_STATUS } from '../../constants'
import {
  getMessageAlignmentClass,
  getMessageContentState,
  isErrorMessage,
  type MessageAlignment,
} from '../../lib'
import { getMessageContentStyles } from '../../lib/message/message-styles'
import type { Message, PlaygroundConfig } from '../../types'
import { ImagePreviewDialog } from './image-preview-dialog'
import { MessageError } from './message-error'
import { MessageMetadata } from './message-metadata'
import { VideoPlayer } from './video-player'

type PlaygroundMessageContentProps = {
  config: PlaygroundConfig
  actions: ReactNode
  alignment: MessageAlignment
  errorActions?: ReactNode
  isSourceVisible?: boolean
  message: Message
  versionContent: string
}

export function PlaygroundMessageContent({
  config,
  actions,
  alignment,
  errorActions,
  isSourceVisible = false,
  message,
  versionContent,
}: PlaygroundMessageContentProps) {
  const { t } = useTranslation()
  const {
    displayContent,
    hasReasoning,
    hasSources,
    reasoningContent,
    showLoader,
    showMessageContent,
    sources,
  } = getMessageContentState(message, versionContent)
  const isError = isErrorMessage(message)
  const isMessageFinal =
    message.status !== MESSAGE_STATUS.LOADING &&
    message.status !== MESSAGE_STATUS.STREAMING

  // 视频生成结果存在 media 上，播放器直接消费它；
  // 「查看原始响应」时仍然看文本，所以把它排在最前面
  const mediaVideoUrl =
    message.media?.type === 'video' ? message.media.url : undefined
  const showVideoPlayer = Boolean(mediaVideoUrl) && !isSourceVisible

  const [preview, setPreview] = useState<{ alt: string; src: string } | null>(
    null
  )

  // 消息正文里的图片走事件委托，避免改动 ai-elements 里共享的 markdown 渲染器
  const handleContentClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const image = target?.closest('img')
    if (!image) return

    const src = image.getAttribute('src')
    if (!src) return

    setPreview({ src, alt: image.getAttribute('alt') ?? '' })
  }, [])

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col',
        getMessageAlignmentClass(alignment)
      )}
    >
      {hasSources && (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source
                href={source.href}
                key={`${source.href}-${source.title}`}
                title={source.title}
              />
            ))}
          </SourcesContent>
        </Sources>
      )}

      {hasReasoning && (
        <Reasoning
          defaultOpen={false}
          duration={message.reasoning?.duration}
          isStreaming={message.isReasoningStreaming}
        >
          <ReasoningTrigger />
          <ReasoningContent>{reasoningContent}</ReasoningContent>
        </Reasoning>
      )}

      {showLoader && (
        <div className='flex items-center gap-2 py-2'>
          <Loader />
          <Shimmer className='text-sm' duration={1}>
            {config.type === 0 ? t('Responding...') : t('GenerateIng')}
          </Shimmer>
        </div>
      )}

      {isError && (
        <>
          <MessageError message={message} className='mb-2' />
          <MessageMetadata alignment={alignment} message={message} />
          {errorActions}
        </>
      )}

      {!isError && (showMessageContent || showVideoPlayer) && (
        <>
          {mediaVideoUrl && showVideoPlayer ? (
            <VideoPlayer className='mb-2' src={mediaVideoUrl} />
          ) : (
            <div
              className='group-[.is-assistant]:w-full [&_img]:cursor-zoom-in'
              onClick={handleContentClick}
            >
              {isSourceVisible ? (
                <CodeBlock
                  code={versionContent}
                  className='my-0 group-[.is-assistant]:w-full group-[.is-assistant]:max-w-[78ch]'
                  collapsedLines={24}
                  defaultCollapsed={false}
                  language='markdown'
                  maxExpandedLines={48}
                  showLineNumbers
                  showToolbar
                  title={t('Raw response')}
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
              ) : (
                <MessageContent
                  variant='flat'
                  className={cn(getMessageContentStyles())}
                >
                  <Response final={isMessageFinal}>{displayContent}</Response>
                </MessageContent>
              )}
            </div>
          )}
          <MessageMetadata alignment={alignment} message={message} />
          {actions}
        </>
      )}

      <ImagePreviewDialog
        alt={preview?.alt ?? ''}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        open={preview !== null}
        src={preview?.src ?? ''}
      />
    </div>
  )
}
