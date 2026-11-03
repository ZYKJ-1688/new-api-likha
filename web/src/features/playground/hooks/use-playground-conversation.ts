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
import { useCallback, useState } from 'react'
import {
  appendUserMessagePair,
  applyMessageEdit,
  createRegeneratedMessages,
  removeMessageByKey,
  resolveRegeneratePrompt,
  MessageStateUpdater
} from '../lib'
import type { Message, PlaygroundConfig } from '../types'
import { MODEL_LAN_TYPE } from '../constants'

type UsePlaygroundConversationOptions = {
  messages: Message[]
  updateMessages: (updater: MessageStateUpdater) => void
  sendChat: (msgs: Message[], prompt?: string) => void
  config: Pick<PlaygroundConfig, 'type'>
}

export function usePlaygroundConversation({
  messages,
  updateMessages,
  sendChat,
  config,
}: UsePlaygroundConversationOptions) {
  const [editingMessageKey, setEditingMessageKey] = useState<string | null>(
    null
  )

  // 图片 / 视频模式需要把原始提示词单独带进请求（并记在 version 上），
  // 文字模式走 messages 数组即可
  const needsPrompt = config.type === MODEL_LAN_TYPE.image || config.type === MODEL_LAN_TYPE.video

  // 统一的「先落消息、再发请求」，发送 / 重新生成 / 编辑提交共用
  const commitAndSend = useCallback(
    (nextMessages: Message[], prompt?: string) => {
      updateMessages(nextMessages)

      if (prompt) {
        sendChat(nextMessages, prompt)
        return
      }

      sendChat(nextMessages)
    },
    [updateMessages, sendChat]
  )

  // 点击发送
  // images：文字模式下用户随输入框上传的图片（OSS 地址），挂到 user 消息 version 上
  const handleSendMessage = useCallback(
    (text: string, images?: string[]) => {
      if (!text.trim() && !(images && images.length > 0)) return

      // 图片 / 视频模式：把本次 prompt 直接写进新建的 user / assistant 两个 version，
      // 而不是去回填历史消息（回填会把旧轮次的 prompt 覆盖成本次 text）。
      const prompt = needsPrompt ? text : undefined
      const nextMessages = appendUserMessagePair(messages, text, prompt, images)
      if (!nextMessages) return

      commitAndSend(nextMessages, prompt)
    },
    [messages, commitAndSend, needsPrompt]
  )

  // 重新生成
  const handleRegenerateMessage = useCallback(
    (message: Message) => {
      // 先解析 prompt，再拿它去创建 assistant 占位消息，
      // 否则新生成的 assistant version 天生就没有 prompt。
      const prompt = needsPrompt
        ? resolveRegeneratePrompt(messages, message.key)
        : undefined

      // 图片 / 视频模式下拿不到 prompt 就不发：
      // 请求体里会只剩 model / group，后端必然报错，界面还会卡在 loading
      if (needsPrompt && !prompt) return

      const nextMessages = createRegeneratedMessages(
        messages,
        message.key,
        prompt
      )
      if (!nextMessages) return

      commitAndSend(nextMessages, prompt)
    },
    [messages, commitAndSend, needsPrompt]
  )

  const handleEditMessage = useCallback((message: Message) => {
    setEditingMessageKey(message.key)
  }, [])

  const handleEditOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingMessageKey(null)
    }
  }, [])

  const applyEdit = useCallback(
    (newContent: string, shouldSubmit: boolean) => {
      if (!editingMessageKey) return

      const editResult = applyMessageEdit(
        messages,
        editingMessageKey,
        newContent,
        shouldSubmit,
        needsPrompt ? newContent : undefined
      )
      if (!editResult) return

      setEditingMessageKey(null)

      if (editResult.shouldSend) {
        // commitAndSend 内部会落一次消息，这里不要再 updateMessages 一遍
        commitAndSend(editResult.messages, needsPrompt ? newContent : undefined)
        return
      }

      updateMessages(editResult.messages)
    },
    [editingMessageKey, messages, updateMessages, commitAndSend, needsPrompt]
  )

  const handleDeleteMessage = useCallback(
    (message: Message) => {
      updateMessages((previousMessages) =>
        removeMessageByKey(previousMessages, message.key)
      )
    },
    [updateMessages]
  )

  return {
    editingMessageKey,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
  }
}
