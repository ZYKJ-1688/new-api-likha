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
import { t } from 'i18next'

import type { ApiResponse } from '@/features/profile/types'
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

export const STATUS_CONFIG: Record<number, { text: string; className: string }> = {
  0: { text: '待执行', className: 'text-gray-500' },
  1: { text: '执行中', className: 'text-blue-500' },
  2: { text: '已完成', className: 'text-green-500' },
}

export const QUEST_STATUS_CONFIG: Record<number, { text: string; className: string }> = {
  1: { text: '成功', className: 'text-green-500' },
  2: { text: '失败', className: 'text-red-500' },
}

export interface AuditLog {
  id: number,
  question_group_name: string,
  channel_name: string,
  created_time_text: string,
  model: string,
  status: number,
  total_count: number,
  success_count: number,
}
export interface testFilters {
  p: number
  page_size: number
  question_group_id?: string
  channel_id?: string | undefined | null,
  models?: string[],
  consecutive_request_count?: string | number,

  type?: string | number
}
export interface testConcurrentFilters {
  p: number
  page_size: number
  question_group_id?: string
  channel_id?: string | undefined | null,
  models?: string[]
  concurrent?: string
  total_count?: string
  type?: string | number
}

export interface CreateTestTask {
  type: number,                    // 1 顺序测速, 2 并发测试
  channel_id: number | undefined | null,
  models: string[],
  question_group_id: number,
  concurrent?: number,              // type=2 必填, 1~50 并发数量
  total_count?: number              // type=2 必填, 1~1000 总请求数
  consecutive_request_count?: number  // type=1 必填, 1~1000 连续请求数量
}

export async function getTestResult(
  params: testFilters
): Promise<{ items: AuditLog[]; total: number }> {
  const response = await api.get<
    ApiResponse<{ items: AuditLog[]; total: number }>
  >('/api/audit', { params })
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load audit records'))
  }
  return response.data.data
}

// 获取问题模板
export async function getQuestionGroup() {
  const response = await api.get('/api/question_group/')
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 新增问题模板
export async function addQuestionGroup(params: { name: string }) {
  const response = await api.post('/api/question_group/', params)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 更新问题模板
export async function updateQuestionGroup(params: { name: string, id: number}) {
  const response = await api.put('/api/question_group/', params)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 删除问题模板
export async function deleteQuestionGroup(id: number | string) {
  const response = await api.delete('/api/question_group/' + id)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 获取问题
export async function getQuestion(params: string) {
  const response = await api.get('/api/question/?' + params)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 新增问题
export async function addQuestion(params: { group_id: number | string, prompt: string}) {
  const response = await api.post('/api/question/', params)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 更新问题
export async function updateQuestion(params: { id: number, prompt: string}) {
  const response = await api.put('/api/question/', params)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 删除问题
export async function deleteQuestion(id: number | string) {
  const response = await api.delete('/api/question/' + id)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 渠道列表
export async function getChannelList() {
  const response = await api.get('/api/channel')
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 创建测试任务
export async function createTestTask(params: CreateTestTask) {
  const response = await api.post('/api/test_task/', params)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 获取测试任务列表
export async function getTestTaskList(params: any) {
  const response = await api.get('/api/test_task/?' + params)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 获取测试任务详情
export async function getTestTaskDetail(param: string) {
  const response = await api.get('/api/test_task_detail/?' + param)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}

// 获取测试任务详情(并发)
export async function getTestTaskConcurrentDetail(param: string) {
  const response = await api.get('/api/test_task_detail/stats?' + param)
  if (!response.data.success) {
    throw createServerError(response.data, t('Failed to load'))
  }
  return response.data.data
}
