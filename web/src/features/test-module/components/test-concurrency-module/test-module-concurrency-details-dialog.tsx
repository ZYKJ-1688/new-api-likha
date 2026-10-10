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
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { getTestTaskDetail } from '../../api'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { useInsideTableColumns } from '../common-components/test-module-columns'

export function TestModuleConcurrencyDetailsDialog(props: { entry: any, taskId: number }) {
  const { t } = useTranslation()
  const { entry, taskId } = props
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>([])

  const columns = useInsideTableColumns()
  const { table } = useDataTable({
    data: data,
    columns: columns,
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })

  useEffect(() => {
    if (open) {
      const getDetail = async () => {
        try {
          setLoading(true)
          const { items } = await getTestTaskDetail('task_id=' + taskId + '&model=' + entry.model + '&p=1&page_size=10000')
          setData(items)
        } finally {
          setLoading(false)
        }
      }
      getDetail()
    } else {
      setLoading(false)
      setData([])
    }
  }, [open])

  return (
    <Dialog
      title={'详情'}
      descriptionClassName='sr-only'
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant='ghost' size='sm' className='h-7 px-2' onClick={() => setOpen(true)}>
          {t('Details')}
        </Button>
      }
      contentClassName='min-w-0 sm:max-w-7xl max-sm:max-h-(--dialog-available-height) max-sm:w-[calc(100vw-1.5rem)] max-sm:max-w-[calc(100vw-1.5rem)]'
      titleClassName='text-base'
      contentHeight='auto'
      bodyClassName='space-y-3'
      >
      <div className='min-w-0 space-y-1.5'>
        <div className='flex min-h-0 flex-col h-[50rem]'>
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
      </div>
    </Dialog>
  )
}
  