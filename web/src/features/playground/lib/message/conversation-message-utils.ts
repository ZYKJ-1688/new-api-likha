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
import { MESSAGE_ROLES } from '../../constants'
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
import type { Message } from '../../types'
import {
  createLoadingAssistantMessage,
  createUserMessage,
  getMessageContent,
  updateCurrentVersionContent,
} from './message-utils'

type ApplyMessageEditResult = {
  messages: Message[]
  shouldSend: boolean
}

type ChatMessageRenderState = {
  alwaysShowActions: boolean
  content: string
  isEditing: boolean
}

/**
 * 追加一条 user 消息 + 一条待生成的 assistant 占位消息。
 * `prompt` 用于图片/视频模式：这两条消息的 version 都要记住本次的原始提示词，
 * 否则 assistant 的 content 被替换成图片 markdown 后，重新生成时取不到 prompt。
 */
export function appendUserMessagePair(
  messages: Message[],
  content: string,
  prompt?: string
): Message[] {
  const submittedAt = Date.now()

  return [
    ...messages,
    createUserMessage(content, submittedAt, prompt),
    createLoadingAssistantMessage(submittedAt, prompt),
  ]
}

/**
 * 重新生成：整体复用 `prompt`，否则新生成的 assistant 占位消息会丢失 prompt，
 * 导致下一次「重新生成」只能退化成用 content（图片 markdown）当 prompt。
 */
export function createRegeneratedMessages(
  messages: Message[],
  messageKey: string,
  prompt?: string
): Message[] | null {
  const messageIndex = messages.findIndex(
    (message) => message.key === messageKey
  )

  if (messageIndex === -1) {
    return null
  }

  if (messages[messageIndex].from === MESSAGE_ROLES.USER) {
    return [
      ...messages.slice(0, messageIndex + 1),
      createLoadingAssistantMessage(undefined, prompt),
    ]
  }

  return [
    ...messages.slice(0, messageIndex),
    createLoadingAssistantMessage(undefined, prompt),
  ]
}

// export function lastChatPrompt(
//   messages: Message[],
//   messageKey: string
// ): Message[] | null {


// }

export function removeMessageByKey(
  messages: Message[],
  messageKey: string
): Message[] {
  return messages.filter((message) => message.key !== messageKey)
}

/**
 * 解析「重新生成」时应该使用的 prompt。
 * 优先级：目标消息自身 version 上记录的 prompt → 向前最近的 user 消息的 prompt → 其 content。
 * 注意：绝不回退到 assistant 自己的 content —— 图片模式下那是 markdown 图片/视频地址，
 * 把它当 prompt 发出去是错的（这正是之前「请求时用的是 content 字段」的原因）。
 */
export function resolveRegeneratePrompt(
  messages: Message[],
  messageKey: string
): string {
  const messageIndex = messages.findIndex(
    (message) => message.key === messageKey
  )
  const target = messageIndex >= 0 ? messages[messageIndex] : undefined
  const targetPrompt = target?.versions?.[0]?.prompt
  if (targetPrompt) {
    return targetPrompt
  }

  const startIndex = messageIndex >= 0 ? messageIndex : messages.length - 1
  for (let index = startIndex; index >= 0; index--) {
    const item = messages[index]
    if (item.from !== MESSAGE_ROLES.USER) continue
    const version = item.versions?.[0]
    return version?.prompt || version?.content || ''
  }

  return ''
}

export function getPreviousUserMessage(
  messages: Message[],
  beforeIndex: number
): Message | null {
  for (let index = beforeIndex - 1; index >= 0; index--) {
    if (messages[index].from === MESSAGE_ROLES.USER) {
      return messages[index]
    }
  }

  return null
}

export function applyMessageEdit(
  messages: Message[],
  messageKey: string,
  content: string,
  shouldSubmit: boolean,
  prompt?: string
): ApplyMessageEditResult | null {
  const submittedAt = Date.now()
  const messageIndex = messages.findIndex(
    (message) => message.key === messageKey
  )

  if (messageIndex === -1) {
    return null
  }

  const updatedMessages = messages.map((message) =>
    message.key === messageKey
      ? {
          ...updateCurrentVersionContent(message, content),
          createdAt: shouldSubmit ? submittedAt : message.createdAt,
        }
      : message
  )

  if (
    !shouldSubmit ||
    updatedMessages[messageIndex].from !== MESSAGE_ROLES.USER
  ) {
    return { messages: updatedMessages, shouldSend: false }
  }

  return {
    messages: [
      ...updatedMessages.slice(0, messageIndex + 1),
      createLoadingAssistantMessage(submittedAt, prompt),
    ],
    shouldSend: true,
  }
}

export function getEditingMessageContent(
  messages: Message[],
  editingKey?: string | null
): string {
  if (!editingKey) {
    return ''
  }

  const message = messages.find((item) => item.key === editingKey)
  return message ? getMessageContent(message) : ''
}

export function getChatMessageRenderState(
  messages: Message[],
  message: Message,
  messageIndex: number,
  editingKey?: string | null
): ChatMessageRenderState {
  return {
    alwaysShowActions:
      messageIndex === messages.length - 1 &&
      message.from === MESSAGE_ROLES.ASSISTANT,
    content: getMessageContent(message),
    isEditing: editingKey === message.key,
  }
}
