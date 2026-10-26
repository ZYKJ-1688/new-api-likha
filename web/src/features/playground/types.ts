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
// Message types
export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'loading' | 'streaming' | 'complete' | 'error'

export type PlaygroundMessageLayoutMode = 'alternating' | 'left'

export interface MessageVersion {
  id: string
  content: string
  prompt?: string
}

export interface Message {
  key: string
  from: MessageRole
  versions: MessageVersion[]
  createdAt?: number
  startedAt?: number
  completedAt?: number
  durationMs?: number
  sources?: { href: string; title: string }[]
  reasoning?: {
    content: string
    duration: number
    startedAt?: number
    completedAt?: number
    durationMs?: number
  }
  isReasoningStreaming?: boolean
  isReasoningComplete?: boolean
  isContentComplete?: boolean
  status?: MessageStatus
  errorCode?: string | null
  media?: {
    type: 'image' | 'video'
    url?: string
    file?: File
  }
}

// 会话Tab类型
export type ConversationTab = 0 | 1 | 2

// API payload types
export interface ChatCompletionMessage {
  role: MessageRole
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
}

export interface ChatCompletionRequest {
  model: string
  group?: string
  messages: ChatCompletionMessage[]
  stream: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  prompt?: string
  // 图片模式入参：生成图片尺寸，形如 "1024x1024"
  // 视频模式复用同一个 key，值是 "480p" / "720p" / "1080p"
  size?: string
  // 仅图片模式入参：生成图片数量
  n?: number
  // 仅视频模式入参：生成时长（秒）
  duration?: number
  // 仅视频模式入参：画面比例，形如 "16/9"
  ratio?: string
  // 图片 / 视频模式入参：参考图（单张为字符串，多张为字符串数组）
  image?: string | string[]
  // 仅视频模式：参考图 / 首尾帧的结构化入参
  metadata?: { content: Array<{ type: string; image_url: { url: string }; role: string }> }
}

// Configuration types
export interface PlaygroundConfig {
  model: string
  group: string
  temperature: number
  top_p: number
  max_tokens: number
  frequency_penalty: number
  presence_penalty: number
  seed: number | null
  stream: boolean
  type: number
  prompt?: any
  // 仅图片模式使用的参数（文字/视频模式不参与请求）
  size?: string
  n?: number
  // 仅视频模式使用的参数（与图片模式的 size 同名不同义，故分开存，
  // 避免切 tab 时把 "1536x1536" 当成视频分辨率发出去）
  videoSize?: string
  videoDuration?: number
  // 仅视频模式使用：画面比例，形如 "16/9"
  ratio?: string
  // 仅图片 / 视频模式使用：输入框里上传的参考图
  // 单张时为字符串，多张时为字符串数组；空值不参与请求
  image?: string | string[]
  // 仅视频模式使用：参考模式，0=全能参考，1=首尾帧
  createVideoMode?: number
  // 仅视频模式使用：图片字段
  metadata?: { content: Array<{ type: string; image_url: { url: string }; role: string }> }
}

export interface ChatCompletionChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: MessageRole
      content?: string
      reasoning_content?: string
    }
    finish_reason: string | null
  }>
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: MessageRole
      content: string
      reasoning_content?: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ParameterEnabled {
  temperature: boolean
  top_p: boolean
  max_tokens: boolean
  frequency_penalty: boolean
  presence_penalty: boolean
  seed: boolean
}

// Model and group options
export interface ModelOption {
  label: string
  value: string
}

export interface GroupOption {
  label: string
  value: string
  ratio: number
  desc?: string
}
