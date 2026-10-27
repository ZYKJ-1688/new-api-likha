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
import type {
  Message,
  PlaygroundConfig,
  ParameterEnabled,
} from '../../types'
import { MODEL_LAN_TYPE } from '../../constants'
import { formatMessageForAPI, isValidMessage } from '../message/message-utils'

/**
 * 图片模式的生成数量固定为 1（面板上的「选择生成数量」已下线），
 * 不再读取 config.n，避免历史/持久化配置把数量带成别的值。
 */
const FIXED_IMAGE_COUNT = 1

/**
 * image 是否有有效值：空字符串 / 空数组都视为没有值，不参与请求
 */
export function hasImagePayloadValue(
  image?: string | string[] | null
): boolean {
  if (Array.isArray(image)) return image.length > 0
  return typeof image === 'string' && image.trim().length > 0
}

/**
 * Build API request payload from messages and config
 */
export function buildChatCompletionPayload(
  messages: Message[],
  config: PlaygroundConfig,
  parameterEnabled: ParameterEnabled,
  prompt?: string,
): any {
  // Filter and format valid messages
  const processedMessages = messages
    .filter(isValidMessage)
    .map(formatMessageForAPI)

  const payload: any = {
    model: config.model,
    group: config.group,
  }

  if (config.type === MODEL_LAN_TYPE.text) {
    payload.messages = processedMessages
    payload.stream = config.stream

    if (parameterEnabled.temperature) payload.temperature = config.temperature
  
    if (parameterEnabled.top_p) payload.top_p = config.top_p
  
    if (parameterEnabled.max_tokens) payload.max_tokens = config.max_tokens
  
    if (parameterEnabled.frequency_penalty) payload.frequency_penalty = config.frequency_penalty
  
    if (parameterEnabled.presence_penalty) payload.presence_penalty = config.presence_penalty
  
    if (parameterEnabled.seed && config.seed !== null) payload.seed = config.seed
    
  } else if (config.type === MODEL_LAN_TYPE.image && prompt) {
    payload.prompt = prompt

    if (config.size) payload.size = config.size

    // 图片模式生成数量固定为 1，不再跟随 config.n（面板上那一项已下线）
    payload.n = FIXED_IMAGE_COUNT

    // image 只在有值时才作为入参
    if (hasImagePayloadValue(config.image)) payload.image = config.image

  } else if (config.type === MODEL_LAN_TYPE.video) {
    if (prompt) payload.prompt = prompt

    // 视频分辨率 / 时长 / 比例只在这个分支写入，文字 / 图片模式的请求体不会带上
    if (config.videoSize) payload.resolution = config.videoSize
    if (config.videoDuration !== undefined) payload.duration = config.videoDuration
    if (config.ratio) payload.ratio = config.ratio

    // 视频模式下用metadata字段
    if (config.metadata) payload.metadata = config.metadata
  }

  return payload
}
