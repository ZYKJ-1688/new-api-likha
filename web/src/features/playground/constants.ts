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
import type { PlaygroundConfig, ParameterEnabled } from './types'

// Message constants
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const

export const MESSAGE_STATUS = {
  LOADING: 'loading',
  STREAMING: 'streaming',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const

// API endpoints
export const API_ENDPOINTS = {
  CHAT_COMPLETIONS: '/pg/chat/completions',
  CHAT_IMAGE_GENERATIONS: '/pg/images/generations',
  CHAT_VIDEO_GENERATIONS: '/pg/videos',
  USER_MODELS: '/api/user/models',
  USER_GROUPS: '/api/user/self/groups',
} as const

export const MODEL_LAN_TYPE = {
  text: 0,
  image: 1,
  video: 2,
}

export const CREATE_MODEL_TYPE = {
  almighty: 1,
  headAndTail: 2,
}

// Default group — uses 'default' as the safe fallback; auto-group is
// only selected when the backend confirms it is available for the user.
export const DEFAULT_GROUP = 'default' as const

// 图片模式默认参数，对应参数面板默认选项：1.5K + 1:1，生成 1 张
export const DEFAULT_IMAGE_SIZE = '1536x1536'
export const DEFAULT_IMAGE_COUNT = 1

// 视频模式默认参数，对应参数面板默认选项：480p + 4s + 16:9
export const DEFAULT_VIDEO_SIZE = '480p'
export const DEFAULT_VIDEO_DURATION = 4
export const DEFAULT_VIDEO_RATIO = '16:9'

// Default configuration
export const DEFAULT_CONFIG: PlaygroundConfig = {
  model: 'gpt-4o',
  group: DEFAULT_GROUP,
  temperature: 0.7,
  top_p: 1,
  max_tokens: 4096,
  frequency_penalty: 0,
  presence_penalty: 0,
  seed: null,
  stream: true,
  type: 0,
  size: DEFAULT_IMAGE_SIZE,
  n: DEFAULT_IMAGE_COUNT,
  videoSize: DEFAULT_VIDEO_SIZE,
  videoDuration: DEFAULT_VIDEO_DURATION,
  ratio: DEFAULT_VIDEO_RATIO,
  createVideoMode: CREATE_MODEL_TYPE.almighty,
}

export const DEFAULT_PARAMETER_ENABLED: ParameterEnabled = {
  temperature: true,
  top_p: true,
  max_tokens: false,
  frequency_penalty: true,
  presence_penalty: true,
  seed: false,
}

// Storage keys
export const STORAGE_KEYS = {
  CONFIG: 'playground_config',
  PARAMETER_ENABLED: 'playground_parameter_enabled',
  MESSAGES: 'playground_messages', // 旧key，用于迁移
  MESSAGES_TEXT: 'playground_messages_text',
  MESSAGES_IMAGE: 'playground_messages_image',
  MESSAGES_VIDEO: 'playground_messages_video',
  // 视频是异步任务：提交成功后把 task_id 记下来，
  // 用户离开页面（或刷新）后再回来可以接着轮询同一个任务
  PENDING_VIDEO_TASKS: 'playground_pending_video_tasks',
} as const

// Error messages
export const ERROR_MESSAGES = {
  API_REQUEST_ERROR: 'Request error occurred',
  NETWORK_ERROR: 'Network connection failed or server not responding',
  PARSE_ERROR: 'Error parsing response data',
  STREAM_START_ERROR: 'Error establishing connection',
  CONNECTION_CLOSED: 'Connection closed',
  INTERRUPTED: 'Generation was interrupted',
} as const

// Message action button styles
export const MESSAGE_ACTION_BUTTON_STYLES = {
  BASE: 'size-7 text-muted-foreground hover:text-foreground',
  DELETE: 'size-7 text-muted-foreground hover:text-destructive',
  ICON: 'size-4',
} as const

// Message action labels
export const MESSAGE_ACTION_LABELS = {
  COPY: 'Copy',
  COPIED: 'Copied!',
  REGENERATE: 'Regenerate',
  SHOW_PREVIEW: 'Show preview',
  SHOW_SOURCE: 'Show source',
  EDIT: 'Edit',
  DELETE: 'Delete',
  NO_CONTENT: 'No content to copy',
  WAIT_GENERATION: 'Please wait for the current generation to complete',
} as const
