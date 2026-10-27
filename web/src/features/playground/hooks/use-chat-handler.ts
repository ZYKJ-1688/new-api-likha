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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'

import { sendChatCompletion, pollVideoTask } from '../api'
import { ERROR_MESSAGES, MESSAGE_ROLES, MESSAGE_STATUS, MODEL_LAN_TYPE } from '../constants'
import {
  clearPendingVideoTasks,
  getPendingVideoTask,
  removePendingVideoTask,
} from '../lib/storage/video-task-store'
import {
  applyStreamingChunk,
  buildChatCompletionPayload,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  parseRequestErrorDetails,
  applyChatCompletionResponse,
  applyVideoGenerationResponse,
  completeAssistantMessage,
  extractVideoUrl,
  hasChatCompletionChoice,
  isAssistantMessageFinal,
  isAssistantMessagePending,
  updateCurrentVersionContent,
} from '../lib'
import type {
  ConversationTab,
  Message,
  PlaygroundConfig,
  ParameterEnabled,
} from '../types'
import { useStreamRequest } from './use-stream-request'

// 视频任务永远落在视频会话里，结果回填时显式指定 tab，
// 避免用户在轮询期间切到别的tab导致结果写错会话
const VIDEO_TAB = MODEL_LAN_TYPE.video as ConversationTab

// 助手占位消息的 createdAt 略早于任务提交时间，留一点误差容限
const VIDEO_TARGET_TOLERANCE_MS = 60_000

/**
 * 找出可以承接这个视频任务结果的那条助手消息。
 * 之所以不用「状态是否为 pending」来判断：切走页面再回来时消息还在内存里、状态仍是 loading；
 * 但如果是刷新页面，sanitizeMessagesOnLoad 会把没有内容的 pending 消息兜底成 ERROR
 * （正文被写成「请求发生错误: 生成已中断」），此时再要求 pending 就永远恢复不了。
 * ERROR 也可以承接——那条消息本来就是这次任务留下的占位。
 */
function getVideoTaskTarget(
  messages: Message[],
  startedAt: number
): Message | null {
  if (messages.length === 0) return null

  const last = messages.at(-1)
  if (last?.from !== MESSAGE_ROLES.ASSISTANT) return null
  // 已经有结果的消息不覆盖
  if (last.media?.url) return null
  // 早于这次任务的消息（上一轮对话）不承接
  if ((last.createdAt ?? 0) < startedAt - VIDEO_TARGET_TOLERANCE_MS) {
    return null
  }

  return last
}

interface UseChatHandlerOptions {
  config: PlaygroundConfig
  parameterEnabled: ParameterEnabled
  onMessageUpdate: (
    updater: (prev: Message[]) => Message[],
    tab?: ConversationTab
  ) => void
  // 视频tab的消息：用来判断还存在「等待中的助手消息」可以承接续轮询结果
  videoMessages?: Message[]
}

const KNOWN_ERROR_MESSAGES = new Set<string>(Object.values(ERROR_MESSAGES))
const STREAM_UPDATE_FLUSH_MS = 50

type PendingStreamChunks = {
  generation: number
  content: string
  reasoning: string
}

function mergePendingStreamChunk(
  currentChunk: string,
  nextChunk: string
): string {
  if (!currentChunk || !nextChunk.startsWith(currentChunk)) {
    return currentChunk + nextChunk
  }

  return nextChunk
}

/**
 * Hook for handling chat message sending and receiving
 */
