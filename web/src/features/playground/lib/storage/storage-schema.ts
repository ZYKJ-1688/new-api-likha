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
import { z } from 'zod'

export const STORAGE_VERSION = 1
export const MAX_STORED_MESSAGES = 100
export const MAX_STORED_MESSAGES_BYTES = 1024 * 1024
export const MAX_LOADED_MESSAGES_CHARS = 120_000
export const MAX_LOADED_MESSAGE_CHARS = 40_000

export const playgroundConfigSchema = z.object({
  model: z.string().optional(),
  group: z.string().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  seed: z.number().nullable().optional(),
  stream: z.boolean().optional(),
  size: z.string().optional(),
  n: z.number().optional(),
  // 视频模式参数与图片模式分开存，否则 zod 会在 saveConfig 时剥掉
  videoSize: z.string().optional(),
  videoDuration: z.number().optional(),
  ratio: z.string().optional(),
  image: z.union([z.string(), z.array(z.string())]).optional(),
  metadata: z.object({
    content: z.array(z.object({
      type: z.string(),
      image_url: z.object({ url: z.string() }),
      role: z.string(),
    })),
  }).optional(),
})

export const parameterEnabledSchema = z.object({
  temperature: z.boolean().optional(),
  top_p: z.boolean().optional(),
  max_tokens: z.boolean().optional(),
  frequency_penalty: z.boolean().optional(),
  presence_penalty: z.boolean().optional(),
  seed: z.boolean().optional(),
})

const messageRoleSchema = z.enum(['user', 'assistant', 'system'])
const messageStatusSchema = z.enum([
  'loading',
  'streaming',
  'complete',
  'error',
])

const messageVersionSchema = z.object({
  id: z.string(),
  content: z.string(),
  // 图片/视频模式下会把原始 prompt 存进每个 version，
  // 缺失该字段会导致 zod 在 parse 时把 prompt 剥掉（zod 默认丢弃未知 key）
  prompt: z.string().optional(),
})

const sourceSchema = z.object({
  href: z.string(),
  title: z.string(),
})

const reasoningSchema = z.object({
  content: z.string(),
  duration: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  durationMs: z.number().optional(),
})

// 生成类结果（图片 / 视频）的播放信息。
// media.file 是运行时的 File 对象，无法序列化，这里只落 url。
const mediaSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().optional(),
})

const messageSchema = z.object({
  key: z.string(),
  from: messageRoleSchema,
  versions: z.array(messageVersionSchema).min(1),
  createdAt: z.number().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  durationMs: z.number().optional(),
  sources: z.array(sourceSchema).optional(),
  reasoning: reasoningSchema.optional(),
  isReasoningStreaming: z.boolean().optional(),
  isReasoningComplete: z.boolean().optional(),
  isContentComplete: z.boolean().optional(),
  status: messageStatusSchema.optional(),
  errorCode: z.string().nullable().optional(),
  media: mediaSchema.optional(),
})

export const messagesSchema = z.array(messageSchema)
