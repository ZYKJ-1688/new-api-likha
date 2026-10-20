import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { getTestTaskDetail, type testFilters } from '../../api'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { useInsideTableColumns } from '../common-components/test-module-columns'
import { requireServerSuccess } from '@/lib/server-error-message'

type TestModuleConcurrencyDetailsDialogProps = {
  entry: unknown
  taskId: number
}

const optionList:any = [
  { label: '全部', value: 0 },
  { label: '成功', value: 1 },
  { label: '失败', value: 2 }
]

export function TestModuleConcurrencyDetailsDialog(props: TestModuleConcurrencyDetailsDialogProps) {
  const { t } = useTranslation()
  const { taskId } = props
  const [open, setOpen] = useState(false)
  // ✅ 用 useState 代替 ref，响应式驱动 queryKey
  const [filters, setFilters] = useState<testFilters>({
    p: 1,
    page_size: 20,
    status: 0
  })

  // 打开弹窗重置筛选和页码
  useEffect(() => {
    if (open) {
      setFilters({ p: 1, page_size: 20, status: 0 })
    }
  }, [open])

  const insideQuery = useQuery({
    queryKey: ['testTaskDetail', taskId, filters],
    queryFn: async () => {
      const sp = new URLSearchParams()
      sp.set('task_id', String(taskId))
      sp.set('p', String(filters.p))
      sp.set('page_size', String(filters.page_size))
      if (filters.status) sp.set('status', String(filters.status))
      return requireServerSuccess(await getTestTaskDetail(sp.toString()))
    },
    enabled: open,
    retry: false,
  })

  const columns = useInsideTableColumns()
  const { table } = useDataTable({
    data: insideQuery.data?.items ?? [],
    columns: columns,
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
    totalCount: insideQuery.isError ? 0 : (insideQuery.data?.total ?? 0),
    pagination: { pageIndex: filters.p - 1, pageSize: filters.page_size },
    onPaginationChange: (updater) => {
      if (insideQuery.isFetching || insideQuery.isError) return
      setFilters(prev => {
        const current = { pageIndex: prev.p - 1, pageSize: prev.page_size }
        const next = typeof updater === 'function' ? updater(current) : updater
        return {
          ...prev,
          p: next.pageSize === prev.page_size ? next.pageIndex + 1 : 1,
          page_size: next.pageSize,
        }
      })
    },
  })

  return (
    <Dialog
      title={t('Details')}
      descriptionClassName='sr-only'
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant='ghost' size='sm' className='h-7 px-2'>
          {t('Details')}
        </Button>
      }
      contentClassName='min-w-0 max-sm:max-h-[var(--dialog-available-height)] sm:w-[calc(100vw-30rem)] sm:max-w-[calc(100vw-30rem)]'
      titleClassName='text-base'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      <div className='min-w-0 space-y-1.5'>
        <Combobox
          {...({
            value: filters.status,
            options: optionList,
            onValueChange: (value: any) => {
              setFilters(prev => ({ ...prev, status: value ?? undefined, p: 1 }))
            },
            showClear: true,
            'aria-label': t('Status'),
            placeholder: t('Status'),
            className: 'w-[12.5rem] h-8 mb-4'
          } as any)}
        />
        <div className='flex min-h-0 flex-col h-[50rem]'>
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={insideQuery.isFetching}
            className='h-auto min-h-0 flex-1'
            applyHeaderSize
            getColumnClassName={() => 'py-2'}
            paginationInFooter={false}
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
      </div>
    </Dialog>
  )
}
