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
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { STATUS_CONFIG, QUEST_STATUS_CONFIG } from '../api'
import type { AuditLog } from '../api'
import { TruncatedCell } from '@/components/data-table'
import { TestModuleDetailsDialog } from './test-module-details-dialog'
import { TestModuleConcurrencyDetailsDialog } from './test-module-concurrency-details-dialog'

export function useTestModuleColumns () {
  const { t } = useTranslation()
  return useMemo(() => {
    const columns: ColumnDef<AuditLog>[] = [
      {
        id: 'expand',
        header: () => null,
        size: 30,
        enableHiding: false,
        cell: ({ row }) => {
          if (row.original?.status !== 2) return null
          return <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
          >
            <ChevronRight
              className={cn(
                'h-8 w-8 shrink-0 transition-transform duration-200',
                row.getIsExpanded() && 'rotate-90'
              )}
            />
          </Button>
        },
      },
    ]
    columns.push(
      {
        accessorKey: 'question_group_name',
        header: '问题模块',
        size: 70,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.question_group_name || '—'}</span>
        ),
        meta: { label: '问题模块' },
      },
      {
        id: 'channel_name',
        header: '渠道',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.channel_name || '—'}</span>
        ),
        meta: { label: '渠道' },
      },
      {
        id: 'model',
        header: '模型',
        size: 100,
        enableHiding: false,
        cell: ({ row }) => (
          <TruncatedCell className='max-w-100'>
            {row.original?.model || '—'}
          </TruncatedCell>
        ),
        meta: { label: '模型' },
      },
      {
        id: 'created_time_text',
        header: '开始时间',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.created_time_text || '—'}</span>
        ),
        meta: { label: '开始时间' },
      },
      {
        accessorKey: 'success_count',
        header: '成功数',
        size: 35,
        cell: ({ row }) => (
          <span className='font-mono'>
            {row.original.success_count ?? '—'}
          </span>
        ),
        meta: { label: '成功数' },
      },
      {
        accessorKey: 'total_count',
        header: '总请求数',
        size: 35,
        cell: ({ row }) => (
          <span className='font-mono'>
            {row.original.total_count ?? '—'}
          </span>
        ),
        meta: { label: '总请求数' },
      },
      {
        accessorKey: 'successRate',
        header: '成功率',
        size: 35,
        cell: ({ row }) => {
          const { success_count, total_count } = row.original
          if (success_count == null || total_count == null) {
            return <span className='font-mono'>—</span>
          }
          const rate = (success_count / total_count) * 100
          return (
            <span className='font-mono'>
              {rate.toFixed(2)}%
            </span>
          )
        },
        meta: { label: '成功率' },
      },
      {
        id: 'status',
        header: '状态',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => {
          const cfg = STATUS_CONFIG[row.original?.status]
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono ${cfg?.className ?? 'bg-gray-100 text-gray-600'}`}>
              {cfg?.text ?? '—'}
            </span>
          )
        },
        meta: { label: '状态' },
      },
      // {
      //   id: 'details',
      //   header: t('Details'),
      //   size: 70,
      //   enableHiding: false,
      //   cell: ({ row }) => <TestModuleDetailsDialog entry={row.original} />,
      //   meta: { label: t('Details') },
      // }
    )
    return columns
  }, [t])
}

export function useInsideTableColumns () {
  const { t } = useTranslation()
  return useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'prompt',
      header: '问题',
      size: 100,
      cell: ({ row }) => (
        <TruncatedCell className='max-w-100'>
          {row.original?.prompt || '—'}
        </TruncatedCell>
      ),
      meta: { label: t('prompt') },
    },
    {
      accessorKey: 'channel_name',
      header: '渠道',
      size: 70,
      cell: ({ row }) => (
        <span className='font-mono'>{row.original.channel_name || '—'}</span>
      ),
      meta: { label: 'channel_name' },
    },
    {
      accessorKey: 'model',
      header: '模型',
      size: 76,
      cell: ({ row }) => (
        <span className='text-muted-foreground font-mono'>
          {row.original.model || '—'}
        </span>
      ),
      meta: { label: 'model' },
    },
    {
      accessorKey: 'input_token',
      header: '输入token',
      size: 45,
      cell: ({ row }) => (
        <span className='text-black !text-[1.2rem] !font-bold'>
          {row.original.input_token ?? '—'}
        </span>
      ),
      meta: { label: '输入token' },
    },
    {
      accessorKey: 'output_token',
      header: '输出token',
      size: 45,
      cell: ({ row }) => (
        <span className='text-black !text-[1.2rem] !font-bold'>
          {row.original.output_token ?? '—'}
        </span>
      ),
      meta: { label: '输出token' },
    },
    {
      accessorKey: 'total_token',
      header: '总消耗token',
      size: 60,
      cell: ({ row }) => (
        <span className='text-black !text-[1.2rem] !font-bold'>
          {row.original.total_token ?? '—'}
        </span>
      ),
      meta: { label: '总消耗token' },
    },
    {
      accessorKey: 'total_time',
      header: '延迟(总耗时)',
      size: 60,
      cell: ({ row }) => (
        <>
          <span className='text-black !text-[1.2rem] !font-bold'>
            {row.original.total_time ?? '-'}
          </span>
          <span className='ml-1'>ms</span>
        </>
      ),
      meta: { label: 'total_time' },
    },
    {
      accessorKey: 'status',
      header: '状态',
      size: 40,
      cell: ({ row }) => {
        const cfg = QUEST_STATUS_CONFIG[row.original?.status]
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono ${cfg?.className ?? 'bg-gray-100 text-gray-600'}`}>
            {cfg?.text ?? '—'}
          </span>
        )
      },
      meta: { label: 'status' },
    },
    {
      id: 'details',
      header: '显示源码',
      size: 40,
      enableHiding: false,
      cell: ({ row }) => <TestModuleDetailsDialog entry={row.original} />,
      meta: { label: t('Details') },
    }
  ], [t])
}

