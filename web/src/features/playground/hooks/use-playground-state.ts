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

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED, MODEL_LAN_TYPE } from '../constants'
import {
  saveConfig,
  saveParameterEnabled,
  saveMessages,
  applyMessageStateUpdate,
  getInitialParameterEnabled,
  getInitialPlaygroundConfig,
  hasImagePayloadValue,
  loadMessages,
  type MessageStateUpdater,
} from '../lib'
import type {
  ConversationTab,
  Message,
  PlaygroundConfig,
  ParameterEnabled,
  ModelOption,
  GroupOption,
} from '../types'

const MESSAGE_SAVE_DEBOUNCE_MS = 500

/**
 * 归一化配置：
 * - 补齐图片模式使用的 size / n、视频模式使用的 videoSize / videoDuration
 *   （旧缓存里可能没有这些字段）
 * - image 只在图片 / 视频模式下存在，且为空（空字符串 / 空数组）时不保留
 */
function normalizePlaygroundConfig(config: PlaygroundConfig): PlaygroundConfig {
  const normalized: PlaygroundConfig = {
    ...config,
    size: config.size ?? DEFAULT_CONFIG.size,
    n: config.n ?? DEFAULT_CONFIG.n,
    videoSize: config.videoSize ?? DEFAULT_CONFIG.videoSize,
    videoDuration: config.videoDuration ?? DEFAULT_CONFIG.videoDuration,
    ratio: config.ratio ?? DEFAULT_CONFIG.ratio,
  }

  if (normalized.type === MODEL_LAN_TYPE.text) {
    // 文字模式不带 image 字段
    delete normalized.image
    return normalized
  }

  if (!hasImagePayloadValue(normalized.image)) {
    delete normalized.image
  }

  return normalized
}

/**
 * Main state management hook for playground
 */
export function usePlaygroundState() {
  const [config, setConfig] = useState<PlaygroundConfig>(() => getInitialPlaygroundConfig())
  const [parameterEnabled, setParameterEnabled] = useState<ParameterEnabled>(
    getInitialParameterEnabled
  )

  // ========== 三套独立消息 ==========
  const [textMessages, setTextMessages] = useState<Message[]>([])
  const [imageMessages, setImageMessages] = useState<Message[]>([])
  const [videoMessages, setVideoMessages] = useState<Message[]>([])

  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const messagesSaveTimerRef = useRef<number | null>(null)
  // 保存每个tab最新消息的ref
  const latestMessagesRef = useRef<Record<any, Message[]>>({
    0: [],
    1: [],
    2: [],
  })
  const hasLoadedMessagesRef = useRef(false)

  const [models, setModels] = useState<ModelOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])

  // 根据tab获取当前消息
  const getCurrentMessages = useCallback((): Message[] => {
    switch (config.type) {
      case 1: return imageMessages
      case 2: return videoMessages
      default: return textMessages
    }
  }, [config.type, textMessages, imageMessages, videoMessages])

  // 持久化：保存对应tab消息
  const persistMessages = useCallback((tab: ConversationTab, messagesToSave: Message[]) => {
    latestMessagesRef.current[tab] = messagesToSave
    if (!hasLoadedMessagesRef.current) return

    if (messagesSaveTimerRef.current !== null) {
      window.clearTimeout(messagesSaveTimerRef.current)
    }
    messagesSaveTimerRef.current = window.setTimeout(() => {
      messagesSaveTimerRef.current = null
      // 按tab分开保存
      saveMessages(latestMessagesRef.current[tab], tab)
    }, MESSAGE_SAVE_DEBOUNCE_MS)
  }, [])

  // 加载所有tab消息
  useEffect(() => {
    let cancelled = false
    window.setTimeout(() => {
      const loadedText = loadMessages(0) ?? []
      const loadedImage = loadMessages(1) ?? []
      const loadedVideo = loadMessages(2) ?? []
      if (cancelled) return

      latestMessagesRef.current[0] = loadedText
      latestMessagesRef.current[1] = loadedImage
      latestMessagesRef.current[2] = loadedVideo
      hasLoadedMessagesRef.current = true

      setTextMessages(loadedText)
      setImageMessages(loadedImage)
      setVideoMessages(loadedVideo)
      setIsLoadingMessages(false)
    }, 0)
    return () => { cancelled = true }
  }, [])

  // stream 配置
  useEffect(() => {
    setConfig((prev) => {
      const obj = {
        ...prev,
        stream: config.type === MODEL_LAN_TYPE.text,
      }
      return obj
    })
  }, [config.type])

  // 页面卸载，保存全部tab待持久化消息
  useEffect(() => () => {
    if (messagesSaveTimerRef.current !== null) {
      window.clearTimeout(messagesSaveTimerRef.current)
      ;([0,1,2] as ConversationTab[]).forEach(tab => {
        saveMessages(latestMessagesRef.current[tab], tab)
      })
    }
  }, [])

  const updateConfig = useCallback(
    <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) => {
      setConfig((prev) => {
        // 归一化后 image 的空值会被剔除，文字模式下不会出现该字段
        const updated = normalizePlaygroundConfig({ ...prev, [key]: value })
        saveConfig(updated)
        return updated
      })
    },
    []
  )

  const updateParameterEnabled = useCallback(
    (key: keyof ParameterEnabled, value: boolean) => {
      setParameterEnabled((prev) => {
        const updated = { ...prev, [key]: value }
        saveParameterEnabled(updated)
        return updated
      })
    },
    []
  )

  // ========== 重点：updateMessages 增加tab参数，更新对应tab消息 ==========
  // tabOverride 用于「结果回填到它本来所属的会话」：
  // 视频是异步任务，用户在轮询期间切到文字tab，
  // 回包时如果按当前tab写入，视频结果会被塞进文字会话里
  const updateMessages = useCallback(
    (updater: MessageStateUpdater, tabOverride?: ConversationTab) => {
      const tab = tabOverride ?? (config.type as ConversationTab)
      const updateSet = (prevList: Message[]) => {
        const newMessages = applyMessageStateUpdate(prevList, updater)
        persistMessages(tab, newMessages)
        return newMessages
      }

      switch (tab) {
        case 0:
          setTextMessages(updateSet)
          break
        case 1:
          setImageMessages(updateSet)
          break
        case 2:
          setVideoMessages(updateSet)
          break
      }
    },
    [config.type, persistMessages]
  )

  // 清空【当前激活tab】的消息
  const clearMessages = useCallback(() => {
    updateMessages([])
  }, [config.type, updateMessages])

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
    setParameterEnabled(DEFAULT_PARAMETER_ENABLED)
    saveConfig(DEFAULT_CONFIG)
    saveParameterEnabled(DEFAULT_PARAMETER_ENABLED)
  }, [])

  return {
    // 新增tab状态
    getCurrentMessages,

    // 三套消息暴露出来，上层组件可以按需使用
    textMessages,
    imageMessages,
    videoMessages,

    config,
    setConfig,
    parameterEnabled,
    // messages 保留，对外返回当前tab的消息，兼容原有代码
    messages: getCurrentMessages(),
    isLoadingMessages,
    models,
    groups,
    setModels,
    setGroups,
    updateConfig,
    updateParameterEnabled,
    updateMessages,
    clearMessages,
    resetConfig,
  }
}
