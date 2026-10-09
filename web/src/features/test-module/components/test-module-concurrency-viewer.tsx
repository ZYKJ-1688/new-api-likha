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
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type ExpandedState } from '@tanstack/react-table'
import { DataTablePage, useDataTable } from '@/components/data-table'

import { flexRender } from '@tanstack/react-table'
import { TableRow, TableCell } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'
import { toast } from 'sonner'

import { getTestTaskList, createTestTask, getTestTaskConcurrentDetail, type testConcurrentFilters, type AuditLog } from '../api'
import { useTestModuleCounColumns, useInsideTableCounColumns } from './test-module-columns'
import { TestModuleConcurrencyFilterBar } from './test-module-concurrency-filter-bar'

const EMPTY_LOGS: AuditLog[] = []

export function InsideTable(props: { item: any }) {

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>([])

  const columns = useInsideTableCounColumns(props.item.id)
  const { table } = useDataTable({
    data: data,
    columns: columns,
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const { items } = await getTestTaskConcurrentDetail('task_id=' + props.item.id + '&p=1&page_size=1000')
        setData(items)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return <div className='flex min-h-0 flex-col h-[400px]'>
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={loading}
      className='h-auto min-h-0 flex-1'
      applyHeaderSize
      getColumnClassName={() => 'py-2'}
      showPagination={false}
      tableClassName='
      [&_[data-slot=table]]:text-[13px] 
      [&_[data-slot=table]_td]:text-[13px] 
      [&_[data-slot=table]_td_*]:text-[13px] 
      [&_[data-slot=table]_th]:text-[13px] 
      [&_[data-slot=table]_th_*]:text-[13px] 
      [&_[data-slot=table]_tbody_tr_td]:!h-auto 
      [&_[data-slot=table]_tbody_tr_td]:!min-h-0
      [&_[data-slot=table]_tbody]:bg-white'
    />
  </div>
}

export function TestModuleConcurrencyViewer(props: {
  accessOnly?: boolean
  currentTokenRef?: string
}) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<testConcurrentFilters>({ p: 1, page_size: 20, type: 2 })
  const fetchParamsRef = useRef<testConcurrentFilters>({ p: 1, page_size: 20, type: 2 })
  const [expanded, setExpanded] = useState<ExpandedState>({})
  
  const query = useQuery({
    queryKey: [],
    queryFn: async () => {
      const { models, concurrent, total_count, ...rest } = fetchParamsRef.current
      const params = new URLSearchParams(Object.entries(rest).map(([k, v]) => [k, String(v)]))
      return requireServerSuccess(await getTestTaskList(params))
    },
    enabled: false,
    retry: false,
  })

  useEffect(() => {
    query.refetch()
  }, [])

  const columns = useTestModuleCounColumns()
  const { table } = useDataTable({
    columns,
    data:
      !query.isError
        ? (query.data?.items ?? EMPTY_LOGS)
        : EMPTY_LOGS,
    getRowId: (entry) => entry.id.toString(),
    totalCount: query.isError ? 0 : (query.data?.total ?? 0),
    pagination: { pageIndex: filters.p - 1, pageSize: filters.page_size },
    onPaginationChange: (updater: any) => {
      if (query.isFetching || query.isError) return
      // ✅ 在回调主体里算新参数（不做纯 updater 内的副作用）
      const current = {
        pageIndex: filters.p - 1,
        pageSize: filters.page_size,
      }
      const next = typeof updater === 'function' ? updater(current) : updater
      const newFilter = {
        ...filters,
        p: next.pageSize === filters.page_size ? next.pageIndex + 1 : 1,
        page_size: next.pageSize,
      }
      // ✅ 同步更新状态和 ref；queryKey 变了，useQuery 会自动重新请求
      setFilters(newFilter)
      fetchParamsRef.current = newFilter
      query.refetch()
    },
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
    withExpandedRowModel: true,
    expanded,
    onExpandedChange: setExpanded,
  })

  const updateTemp = (patch: Partial<testConcurrentFilters>) =>
    setFilters((previous) => ({ ...previous, ...patch, p: 1 }))

  const createTestTaskFun = async () => {
    const { channel_id, question_group_id, models, concurrent, total_count } = filters
  
    // 1. 先做安全数字转换
    const channelId = Number(channel_id)
    const questionGroupId = Number(question_group_id)
    const concurrentNum = Number(concurrent)
    const totalCountNum = Number(total_count)
  
    // 2. 校验：非空 + 合法正整数
    if (
      isNaN(channelId) || channelId <= 0 ||
      isNaN(questionGroupId) || questionGroupId <= 0 ||
      !Array.isArray(models) || models.length === 0 ||
      isNaN(concurrentNum) || concurrentNum <= 0 ||
      isNaN(totalCountNum) || totalCountNum <= 0
    ) {
      toast.warning('请选择必要条件，并发、总数量必须为正整数', { duration: 2000 })
      return
    }
  
    try {
      await createTestTask({
        channel_id: channelId,
        question_group_id: questionGroupId,
        models,
        concurrent: concurrentNum,
        total_count: totalCountNum,
        type: 2,
      })
      toast.success('任务创建成功')
      setExpanded({}) // 创建成功，收起所有展开行
      const reSetFilters = { p:1, page_size: filters.page_size, type: 2 }
      setFilters(reSetFilters)
      fetchParamsRef.current = reSetFilters
      void query.refetch()
    } catch (err) {
      toast.error(`创建任务失败：${err}`)
    }
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        emptyTitle={
          query.isError ? t('Failed to load audit records') : t('No records')
        }
        hideMobile={props.accessOnly}
        paginationInFooter={!props.accessOnly}
        className='h-auto min-h-0 flex-1'
        applyHeaderSize
        getColumnClassName={() => 'py-2'}
        tableClassName='[&_[data-slot=table]]:text-[13px] [&_[data-slot=table]_td]:text-[13px] [&_[data-slot=table]_td_*]:text-[13px] [&_[data-slot=table]_th]:text-[13px] [&_[data-slot=table]_th_*]:text-[13px]'
        toolbar={
          <div className='shrink-0 space-y-2'>
            <TestModuleConcurrencyFilterBar
              table={table}
              filters={filters}
              onChange={updateTemp}
              accessOnly={props.accessOnly}
              currentTokenRef={props.currentTokenRef}
              isFetching={query.isFetching}
              onCreate={() => {
                createTestTaskFun()
              }}
              onReset={() => {
                const resetVal: testConcurrentFilters = { p:1, page_size: filters.page_size, type: 2 }
                setFilters(resetVal)
                fetchParamsRef.current = resetVal
              }}
              onRefresh={() => {
                setExpanded({})
                const searchPayload = { ...filters, p: 1 }
                setFilters(searchPayload)
                fetchParamsRef.current = searchPayload
                void query.refetch()
              }}
            />
            {query.isError && (
              <Alert variant='destructive'>
                <AlertDescription className='flex items-center justify-between gap-2'>
                  <span>{'查询失败'}</span>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => void query.refetch()}
                  >
                    {t('Retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        }
        renderRow={(row) => {
          return (
            <React.Fragment key={row.id}>
              <TableRow>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {row.getIsExpanded() && (
                <TableRow>
                  <TableCell
                    colSpan={row.getVisibleCells().length}
                    className='bg-muted/50 border-b p-4'
                  >
                    <div className="rounded-md transition-opacity duration-150">
                      <InsideTable item={row} />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          )
        }}
      />
    </div>
  )
}

