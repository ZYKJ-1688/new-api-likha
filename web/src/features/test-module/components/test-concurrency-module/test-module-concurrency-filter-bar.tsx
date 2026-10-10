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
import { Input } from '@/components/ui/input'
import {
  LogsFilterField,
  TestFilterToolbar,
} from '../common-components/test-module-toolbar'
import type { testConcurrentFilters, AuditLog } from '../../api'
import { Button } from '@/components/ui/button'
import { getQuestionGroup, getChannelList } from '../../api'
// 复用公共弹窗组件
import { QuestionTemplateSettingDialog } from '../common-components/question-module-setting-dialog'

export function TestModuleConcurrencyFilterBar(props: {
  table: Table<AuditLog>
  filters: testConcurrentFilters
  onChange: (patch: Partial<testConcurrentFilters>) => void
  accessOnly?: boolean
  currentTokenRef?: string
  isFetching: boolean
  onCreate: () => void
  onReset: () => void
  onRefresh: (value: any) => void
}) {
  const { t } = useTranslation()
  // 仅保留弹窗开关
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [moduleList, setModuleList] = useState<any[]>([])
  const [channelList, setChannelList] = useState<any[]>([])
  const [modelList, setModelList] = useState<any>([])

  const mainFilters = <>
    {!props.accessOnly && (
      <>
        <LogsFilterField>
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
        <LogsFilterField>
          <Combobox
            options={channelList}
            value={props.filters.channel_id ?? ''}
            onValueChange={(value) => {
              const availableModelValues = channelList.filter(chan => value === chan.value)[0]?.moduleList || []
              props.onChange({
                channel_id: value === null ? '' : value,
                models: []
              })
              setModelList(availableModelValues)
            }}
            showClear={true}
            aria-label={'渠道'}
            placeholder={'渠道'}
            className='w-full h-8'
          />
        </LogsFilterField>
        <LogsFilterField>
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
        <LogsFilterField>
          <Input
            type='number'
            min={1}
            step='any'
            value={props.filters.concurrent ?? ''}
            onChange={(e) => {
              props.onChange({
                concurrent: e.target.value === '' ? undefined : e.target.value,
              })
            }}
            placeholder={'并发数量'}
            className='h-8 min-w-0 text-sm leading-5'
          />
        </LogsFilterField>
        <LogsFilterField>
          <Input
            type='number'
            min={1}
            step='any'
            value={props.filters.total_count ?? ''}
            onChange={(e) => {
              props.onChange({
                total_count: e.target.value === '' ? undefined : e.target.value,
              })
            }}
            placeholder={'总请求数'}
            className='h-8 min-w-0 text-sm leading-5'
          />
        </LogsFilterField>
      </>
    )}
  </>
  const filterCount =
    [
      props.filters.question_group_id,
      props.filters.channel_id,
      props.filters.models,
      props.filters.concurrent,
      props.filters.total_count,
    ].filter(Boolean).length
  const hasFilters =
    filterCount > 0

  // 获取模板下拉选项
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

  // 获取渠道列表
  const getChannelFun = async () => {
    const { items } = await getChannelList()
    const channelList = items.map((item: any) => {
      return {
        id: item.id,
        value: item.id,
        label: item.name,
        moduleList: item.models !== '' ? item.models.split(',').map((model: any) => {
          return {
            label: model,
            value: model
          }
        }) : []
      }
    })
    setChannelList(channelList)
  }

  useEffect(() => {
    getQuestionGroupFun()
    getChannelFun()
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
      {/* 复用公共弹窗组件 */}
      <QuestionTemplateSettingDialog
        open={templateDialogOpen}
        onOpenChange={(isOpen) => {
          setTemplateDialogOpen(isOpen)
          // 弹窗关闭时，刷新父组件下拉选项
          if (!isOpen) {
            getQuestionGroupFun()
          }
        }}
      />
    </>
  )
}