export function useTestModuleCounColumns () {
  const { t } = useTranslation()
  return useMemo(() => {
    const columns: ColumnDef<any>[] = [
      {
        id: 'expand',
        header: () => null,
        size: 30,
        enableHiding: false,
        cell: ({ row }) => {
          if (row.original?.status !== 2) return null
          return <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
          >
            <ChevronRight
              className={cn(
                'h-8 w-8 shrink-0 transition-transform duration-200',
                row.getIsExpanded() && 'rotate-90'
              )}
            />
          </Button>
        },
      },
    ]
    columns.push(
      {
        accessorKey: 'question_group_name',
        header: '问题模块',
        size: 70,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.question_group_name || '—'}</span>
        ),
        meta: { label: '问题模块' },
      },
      {
        id: 'channel_name',
        header: '渠道',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.channel_name || '—'}</span>
        ),
        meta: { label: '渠道' },
      },
      {
        id: 'model',
        header: '模型',
        size: 100,
        enableHiding: false,
        cell: ({ row }) => (
          <TruncatedCell className='max-w-100'>
            {row.original?.model || '—'}
          </TruncatedCell>
        ),
        meta: { label: '模型' },
      },
      {
        id: 'created_time_text',
        header: '开始时间',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.created_time_text || '—'}</span>
        ),
        meta: { label: '开始时间' },
      },
      {
        id: 'concurrent',
        header: '并发数量',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.concurrent ?? '—'}</span>
        ),
        meta: { label: '并发数量' },
      },
      {
        id: 'total_count',
        header: '总请求数',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => (
          <span className='font-mono'>{row.original?.total_count ?? '—'}</span>
        ),
        meta: { label: '总请求数' },
      },
      {
        id: 'status',
        header: '状态',
        size: 70,
        enableHiding: false,
        cell: ({ row }) => {
          const cfg = STATUS_CONFIG[row.original?.status]
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono ${cfg?.className ?? 'bg-gray-100 text-gray-600'}`}>
              {cfg?.text ?? '—'}
            </span>
          )
        },
        meta: { label: '状态' },
      },
    )
    return columns
  }, [t])
}

export function useInsideTableCounColumns (task_id: number) {
  const { t } = useTranslation()
  return useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'model',
      header: '模型',
      size: 76,
      cell: ({ row }) => (
        <span className='font-mono'>
          {row.original.model || '—'}
        </span>
      ),
      meta: { label: 'model' },
    },
    {
      accessorKey: 'fail',
      header: '失败数',
      size: 35,
      cell: ({ row }) => (
        <span className='!text-[1.1rem] text-red-500'>
          {row.original.fail ?? '—'}
        </span>
      ),
      meta: { label: '失败数' },
    },
    {
      accessorKey: 'success',
      header: '成功数',
      size: 35,
      cell: ({ row }) => (
        <span className='!text-[1.1rem] text-green-500'>
          {row.original.success ?? '—'}
        </span>
      ),
      meta: { label: '成功数' },
    },
    {
      accessorKey: 'successRate',
      header: '成功率',
      size: 40,
      cell: ({ row }) => {
        const { success, fail } = row.original
        const total = success + fail
        if (total === 0 || success == null || fail == null) {
          return <span className='font-mono'>—</span>
        }
        const rate = (success / total) * 100
        return (
          <span className='!text-[1.1rem] !font-bold'>
            {rate.toFixed(1)}%
          </span>
        )
      },
      meta: { label: '成功率' },
    },
    {
      accessorKey: 'slowest',
      header: '最慢',
      size: 50,
      cell: ({ row }) => (
        <>
          <span className='text-black !text-[1.2rem] !font-bold'>
            {row.original.slowest ?? '-'}
          </span>
          <span className='ml-1'>s</span>
        </>
      ),
      meta: { label: 'slowest' },
    },
    {
      accessorKey: 'fastest',
      header: '最快',
      size: 50,
      cell: ({ row }) => (
        <>
          <span className='text-black !text-[1.2rem] !font-bold'>
            {row.original.fastest ?? '-'}
          </span>
          <span className='ml-1'>s</span>
        </>
      ),
      meta: { label: 'fastest' },
    },
    {
      accessorKey: 'avg',
      header: '平均',
      size: 50,
      cell: ({ row }) => (
        <>
          <span className='text-black !text-[1.2rem] !font-bold'>
            {row.original.avg ?? '-'}
          </span>
          <span className='ml-1'>s</span>
        </>
      ),
      meta: { label: 'avg' },
    },
    {
      accessorKey: 'input_token',
      header: '输入token',
      size: 50,
      cell: ({ row }) => (
        <span className='text-black !text-[1.2rem] !font-bold'>
          {row.original.input_token ?? '—'}
        </span>
      ),
      meta: { label: '输入token' },
    },
    {
      accessorKey: 'output_token',
      header: '输出token',
      size: 50,
      cell: ({ row }) => (
        <span className='text-black !text-[1.2rem] !font-bold'>
          {row.original.output_token ?? '—'}
        </span>
      ),
      meta: { label: '输出token' },
    },
    {
      accessorKey: 'p50',
      header: 'P50',
      size: 40,
      cell: ({ row }) => (
        <span className='font-mono'>
          {row.original.p50 ?? '—'}
        </span>
      ),
      meta: { label: 'P50' },
    },
    {
      accessorKey: 'p90',
      header: 'P90',
      size: 40,
      cell: ({ row }) => (
        <span className='font-mono'>
          {row.original.p90 ?? '—'}
        </span>
      ),
      meta: { label: 'P90' },
    },
    {
      accessorKey: 'p99',
      header: 'P99',
      size: 40,
      cell: ({ row }) => (
        <span className='font-mono'>
          {row.original.p99 ?? '—'}
        </span>
      ),
      meta: { label: 'P99' },
    },
    {
      id: 'details',
      header: t('Details'),
      size: 40,
      enableHiding: false,
      cell: ({ row }) => <TestModuleConcurrencyDetailsDialog entry={row.original} taskId={task_id}/>,
      meta: { label: t('Details') },
    }
  ], [t])
}
