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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PromptInput,
  PromptInputFooter,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'

import { getSubmittableInputText } from '../../lib'
import type {
  ModelOption,
  GroupOption,
  ParameterEnabled,
  PlaygroundConfig,
} from '../../types'
import { MODEL_LAN_TYPE, CREATE_MODEL_TYPE } from '../../constants'
import { PlaygroundInputControls } from './playground-input-controls'
import { PlaygroundInputTools } from './playground-input-tools'
import { PlaygroundInputImages } from './playground-input-images'


interface PlaygroundInputProps {
  config: PlaygroundConfig
  setConfig: (value: any) => void
  onSubmit: (text: string, images?: string[]) => void
  onStop?: () => void
  disabled?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
  hasMessages?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onClearMessages?: () => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInput({
  config,
  setConfig,
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
  hasMessages = false,
  onConfigChange,
  onClearMessages,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  // 文字模式：随输入框暂存的待发送图片（OSS 地址）。
  // 不走 config.image —— 文字模式配置归一化时会剔除该字段，且不必持久化到 localStorage
  const [inputImages, setInputImages] = useState<string[]>([])
  // 提交后自增，通知图片上传区清空缩略图列表
  const [imagesResetSignal, setImagesResetSignal] = useState(0)

  // 图片模式，视频模式图片上传逻辑处理
  const handleImagesChange = (list: any[]) => {
    if (list.length === 0) {
      setInputImages([])
      onConfigChange('image', undefined)
      onConfigChange('metadata', undefined)
      return
    }
    if (config.type === MODEL_LAN_TYPE.text) {
      // 文字模式：图片暂存在输入区本地状态，提交时随这条消息一起发出去
      setInputImages(
        list.map(x => x?.src || '').filter(src => src.trim() !== '')
      )
      return
    }
    if (config.type === MODEL_LAN_TYPE.image) {
      const srcs = list.map(x => x?.src || '')
      const data: string | string[] | undefined = srcs.length === 0 ? undefined : srcs.length === 1 ? srcs[0] : srcs
      onConfigChange('image', data)
    }
    if (config.type === MODEL_LAN_TYPE.video) {
      if (config.createVideoMode === CREATE_MODEL_TYPE.almighty) {
        const metadata:any = {}
        metadata.content = list.map(item => {
          return { type: "image_url", image_url: { url: item?.src || '' }, role: "reference_image" }
        })
        onConfigChange('metadata', metadata)
      } else if (config.createVideoMode === CREATE_MODEL_TYPE.headAndTail) {
        const first = list.find(item => item.isFirstIem)?.src
        const last = list.find(item => item.isSeconfIem)?.src
        const content: Array<{ type: string; image_url: { url: string }; role: string }> = []
        if (first) content.push({ type: 'image_url', image_url: { url: first }, role: 'first_frame' })
        if (last) content.push({ type: 'image_url', image_url: { url: last }, role: 'last_frame' })
        onConfigChange('metadata', content.length > 0 ? { content } : undefined)
      }
    }
  }

  const handleSubmit = (message: any) => {
    // 内容提交
    const submittableText = getSubmittableInputText(message, disabled)
    if (!submittableText) return
    // 文字模式：把暂存图片随这条消息一起提交（图片/视频模式仍走 prompt + config）
    const images = config.type === MODEL_LAN_TYPE.text && inputImages.length > 0 ? inputImages : undefined
    onSubmit(submittableText, images)
    setText('')
    // 消息已带上图片，输入区不再保留：清空暂存并让上传区收起缩略图
    if (images) {
      setInputImages([])
      setImagesResetSignal((prev) => prev + 1)
    }
  }

  return (
    <div className='grid shrink-0 gap-4 px-1 md:pb-4'>
      <PromptInput
        className='relative'
        groupClassName='bg-background/95 dark:bg-background/80 border-border/70 shadow-[0_18px_60px_-32px_rgba(0,0,0,0.65)] ring-1 ring-foreground/5 rounded-xl overflow-hidden transition-all duration-200 focus-within:border-primary/45 focus-within:ring-primary/15 focus-within:shadow-[0_22px_70px_-34px_rgba(0,0,0,0.75)] !opacity-100'
        onSubmit={handleSubmit}
      >
        <div className='w-full flex flex-row'>
          <PlaygroundInputImages
            config={config}
            setConfig={setConfig}
            activeTab={config.type}
            onImagesChange={handleImagesChange}
            resetSignal={imagesResetSignal}
          />
          <PromptInputTextarea
            autoComplete='off'
            autoCorrect='off'
            autoCapitalize='off'
            spellCheck={false}
            className='min-h-20 px-5 pt-4 pb-3 leading-7 md:min-h-24 md:text-base'
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('Ask anything')}
            value={text}
          />
        </div>

        <PromptInputFooter className='border-border/60 bg-muted/20 dark:bg-muted/10 border-t px-3 py-2.5 backdrop-blur rounded-br-[20rem] rounded-bl-[20rem]'>
          <PlaygroundInputControls
            disabled={disabled}
            groups={groups}
            groupValue={groupValue}
            isGenerating={isGenerating}
            isModelLoading={isModelLoading}
            models={models}
            modelValue={modelValue}
            onGroupChange={onGroupChange}
            onModelChange={onModelChange}
            onStop={onStop}
            text={text}
            tools={
              <PlaygroundInputTools
                config={config}
                setConfig={setConfig}
                disabled={disabled}
                hasMessages={hasMessages}
                onConfigChange={onConfigChange}
                onClearMessages={onClearMessages}
                onParameterEnabledChange={onParameterEnabledChange}
                parameterEnabled={parameterEnabled}
              />
            }
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
