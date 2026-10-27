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
import { Trash2Icon } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Menu } from '@base-ui/react/menu';
import { ChevronDown } from 'lucide-react'
import {
  PromptInputButton,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CREATE_MODEL_TYPE, MODEL_LAN_TYPE } from '../../constants'
import type { ParameterEnabled, PlaygroundConfig } from '../../types'
import { PlaygroundParameterPanel } from './playground-parameter-panel'

type PlaygroundInputToolsProps = {
  config: PlaygroundConfig
  disabled?: boolean
  hasMessages?: boolean
  onClearMessages?: () => void
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInputTools({
  config,
  disabled,
  hasMessages = false,
  onClearMessages,
  onConfigChange,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputToolsProps) {
  const { t } = useTranslation()
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  // label 存 i18n key（英文源串），实际文案在渲染处过 t()，
  // 这样切换语言时不用依赖 useMemo 重新计算
  const typeList = [
    { label: t('Text mode'), value: MODEL_LAN_TYPE.text },
    { label: t('Image mode'), value: MODEL_LAN_TYPE.image },
    { label: t('Video mode'), value: MODEL_LAN_TYPE.video }
  ]

  const referenceModeList = useMemo(() => [
    { label: t('Omni reference'), value: CREATE_MODEL_TYPE.almighty, icon: <svg width="1.2em" height="1.2em" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" role="presentation" xmlns="http://www.w3.org/2000/svg"><g><path data-follow-fill="currentColor" d="M4.789 13.926c.393.521.817 1.043 1.272 1.557l-.245.246L4.998 19l3.271-.817.245-.246a26.13 26.13 0 0 0 1.556 1.272l-.583.584a1 1 0 0 1-.464.263l-5.157 1.29a1 1 0 0 1-1.212-1.213l1.289-5.157a.998.998 0 0 1 .263-.465l.583-.584ZM17.263 3a3.738 3.738 0 0 1 3.45 2.305 3.736 3.736 0 0 1-.81 4.07l-7.474 7.472c1.047.755 2.052 1.33 2.945 1.705.85.357 1.503.494 1.939.501.23.004.348-.028.397-.047.02-.05.052-.167.048-.398-.007-.436-.145-1.09-.5-1.938a13.93 13.93 0 0 0-1.136-2.113c.051-.042.102-.085.149-.133l1.302-1.301c2.107 3.131 2.824 6.036 1.557 7.303-1.757 1.757-6.665-.302-10.96-4.597-4.296-4.296-6.354-9.203-4.596-10.96.269-.27.612-.45 1.015-.545-.509 1.776.427 4.553 2.442 7.36l7.592-7.59c.7-.7 1.65-1.094 2.64-1.094Zm0 2c-.46 0-.901.182-1.226.507L8.28 13.263a24.021 24.021 0 0 0 2.452 2.454l7.758-7.756a1.737 1.737 0 0 0 0-2.454A1.737 1.737 0 0 0 17.263 5ZM8.312 2.063a.484.484 0 0 1 .876 0l.468 1.003c.16.343.435.618.778.778l1.003.468a.484.484 0 0 1 0 .876l-1.003.468c-.343.16-.618.435-.778.778l-.468 1.002a.483.483 0 0 1-.876 0l-.468-1.002a1.611 1.611 0 0 0-.778-.778l-1.002-.468a.483.483 0 0 1 0-.876l1.002-.468c.343-.16.618-.435.778-.778l.468-1.003Z" fill="currentColor"></path></g></svg> },
    { label: t('First/Last Frame'), value: CREATE_MODEL_TYPE.headAndTail, icon: <svg width="1.2em" height="1.2em" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" role="presentation" xmlns="http://www.w3.org/2000/svg"><g><path data-follow-fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M3 3a1 1 0 1 1 2 0v.01h8.66V3h3.519A3.82 3.82 0 0 1 21 6.821V17.18A3.82 3.82 0 0 1 17.179 21H13.66v-.01H5V21a1 1 0 1 1-2 0V3Zm16 14.22a1.982 1.982 0 0 1-1.972 1.79H15.66v-3.33H19v1.54ZM17.22 5c.941.091 1.69.84 1.78 1.78v1.56h-3.34V5h1.56Zm-3.56-.01v14.02H5V4.99h8.66ZM19 10.34h-3.34v3.34H19v-3.34Z" fill="currentColor"></path></g></svg> },
  ], [t])

  const handleClearMessages = () => {
    onClearMessages?.()
    setClearConfirmOpen(false)
    toast.success(t('Conversation cleared'))
  }

  const typeName = useMemo(() => {
    const foundItem = typeList.find(item => item?.value === config.type);
    return foundItem ? foundItem.label : '';
  }, [config.type, t])

  const videoModeConfig = useMemo(() => {
    const foundItem = referenceModeList.find(item => item?.value === (config.createVideoMode ?? 0));
    return {
      name: foundItem ? foundItem.label : '',
      icon: foundItem?.icon || ''
    }
  }, [config.createVideoMode, t])

  return (
    <>
      <PromptInputTools className='bg-background/70 border-border/60 rounded-lg border p-1 shadow-xs'>
        <Menu.Root>
          <Menu.Trigger className='flex pr-1 pl-2.5 gap-2 items-center'>
            <span className='text-sm'>{typeName}</span>
            <ChevronDown size={16} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner 
              sideOffset={8} 
              align="start"
              style={{ zIndex: 10000 }}
            >
              <Menu.Popup className="
                border w-40 flex flex-col p-1.5 gap-1.5 group-[.is-user]:border-border/70
                transition-all duration-150 ease-out rounded-lg mb-2
                origin-[var(--transform-origin)] bg-white dark:bg-muted
                data-[starting-style]:opacity-0 data-[starting-style]:scale-95
                data-[ending-style]:opacity-0 data-[ending-style]:scale-95
              ">
                <div className='text-sm pr-2 pl-4 pt-2 pb-1 text-muted-foreground'>{t('Mode Type')}</div>
                {typeList.map((item, index) => {
                  const isSelected = item.value === config.type
                  return <Menu.Item key={index} 
                  className={`
                    text-sm cursor-pointer px-4 py-2.5 rounded-sm
                    data-[highlighted]:!bg-black/10
                    dark:data-[highlighted]:!bg-white/15
                    ${isSelected ? '!bg-black/10 dark:!bg-white/15' : ''}
                  `}
                  onClick={() => onConfigChange('type', item.value)}>{item.label}</Menu.Item>
                })}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        {config.type === 2 && (
          <Menu.Root>
            <Menu.Trigger className='flex pr-1 pl-2.5 gap-2 items-center'>
              {videoModeConfig.icon}
              <span className='text-sm'>{videoModeConfig.name}</span>
              <ChevronDown size={16} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner 
                sideOffset={8} 
                align="start"
                style={{ zIndex: 10000 }}
              >
                <Menu.Popup className="
                  border w-45 flex flex-col p-1.5 gap-1.5 group-[.is-user]:border-border/70
                  transition-all duration-150 ease-out rounded-lg mb-2
                  origin-[var(--transform-origin)] bg-white dark:bg-muted
                  data-[starting-style]:opacity-0 data-[starting-style]:scale-95
                  data-[ending-style]:opacity-0 data-[ending-style]:scale-95
                ">
                  {referenceModeList.map((item, index) => {
                    const isSelected = item.value === (config.createVideoMode ?? 0)
                    return <Menu.Item key={index} 
                    className={`
                      text-sm cursor-pointer px-2.5 py-2.5 rounded-sm
                      data-[highlighted]:!bg-black/10
                      dark:data-[highlighted]:!bg-white/15
                      ${isSelected ? '!bg-black/10 dark:!bg-white/15' : ''}
                    `}
                    onClick={() => onConfigChange('createVideoMode', item.value)}>
                      <div className='flex flex-row gap-2 items-center'>
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </Menu.Item>
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}

        {/* <Tooltip>
          <DropdownMenu>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <PromptInputButton
                      aria-label={t('Attach')}
                      className='text-muted-foreground hover:text-foreground hover:bg-muted/70 font-medium'
                      disabled={disabled}
                      variant='ghost'
                    />
                  }
                >
                  <PaperclipIcon size={16} />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent>
              <p>{t('Attach')}</p>
            </TooltipContent>
            <DropdownMenuContent align='start'>
              {ATTACHMENT_ACTIONS.map(({ action, icon: Icon, label }) => (
                <DropdownMenuItem
                  key={action}
                  onClick={() => handleFileAction(action)}
                >
                  <Icon className='mr-2' size={16} />
                  {t(label)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip> */}

        {/* 未开发的功能暂不展示 */}
        {/* <Tooltip>
          <TooltipTrigger
            render={
              <PromptInputButton
                aria-label={t('Search')}
                className='text-muted-foreground hover:text-foreground hover:bg-muted/70 font-medium'
                disabled={disabled}
                onClick={handleSearchAction}
                variant='ghost'
              >
                <GlobeIcon size={16} />
              </PromptInputButton>
            }
          />
          <TooltipContent>
            <p>{t('Search')}</p>
          </TooltipContent>
        </Tooltip> */}

        <PlaygroundParameterPanel
          config={config}
          disabled={disabled}
          onConfigChange={onConfigChange}
          onParameterEnabledChange={onParameterEnabledChange}
          parameterEnabled={parameterEnabled}
          activeTab={config.type}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <PromptInputButton
                aria-label={t('Clear chat history')}
                className='text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-medium'
                disabled={disabled || !hasMessages || !onClearMessages}
                onClick={() => setClearConfirmOpen(true)}
                variant='ghost'
              >
                <Trash2Icon size={16} />
              </PromptInputButton>
            }
          />
          <TooltipContent>
            <p>{t('Clear chat history')}</p>
          </TooltipContent>
        </Tooltip>
      </PromptInputTools>

      <ConfirmDialog
        destructive
        desc={t(
          'All playground messages saved in this browser will be removed. This cannot be undone.'
        )}
        confirmText={t('Clear')}
        handleConfirm={handleClearMessages}
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={t('Clear chat history?')}
      />
    </>
  )
}
