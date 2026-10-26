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
import { MESSAGE_STATUS } from '../../constants'
import type { Message } from '../../types'
import { completeAssistantTiming } from '../message/message-timing-utils'
import { updateCurrentVersionContent } from '../message/message-utils'

/**
 * 视频接口（/pg/videos）返回的是可播放地址本身，不是 chat completion 结构，
 * 所以视频模式不能走 applyChatCompletionResponse，这里单独收口成 Message：
 * - version.content 存地址，方便复制 / 查看原始响应
 * - message.media 存播放信息，由播放器消费
 */
export function extractVideoUrl(response: unknown): string | null {
  if (typeof response !== 'string') {
    return null
  }

  const url = response.trim()
  return url.length > 0 ? url : null
}

export function applyVideoGenerationResponse(
  message: Message,
  url: string
): Message {
  return completeAssistantTiming({
    ...updateCurrentVersionContent(message, url),
    media: {
      type: 'video',
      url,
    },
    isContentComplete: true,
    isReasoningStreaming: false,
    status: MESSAGE_STATUS.COMPLETE,
  })
}
