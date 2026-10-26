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
import { STORAGE_KEYS } from '../../constants'
import type { ConversationTab } from '../../types'

/**
 * 一次「已提交但还没拿到结果」的视频任务。
 * 视频是异步任务：创建接口返回 task_id 后服务端才开始生成，
 * 轮询期间如果用户切走 / 刷新页面，组件卸载会 abort 掉轮询。
 * 这里把 task_id 落盘，回到页面后可以接着轮询同一个任务，
 * 而不是把用户已经发出的那次生成丢掉。
 */
export type PendingVideoTask = {
  taskId: string
  tab: ConversationTab
  // 任务提交成功的时间戳，续轮询时用它计算剩余等待时间，
  // 避免每次回来都重新计时导致永远不超时
  startedAt: number
}

// 超过这个时间还没结果的任务直接丢弃，避免陈年任务一直重试
const MAX_TASK_AGE_MS = 24 * 60 * 60 * 1000

function isConversationTab(value: unknown): value is ConversationTab {
  return value === 0 || value === 1 || value === 2
}

function readTasks(): PendingVideoTask[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PENDING_VIDEO_TASKS)
    if (!saved) return []

    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []

    const now = Date.now()
    return parsed.filter((item): item is PendingVideoTask => {
      if (!item || typeof item !== 'object') return false
      const task = item as Partial<PendingVideoTask>
      return (
        typeof task.taskId === 'string' &&
        task.taskId.length > 0 &&
        isConversationTab(task.tab) &&
        typeof task.startedAt === 'number' &&
        now - task.startedAt < MAX_TASK_AGE_MS
      )
    })
  } catch {
    return []
  }
}

function writeTasks(tasks: PendingVideoTask[]): void {
  try {
    if (tasks.length === 0) {
      localStorage.removeItem(STORAGE_KEYS.PENDING_VIDEO_TASKS)
      return
    }
    localStorage.setItem(STORAGE_KEYS.PENDING_VIDEO_TASKS, JSON.stringify(tasks))
  } catch {
    // 存储不可用（隐私模式 / 超出配额）时静默降级：最多丢掉跨页面的续轮询能力
  }
}

/**
 * 记录一个新的视频任务。同一个 tab 只保留最新一条：
 * 旧记录对应的助手消息已经被新一轮请求覆盖，留着会在恢复时写错消息。
 */
export function savePendingVideoTask(task: PendingVideoTask): void {
  const remaining = readTasks().filter((item) => item.tab !== task.tab)
  writeTasks([...remaining, task])
}

export function getPendingVideoTask(
  tab: ConversationTab
): PendingVideoTask | null {
  return readTasks().find((item) => item.tab === tab) ?? null
}

/**
 * 只有确认这条任务已经「出结果」或「彻底失败」时才调用。
 * 用户停止、页面卸载导致的中断不要调用，否则就失去恢复能力了。
 */
export function removePendingVideoTask(taskId: string): void {
  writeTasks(readTasks().filter((item) => item.taskId !== taskId))
}

export function clearPendingVideoTasks(tab?: ConversationTab): void {
  if (tab === undefined) {
    writeTasks([])
    return
  }
  writeTasks(readTasks().filter((item) => item.tab !== tab))
}
