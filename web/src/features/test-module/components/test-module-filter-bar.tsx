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
import { useState, useEffect, useRef } from 'react'
import { Combobox } from '@/components/ui/combobox'
import { MultiSelect } from '@/components/multi-select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { LoadingState } from '@/components/loading-state'
import type { Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import {
  LogsFilterField,
  LogsFilterToolbar,
} from './test-module-toolbar'
import type { testFilters, AuditLog } from '../api'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/dialog'
import { Pencil, Trash2, CheckIcon } from 'lucide-react'
import { getQuestionGroup, addQuestionGroup, updateQuestionGroup, deleteQuestionGroup, getQuestion, addQuestion, updateQuestion, deleteQuestion, getChannelList } from '../api'

export function TestModuleFilterBar(props: {
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
  const { t } = useTranslation()
  const [open, setOpen] = useState<boolean>(false)
  const [loading] = useState<boolean>(false)
  const [alertOpen, setAlertOpen] = useState<boolean>(false)
  const [moduleAct, setModuleAct] = useState<string | number>('')
  const [moduleList, setModuleList] = useState<any[]>([])
  const [questionList, setQuestionList] = useState<any[]>([])
  const [channelList, setChannelList] = useState<any[]>([])
  const [modelList, setModelList] = useState<any>([])
  const deleteRef = useRef<any>({})
  const questionRef = useRef<any>({})
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
            value={props.filters.consecutive_request_count ?? ''}
            onChange={(e) => {
              props.onChange({
                consecutive_request_count: e.target.value === '' ? undefined : e.target.value,
              })
            }}
            placeholder={'连续请求数'}
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
    ].filter(Boolean).length
  const hasFilters =
    filterCount > 0

  // 新增模板 & 更新模板
  const confirmModule = async (item: any) => {
    if (!item?.name) return
    if (item?.id && item?.id < 10000) {
      await updateQuestionGroup({ id: item?.id, name: item?.name })
    } else {
      await addQuestionGroup({ name: item?.name })
    }
    getQuestionGroupFun()
  }

  // 删除模板
  const deleteFun = async () => {
    const { type, id } = deleteRef.current ?? {}
    if (id === undefined) {
      setAlertOpen(false)
      return
    }
    try {
      if (type === 'module') {
        await deleteQuestionGroup(id)
        getQuestionGroupFun()
      } else if (type === 'question') {
        await deleteQuestion(id)
        getQuestionListFun(Number(moduleAct))
      }
    } finally {
      setAlertOpen(false)
    }
  }
  
  // 获取模板列表
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

  // 获取问题列表
  const getQuestionListFun = async (id: number) => {
    const { items } = await getQuestion(`group_id=${id}`)
    setQuestionList(items)
    questionRef.current = items
  }

  // 新增 && 修改问题
  const updateQuestionFun = async (value: string, item: any) => {// 过滤空白
    const trimValue = value.trim()
    if (!trimValue) return
    try {
      const isEdit = item.id < 10000
      if (isEdit) {
        const updateLine = questionRef.current.find((line: any) => line.id === item.id)
        if (updateLine?.prompt === trimValue) return // 无变更直接退出
        await updateQuestion({ id: item.id, prompt: trimValue })
      } else { // 新增
        const groupId = Number(moduleAct)
        if (isNaN(groupId)) return
        await addQuestion({ group_id: groupId, prompt: trimValue })
      }
      // 请求成功后再刷新列表
      await getQuestionListFun(Number(moduleAct))
    } catch (err) {
      console.error('保存失败：', err)
    }
  }

  useEffect(() => {
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
    getQuestionGroupFun()
    getChannelFun()  // 获取渠道列表
  }, [])

  return (
    <>
      <LogsFilterToolbar
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
          <Dialog
            title={'配置问题模板'}
            description={t('View the complete details for this log entry')}
            descriptionClassName='sr-only'
            open={open}
            onOpenChange={setOpen}
            trigger={
              <Button
                type='button'
                variant='outline'
                onClick={() => setOpen(true)}
              >
                {'配置问题模板'}
              </Button>
            }
            contentClassName='min-w-0 sm:max-w-4xl'
            titleClassName='text-base'
            contentHeight='auto'
            bodyClassName='space-y-3'
          >
            <div className='flex flex-col gap-10 justify-end h-120'>
              {!loading ? <div className='min-w-0 space-y-1.5 flex flex-row items-center h-full'>
                <div className='flex flex-col items-center justify-between w-[40%] h-full m-0'>
                  <div className='flex flex-col gap-2 w-full'>
                    {
                      moduleList.map((item, index) => {
                        if (!item?.edit) return <div key={item?.id} 
                        className={`flex flex-row items-center rounded-md justify-between pl-3 pr-3 cursor-pointer hover:bg-gray-100 active:bg-gray-200 transition-colors ${moduleAct === item.id ? 'bg-gray-200' : ''}`}
                        onClick={() => {
                          setModuleAct(item.id)
                          getQuestionListFun(item.id)
                        }}>
                          <div>{item?.name}</div>
                          <div className='h-8 flex flex-row items-center justify-between gap-5'>
                            <Trash2 size={16} className='cursor-pointer' onClick={(e) => {
                              e.stopPropagation()
                              deleteRef.current = { type: 'module', id: item?.id }
                              setAlertOpen(true)
                            }}/>
                            <Pencil size={16} className='cursor-pointer' onClick={(e) => {
                              e.stopPropagation()
                              setModuleList(prevList =>
                                prevList.map((prevItem: any) =>
                                  prevItem.id === item.id
                                    ? { ...prevItem, edit: true }
                                    : prevItem
                                )
                              )
                            }}/>
                          </div>
                        </div>
                        return (
                          <div key={item?.id} className='flex flex-row items-center justify-between items-center pr-3'>
                            <Input
                              key={item?.id}
                              placeholder={'模块'}
                              value={item.name || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setModuleList((prevList) =>
                                  prevList.map((prevItem: any, inde: number) =>
                                    prevItem.id === item.id && inde === index
                                      ? { ...prevItem, name: val }
                                      : prevItem
                                  )
                                )
                              }}
                              autoComplete='off'
                              className='h-8 w-50 text-sm leading-5'
                            />
                            <div className='flex flex-row items-center gap-5'>
                              <Trash2 size={16} className='cursor-pointer' onClick={() => {
                                setModuleList(prevList => prevList.filter((_, i) => i !== index))
                              }}/>
                              <CheckIcon size={16} className="cursor-pointer" onClick={() => {
                                if (!item.name) return
                                confirmModule(item)
                              }}/>
                            </div>
                          </div>
                        )
                      })
                    }
                  </div>
                  <Button
                    type='button'
                    className='w-20 m-0'
                    onClick={() => {
                      if (!moduleList[moduleList.length - 1]?.name && moduleList.length !== 0) return
                      setModuleList(prevList => [...prevList, { name: '', edit: true, id: 99999999 }])
                    }}

                  >
                    {'添加模块'}
                  </Button>
                </div>
                <div className='flex flex-col gap-5 w-[calc(60%-20px)] h-full items-center justify-between ml-5'>
                  <div className='w-full'>
                    {moduleAct && questionList.length > 0 && <div className='flex flex-col items-center justify-between gap-2'>
                      {
                        questionList.map((item: any, index: number) => {
                          return (
                            <div key={index} className='h-8 w-full flex flex-row items-center justify-between gap-5'>
                              <Input
                                key={(item?.id || 0).toString() + index.toString()}
                                placeholder={'问题'}
                                value={item.prompt || ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setQuestionList(prevList =>
                                    prevList.map((prevItem: any, inde: number) =>
                                      prevItem.id === item.id && inde === index
                                        ? { ...prevItem, prompt: val }
                                        : prevItem
                                    )
                                  )
                                }}
                                onBlur={(e) => {
                                  updateQuestionFun(e.target.value, item)
                                }}
                                autoComplete='off'
                                className='h-8 w-100 text-sm leading-5'
                              />
                              <Trash2 size={16} className='cursor-pointer' onClick={() => {
                                if (item?.id < 99999999) {
                                  setAlertOpen(true)
                                  deleteRef.current = { type: 'question', id: item?.id }
                                } else {
                                  setQuestionList(prevList => prevList.filter((_, i) => i !== index))
                                }
                              }}/>
                            </div>
                          )
                        })
                      }
                    </div>}
                  </div>
                  <Button
                    type='button'
                    className='w-20 m-0'
                    onClick={() => {
                      if (questionList.length === 0 && !moduleAct) return
                      if ((!questionList[questionList.length - 1]?.prompt) && questionList.length !== 0) return
                      setQuestionList(prevList => [...prevList, { prompt: '', id: 99999999 }])
                    }}
                  >
                    {'添加问题'}
                  </Button>
                </div>
              </div> : <LoadingState className='h-full'/>}
            </div>
          </Dialog>
        }
      />
      <AlertDialog
        open={alertOpen}
        // onOpenChange={(open) => !open && setAlertOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
            {/* <AlertDialogDescription>
              123123123
            </AlertDialogDescription> */}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setAlertOpen(false)
              }}
            >
              {'取消'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAlertOpen(false)
                deleteFun()
              }}
              // disabled={isDeleting}
              variant='destructive'
            >
              {'确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