export function useChatHandler({
  config,
  parameterEnabled,
  onMessageUpdate,
  videoMessages,
}: UseChatHandlerOptions) {
  const { t } = useTranslation()
  const { sendStreamRequest, stopStream, isStreaming } = useStreamRequest()
  const [isRequesting, setIsRequesting] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)
  // 记录已经尝试过续轮询的 task，避免同一任务被重复拉起
  const resumedTaskIdsRef = useRef<Set<string>>(new Set())
  const pendingStreamChunksRef = useRef<PendingStreamChunks>({
    generation: 0,
    content: '',
    reasoning: '',
  })
  const streamFlushTimerRef = useRef<number | null>(null)

  const discardPendingStreamUpdates = useCallback((generation: number) => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current)
      streamFlushTimerRef.current = null
    }
    pendingStreamChunksRef.current = {
      generation,
      content: '',
      reasoning: '',
    }
  }, [])

  const flushStreamUpdates = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
        streamFlushTimerRef.current = null
      }

      const pendingChunks = pendingStreamChunksRef.current
      if (pendingChunks.generation !== generation) return
      if (!pendingChunks.reasoning && !pendingChunks.content) {
        return
      }

      pendingStreamChunksRef.current = {
        generation,
        content: '',
        reasoning: '',
      }
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) => {
          let updatedMessage = message

          if (pendingChunks.reasoning) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'reasoning',
              pendingChunks.reasoning
            )
          }

          if (pendingChunks.content) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'content',
              pendingChunks.content
            )
          }

          return updatedMessage
        })
      })
    },
    [onMessageUpdate]
  )

  const scheduleStreamFlush = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        return
      }

      streamFlushTimerRef.current = window.setTimeout(() => {
        flushStreamUpdates(generation)
      }, STREAM_UPDATE_FLUSH_MS)
    },
    [flushStreamUpdates]
  )

  useEffect(
    () => () => {
      requestGenerationRef.current += 1
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
      }
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    },
    []
  )

  const getDisplayError = useCallback(
    (error: string) => {
      if (KNOWN_ERROR_MESSAGES.has(error)) {
        return t(error)
      }

      const connectionClosedSuffix = `: ${ERROR_MESSAGES.CONNECTION_CLOSED}`
      if (error.endsWith(connectionClosedSuffix)) {
        return `${error.slice(0, -ERROR_MESSAGES.CONNECTION_CLOSED.length)}${t(
          ERROR_MESSAGES.CONNECTION_CLOSED
        )}`
      }

      return error
    },
    [t]
  )

  // Handle stream update
  const handleStreamUpdate = useCallback(
    (generation: number, type: 'reasoning' | 'content', chunk: string) => {
      if (generation !== requestGenerationRef.current) return
      if (pendingStreamChunksRef.current.generation !== generation) return
      pendingStreamChunksRef.current[type] = mergePendingStreamChunk(
        pendingStreamChunksRef.current[type],
        chunk
      )
      scheduleStreamFlush(generation)
    },
    [scheduleStreamFlush]
  )

  // Handle stream complete
  const handleStreamComplete = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) =>
          isAssistantMessageFinal(message)
            ? message
            : completeAssistantMessage(message)
        )
      })
    },
    [flushStreamUpdates, onMessageUpdate]
  )

  // Handle stream error
  // tab 用于把错误写回它所属的会话（视频异步任务的错误要落在视频tab）
  const handleStreamError = useCallback(
    (generation: number, error: string, errorCode?: string, tab?: ConversationTab) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      const displayError = getDisplayError(error)
      handleServerError(new Error(displayError))
      const errorTitle = t(ERROR_MESSAGES.API_REQUEST_ERROR)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateAssistantMessageWithError(
          prev,
          displayError,
          errorCode,
          errorTitle
        )
      }, tab)
    },
    [flushStreamUpdates, getDisplayError, onMessageUpdate, t]
  )

  // Send streaming chat request
  const sendStreamingChat = useCallback(
    (messages: Message[], prompt?: string) => {
      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      discardPendingStreamUpdates(generation)
      setIsRequesting(true)
      const payload = prompt
        ? buildChatCompletionPayload(messages, config, parameterEnabled, prompt)
        : buildChatCompletionPayload(messages, config, parameterEnabled)
      void sendStreamRequest(
        payload,
        (type, chunk) => handleStreamUpdate(generation, type, chunk),
        () => handleStreamComplete(generation),
        (error, errorCode) => handleStreamError(generation, error, errorCode)
      )
    },
    [
      config,
      parameterEnabled,
      sendStreamRequest,
      discardPendingStreamUpdates,
      handleStreamUpdate,
      handleStreamComplete,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    async (messages: Message[], prompt?: string) => {
      const payload = prompt
        ? buildChatCompletionPayload(messages, config, parameterEnabled, prompt)
        : buildChatCompletionPayload(messages, config, parameterEnabled)
      const generation = requestGenerationRef.current + 1
      const abortController = new AbortController()

      requestGenerationRef.current = generation
      stopStream()
      discardPendingStreamUpdates(generation)
      abortControllerRef.current?.abort()
      abortControllerRef.current = abortController

      try {
        setIsRequesting(true)
        const response = await sendChatCompletion(
          config.type,
          payload,
          abortController.signal
        )
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        // 视频接口返回的是可播放地址，没有 choices 结构，
        // 必须在这里单独分流，否则会被下面的 choices 校验误判成解析失败
        if (config.type === MODEL_LAN_TYPE.video) {
          const videoUrl = extractVideoUrl(response)

          if (!videoUrl) {
            handleStreamError(
              generation,
              ERROR_MESSAGES.PARSE_ERROR,
              undefined,
              VIDEO_TAB
            )
            return
          }

          onMessageUpdate((prev) => {
            if (requestGenerationRef.current !== generation) return prev
            return updateLastAssistantMessage(prev, (message) =>
              applyVideoGenerationResponse(message, videoUrl)
            )
          }, VIDEO_TAB)
          return
        }

        if (!hasChatCompletionChoice(response)) {
          handleStreamError(generation, ERROR_MESSAGES.API_REQUEST_ERROR)
          return
        }

        onMessageUpdate((prev) => {
          if (requestGenerationRef.current !== generation) return prev
          return updateLastAssistantMessage(prev, (message) => {
            const updatedMessage = applyChatCompletionResponse(
              message,
              response
            )

            return updatedMessage ?? message
          })
        })
      } catch (error: unknown) {
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        const { errorCode, errorMessage } = parseRequestErrorDetails(error)
        handleStreamError(generation, errorMessage, errorCode)
      } finally {
        if (requestGenerationRef.current === generation) {
          abortControllerRef.current = null
          setIsRequesting(false)
        }
      }
    },
    [
      config,
      parameterEnabled,
      stopStream,
      discardPendingStreamUpdates,
      onMessageUpdate,
      handleStreamError,
    ]
  )

  // Send chat request (stream or non-stream based on config)
  const sendChat = useCallback(
    (messages: Message[], prompt?: string) => {
      const target = config.stream ? sendStreamingChat : sendNonStreamingChat
      if (prompt) {
        target(messages, prompt)   // 有，就传第二个参数
      } else {
        target(messages)           // 没有，就不传
      }
    },
    [config.stream, sendStreamingChat, sendNonStreamingChat] // ✅ 去掉 config.prompt
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    const stoppedGeneration = requestGenerationRef.current
    flushStreamUpdates(stoppedGeneration)
    const idleGeneration = stoppedGeneration + 1
    requestGenerationRef.current = idleGeneration
    discardPendingStreamUpdates(idleGeneration)
    stopStream()
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsRequesting(false)
    // 用户主动停止：服务端那段任务不再管了，任务记录也要一并清掉，
    // 否则回到页面会被「自动续轮询」重新拉起来，等于停止失效
    clearPendingVideoTasks()
    onMessageUpdate((prev) => {
      if (requestGenerationRef.current !== idleGeneration) return prev
      return updateLastAssistantMessage(prev, (message) =>
        isAssistantMessagePending(message)
          ? completeAssistantMessage(message)
          : message
      )
    })
  }, [
    stopStream,
    flushStreamUpdates,
    discardPendingStreamUpdates,
    onMessageUpdate,
  ])

  // 续轮询：视频是异步任务，task_id 提交成功后就已经在服务端跑起来了。
  // 用户在轮询期间切走页面会把本次轮询 abort 掉，
  // 这里只拿着同一个 task_id 重新查结果，不重新提交任务，不会重复消耗额度。
  const resumeVideoTask = useCallback(
    async (taskId: string, startedAt: number) => {
      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      const abortController = new AbortController()

      stopStream()
      discardPendingStreamUpdates(generation)
      abortControllerRef.current?.abort()
      abortControllerRef.current = abortController

      // 切走页面时被 sanitizeMessagesOnLoad 兜底成错误态的消息，
      // 续轮询开始时先恢复成 loading，别让用户对着一条错误提示等结果
      onMessageUpdate((prev) => {
        if (requestGenerationRef.current !== generation) return prev
        return updateLastAssistantMessage(prev, (message) => {
          if (message.status !== MESSAGE_STATUS.ERROR) return message
          return {
            ...updateCurrentVersionContent(message, ''),
            status: MESSAGE_STATUS.LOADING,
            errorCode: null,
            completedAt: undefined,
            durationMs: undefined,
            isContentComplete: false,
            isReasoningStreaming: false,
          }
        })
      }, VIDEO_TAB)

      try {
        setIsRequesting(true)
        const videoUrl = await pollVideoTask(taskId, {
          signal: abortController.signal,
          startedAt,
        })
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        removePendingVideoTask(taskId)
        onMessageUpdate((prev) => {
          if (requestGenerationRef.current !== generation) return prev
          return updateLastAssistantMessage(prev, (message) =>
            applyVideoGenerationResponse(message, videoUrl)
          )
        }, VIDEO_TAB)
      } catch (error: unknown) {
        if (
          abortController.signal.aborted ||
          requestGenerationRef.current !== generation
        ) {
          return
        }

        const { errorCode, errorMessage } = parseRequestErrorDetails(error)
        handleStreamError(generation, errorMessage, errorCode, VIDEO_TAB)
      } finally {
        if (requestGenerationRef.current === generation) {
          abortControllerRef.current = null
          setIsRequesting(false)
        }
        // 本轮续轮询已结束（成功 / 失败 / 被中断），
        // 允许后续再次挂载时对同一个任务重新尝试
        resumedTaskIdsRef.current.delete(taskId)
      }
    },
    [
      stopStream,
      discardPendingStreamUpdates,
      onMessageUpdate,
      handleStreamError,
    ]
  )

  // 回到页面（或视频tab）时，把没结果的视频任务接回来继续轮询
  useEffect(() => {
    const task = getPendingVideoTask(VIDEO_TAB)
    if (!task) return

    // 已有请求在跑（本次会话刚提交的、或已经续过轮询的），不要重复拉起
    if (isStreaming || abortControllerRef.current) return
    if (resumedTaskIdsRef.current.has(task.taskId)) return

    // 消息还没从本地加载出来之前什么都不做，避免把刚提交的任务记录误删
    if (!videoMessages || videoMessages.length === 0) return

    const target = getVideoTaskTarget(videoMessages, task.startedAt)
    if (!target) {
      // 承接结果的助手消息没了或已经有结果，这条任务记录作废
      removePendingVideoTask(task.taskId)
      return
    }

    resumedTaskIdsRef.current.add(task.taskId)
    void resumeVideoTask(task.taskId, task.startedAt)
  }, [videoMessages, isStreaming, resumeVideoTask])

  return {
    sendChat,
    stopGeneration,
    isGenerating: isStreaming || isRequesting,
  }
}
