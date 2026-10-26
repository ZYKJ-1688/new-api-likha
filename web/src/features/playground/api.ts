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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  API_ENDPOINTS,
  ERROR_MESSAGES,
  MOCK_VIDEO_LATENCY_MS,
  MOCK_VIDEO_URL,
  MODEL_LAN_TYPE,
} from './constants'
import { normalizeImageGenerationResponse } from './lib/streaming/response-normalizer'
import {
  removePendingVideoTask,
  savePendingVideoTask,
} from './lib/storage/video-task-store'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ConversationTab,
  ModelOption,
  GroupOption,
} from './types'

/**
 * 任务已经终结的标记：服务端判定失败、查询超时属于这一类，
 * 继续轮询也不会有结果，所以要把记录清掉。
 * 网络抖动之类的错误不用它——那种情况任务还算数，下次回来可以再试。
 */
class VideoTaskTerminalError extends Error {}

function delayWithAbort(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const onAbort = () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 查询视频任务结果，成功返回可播放地址。
 * 轮询过程中可以随时用 signal 中断，中断后 task_id 依然有效，
 * 调用方可以拿着同一个 taskId 重新进来接着查（页面回来后的续轮询就是这么做的）。
 */
export async function pollVideoTask(
  taskId: string,
  options: {
    signal?: AbortSignal
    // 任务提交成功的时间戳；续轮询时传进来，才能接着算剩余等待时间，
    // 否则每次回到页面都重新计时，永远也到不了超时
    startedAt?: number
    intervalMs?: number
    timeoutMs?: number
  } = {}
): Promise<string> {
  const { signal, startedAt, intervalMs = 2000, timeoutMs = 1000 * 60 * 60 * 24 } = options
  const startTime = startedAt ?? Date.now()

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (Date.now() - startTime > timeoutMs) {
        throw new VideoTaskTerminalError('任务查询超时')
      }

      // 轮询的那次 HTTP 也要带上 signal，否则这一轮在飞的请求掐不掉
      // disableDuplicate：轮询请求天然串行，共享 in-flight promise 反而会被彼此的 cancel 波及
      const videoRes: any = await api.get(
        `${API_ENDPOINTS.CHAT_VIDEO_GENERATIONS}/${taskId}`,
        { signal, disableDuplicate: true }
      )

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const videoData = videoRes.data?.data
      if (videoData?.status === 'failed' || !videoRes?.data?.success) {
        throw new VideoTaskTerminalError(videoData.message || '视频生成失败')
      }
      if (videoData?.status === 'SUCCESS') {
        if (videoData?.result_url) return videoData.result_url
        throw new VideoTaskTerminalError(ERROR_MESSAGES.PARSE_ERROR)
      }

      await delayWithAbort(intervalMs, signal)   // ← 替换原来的 new Promise(setTimeout)
    }
  } catch (error) {
    // 被中断时（用户点停止 / 切换页面导致组件卸载）刻意不动这条记录：
    // 停止路径由 stopGeneration 自己清理，切页路径要留着给「回来续轮询」用。
    if (!signal?.aborted && error instanceof VideoTaskTerminalError) {
      removePendingVideoTask(taskId)
    }
    throw error
  }
}

export async function sendChatCompletion(
  type: number,
  payload: ChatCompletionRequest,
  signal?: AbortSignal
): Promise<any> {
  if (type === MODEL_LAN_TYPE.text) {
    const res = await api.post(API_ENDPOINTS.CHAT_COMPLETIONS, payload, {
      signal,
      skipErrorHandler: true,
    } as Record<string, unknown>)
    return res.data
  } else if (type === MODEL_LAN_TYPE.image) {
    const res = await api.post(API_ENDPOINTS.CHAT_IMAGE_GENERATIONS, payload, {
      signal,
      skipErrorHandler: true,
    } as Record<string, unknown>)
    // 图片接口返回的是 OpenAI images 结构（{ created, data: [{ url }] }
    const normalized = normalizeImageGenerationResponse(res.data)
    if (!normalized) {
      throw new Error(ERROR_MESSAGES.PARSE_ERROR)
    }
    return normalized
  } else if (type === MODEL_LAN_TYPE.video) {
    // 创建视频任务是异步：先提交拿到 task_id，再查询任务结果
    const res = await api.post(API_ENDPOINTS.CHAT_VIDEO_GENERATIONS, payload, {
      signal,
      skipErrorHandler: true,
    } as Record<string, unknown>)

    // 模拟：直接返回示例视频地址
    // const res = {
    //   data: {
    //     data: {
    //         created_at: 1792662803,
    //         id: 'task_HvMxjNIP2qaBrxbdk8x9vdjnWV9v0lw8',
    //         model: 'doubao-seedance-2-0-fast-260128',
    //         status: 'queued',
    //         task_id: 'task_g4ZUC9KgwfjTzFANTRKJSsFUz1wONTDO'
    //     },
    //     message: "",
    //     success: true
    //   }
    // }
    const submitData = res.data?.data
    const taskId = submitData?.task_id
    if (!res.data?.success || !taskId) {
      throw new Error(ERROR_MESSAGES.PARSE_ERROR)
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // 走到这里说明服务端已经开始生成了：先把 task_id 落盘，
    // 之后即使轮询被中断（切页面 / 刷新），回到页面还能接着查这个任务
    const startedAt = Date.now()
    savePendingVideoTask({
      taskId,
      tab: MODEL_LAN_TYPE.video as ConversationTab,
      startedAt,
    })

    const videoUrl = await pollVideoTask(taskId, { signal, startedAt })
    removePendingVideoTask(taskId)
    return videoUrl
  }

  return null
}

/**
 * Get user available models
 */
export async function getUserModels(group: string, type:number): Promise<ModelOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_MODELS, {
    params: { group, type },
  })
  const { data } = res
  requireServerSuccess(data)

  if (!data.success || !Array.isArray(data.data)) {
    return []
  }

  return data.data.map((model: string) => ({
    label: model,
    value: model,
  }))
}

/**
 * Get user groups
 */
export async function getUserGroups(): Promise<GroupOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_GROUPS)
  const { data } = res
  requireServerSuccess(data)

  if (!data.success || !data.data) {
    return []
  }

  const groupData = data.data as Record<string, { desc: string; ratio: number }>

  // label is for button display (name only); desc is for dropdown content
  return Object.entries(groupData).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info.ratio,
    desc: info.desc,
  }))
}

// 上传到阿里云oss，拿到key
export async function ossUploadImage(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post('/api/file/upload', formData)
  requireServerSuccess(data)
  return data.data
}
