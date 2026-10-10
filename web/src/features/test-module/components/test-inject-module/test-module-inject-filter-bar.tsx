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
import { Combobox } from '@/components/ui/combobox'
import { MultiSelect } from '@/components/multi-select'
import type { Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import {
  LogsFilterField,
  TestFilterToolbar,
} from '../common-components/test-module-toolbar'
import type { testFilters, AuditLog } from '../../api'
import { Button } from '@/components/ui/button'
import { getQuestionGroup, getHasOfficialModelList } from '../../api'
import { QuestionTemplateSettingDialog } from '../common-components/question-module-setting-dialog'

export function TestModuleInjectFilterBar(props: {
  table: Table<AuditLog>
  filters: testFilters
  onChange: (patch: Partial<testFilters>) => void
  accessOnly?: boolean
  currentTokenRef?: string
  isFetching: boolean
  onCreate: () => void
  onReset: () => void
  onRefresh: (value: any) => void
}) {
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [moduleList, setModuleList] = useState<any[]>([])
  const [modelList, setModelList] = useState<any>([])

  const mainFilters = (
    <div className="flex items-center gap-3">
      {!props.accessOnly && (
        <>
          <LogsFilterField className="w-1/4">
            <MultiSelect
              options={modelList}
              selected={props.filters.models ?? []}
              onChange={(value) => {
                props.onChange({
                  models: value || undefined,
                })
              }}
              placeholder={'模型'}
            />
          </LogsFilterField>
          <LogsFilterField className="w-1/4">
            <Combobox
              options={moduleList}
              value={props.filters.question_group_id ?? ''}
              onValueChange={(value) => {
                if (value !== null) props.onChange({
                  question_group_id: value || undefined,
                })
              }}
              aria-label={'问题模板'}
              placeholder={'问题模板'}
              className='w-full h-8'
            />
          </LogsFilterField>
        </>
      )}
    </div>
  )
  
  const filterCount =
    [
      props.filters.question_group_id,
      props.filters.models,
    ].filter(Boolean).length
  const hasFilters =
    filterCount > 0

  // 加载模板下拉选项
  const getQuestionGroupFun = async () => {
    const data = await getQuestionGroup()
    const list = data.map((item: any) => {
      return {
        ...item,
        value: item.id,
        label: item.name
      }
    })
    setModuleList(list)
  }

  // 加载模型下拉选项
  const getModelListFun = async () => {
    const data = await getHasOfficialModelList()
    const list = data.map((item: any) => {
      return {
        value: item,
        label: item
      }
    })
    setModelList(list)
  }

  useEffect(() => {
    getQuestionGroupFun()
    getModelListFun()
  }, [])

  return (
    <>
      <TestFilterToolbar
        primaryFilters={
          <>
            {mainFilters}
          </>
        }
        mobileFilters={
          <>
            {mainFilters}
          </>
        }
        mobileFilterCount={filterCount}
        hasActiveFilters={hasFilters}
        searchLoading={props.isFetching}
        onCreate={props.onCreate}
        onReset={props.onReset}
        onRefresh={props.onRefresh}
        stats={
          <Button
            type='button'
            variant='outline'
            onClick={() => setTemplateDialogOpen(true)}
          >
            {'配置问题模板'}
          </Button>
        }
      />
      {/* 抽离后的公共弹窗组件 */}
      <QuestionTemplateSettingDialog
        open={templateDialogOpen}
        onOpenChange={(isOpen) => {
          setTemplateDialogOpen(isOpen)
          // 弹窗关闭时，刷新父组件下拉选项
          if (!isOpen) getQuestionGroupFun()
        }}
      />
    </>
  )
}
