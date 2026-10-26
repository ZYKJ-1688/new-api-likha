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
import type { ChatCompletionResponse, MessageRole } from '../../types'

const BASE64_IMAGE_URI_PREFIX = 'data:image/png;base64,'

type ImageGenerationItem = {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object'
}

/**
 * 图片接口返回的是 OpenAI images 结构（{ created, data: [{ url }] }），
 * 且网关外面还包了一层 { success, message, data } 信封，这里统一剥掉。
 */
function unwrapImageGenerationPayload(response: unknown): unknown {
  if (!isRecord(response)) return response

  // 已经是 chat completion 结构，或 data 本身就是图片数组 → 不用再剥
  if (Array.isArray(response.choices) || Array.isArray(response.data)) {
    return response
  }

  // { success, message, data: { created, data: [...] } }
  return response.data
}

function toImageMarkdown(item: ImageGenerationItem): string | null {
  const url = typeof item.url === 'string' ? item.url.trim() : ''
  if (url) {
    return `![${getImageAltText(item)}](${url})`
  }

  const base64 = typeof item.b64_json === 'string' ? item.b64_json.trim() : ''
  if (base64) {
    return `![${getImageAltText(item)}](${BASE64_IMAGE_URI_PREFIX}${base64})`
  }

  return null
}

function getImageAltText(item: UnknownRecord): string {
  const alt = typeof item.revised_prompt === 'string' ? item.revised_prompt : ''
  // 转义 markdown 链接里会破坏语法的字符
  return alt.replace(/[[\]()]/g, '').trim()
}

/**
 * 把图片生成接口的响应转换成 chat completion 结构，
 * 让下游的 applyChatCompletionResponse 之类逻辑无需关心图片接口的特殊格式。
 * 无法解析出任何图片时返回 null。
 */
export function normalizeImageGenerationResponse(
  response: unknown
): ChatCompletionResponse | null {
  const payload = unwrapImageGenerationPayload(response)
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null
  }

  const markdownItems = (payload.data as ImageGenerationItem[])
    .map(toImageMarkdown)
    .filter((item): item is string => Boolean(item))

  if (markdownItems.length === 0) {
    return null
  }

  const created =
    typeof payload.created === 'number' ? payload.created : Math.floor(Date.now() / 1000)

  return {
    id: '',
    object: 'chat.completion',
    created,
    model: typeof payload.model === 'string' ? payload.model : '',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as MessageRole,
          content: markdownItems.join('\n\n'),
        },
        finish_reason: 'stop',
      },
    ],
  }
}
