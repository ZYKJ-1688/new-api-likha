import { useTranslation } from 'react-i18next'
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block'
import { KeyRound, Library, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { Link } from '@tanstack/react-router'
import { useRef, useMemo } from 'react';
import { PublicLayout } from '@/components/layout'
const titleCssStr = "scroll-mt-24 text-2xl font-semibold tracking-tight md:text-3xl font-['Public_Sans',sans-serif]"
function dedent(strings: TemplateStringsArray, ...values: any[]) {
  let str = String.raw({ raw: strings }, ...values);
  const lines = str.split('\n');
  // 👉 重点：跳过第一行，从第二行开始计算最小缩进
  const contentLines = lines.slice(1).filter(line => line.trim() !== '');
  if (contentLines.length === 0) return str;
  const minIndent = Math.min(...contentLines.map(line => {
    const match = line.match(/^(\s*)/)!;
    return match[1].length;
  }));
  // 第一行不动；剩下每行砍掉 minIndent 个空格
  return lines.map((line, idx) => {
    if(idx === 0) return line;
    return line.slice(minIndent);
  }).join('\n');
}
export function Docs() {
  const { t } = useTranslation()
  const contentRef = useRef<HTMLDivElement>(null);
  const columns = [
    {
      accessorKey: 'method',
      header: t('Method'),
      size: 40
    },
    {
      accessorKey: 'address',
      header: t('Path'),
      size: 160
    },
    {
      accessorKey: 'protocol',
      header: t('Protocol'),
      size: 100
    },
    {
      accessorKey: 'check',
      header: t('Authentication'),
      size: 100
    }
  ]
  const tableData = [
    { method: 'POST', address: '/v1/chat/completions', protocol: 'OpenAI Chat Completions', check: 'Authorization: Bearer' },
    { method: 'POST', address: '/v1/responses', protocol: 'OpenAI Responses', check: 'Authorization: Bearer' },
    { method: 'POST', address: '/v1/messages', protocol: 'Anthropic Messages', check: 'Authorization: x-api-key' },
    { method: 'POST', address: '/v1beta/models/{model}:generateContent', protocol: 'Gemini generateContent', check: 'x-goog-api-key' },
    { method: 'GET', address: '/v1/models', protocol: t('Keys, Logs & Usage'), check: 'Authorization: Bearer' }
  ]
  const tableOptions = useMemo(() => ({
    data: tableData,
    columns: columns,
    enableRowSelection: false,
    enableSorting: false,
  }), [t]);
  const { table } = useDataTable(tableOptions);
  const tocList = [
    {
      id: '1',
      title: t('Quick Start'),
    },
    {
      id: '2',
      title: t('Verified Endpoints'),
    },
    {
      id: '3',
      title: t('OpenAI Compatible SDK'),
    },
    {
      id: '4',
      title: t('Anthropic Compatible SDK'),
    },
    {
      id: '5',
      title: t('Gemini Compatible REST'),
    },
    {
      id: '6',
      title: t('Developer Clients'),
    },
    {
      id: '7',
      title: t('Keys, Logs & Usage'),
    },
  ]
  // 点击目录，平滑滚动到章节
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.offsetTop - 80, // 减去顶部header高度，防止标题被遮挡
      behavior: 'instant'
    });
  };
  return (
    <PublicLayout>
      <div className='mx-auto max-w-6xl'>
        <div className='w-full border-b pb-12'>
          <div className='text-muted-foreground flex items-center gap-2'>
            <BookOpen size={16} />
            <span className='text-sm leading-7'>{t('LIHKA Developer Docs')}</span>
          </div>
          <h1 className="mt-5 max-w-4xl text-[clamp(2.5rem,7vw,4rem)] leading-[0.98] font-semibold tracking-[-0.045em]">{t('Call online APIs following clear interface specifications')}</h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-7 md:text-lg">{t('Use accurate identifiers from the current host, API keys, and model catalog. The examples below do not hardcode model names and do not include platform capabilities not confirmed in documentation.')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type='button'
              render={<Link to='/pricing'/>}
            >
              <Library data-icon='inline-start' />
              {t('Browse available models')}
            </Button>
            <Button
              type='button'
              variant='outline'
              render={<Link to='/keys'/>}
            >
              <KeyRound data-icon='inline-start' />
              {t('Manage API Keys')}
            </Button>
          </div>
        </div>
        <div className="flex gap-8 mt-12">
          {/* 左侧TOC目录 sticky 滚动固定 */}
          <aside className="w-60 shrink-0 sticky top-20 h-full overflow-auto">
            <nav>
              <ul className="space-y-1">
                {tocList.map((item) => (
                  <li key={item.id} className='cursor-pointer'>
                    <div
                      onClick={() => scrollToSection(item.id)}
                      className='py-2 px-4 text-sm rounded-[1rem] text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    >
                      {item.title}
                    </div>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
          {/* 右侧文档内容区域 */}
          <main ref={contentRef} className="flex-1 min-w-0">
            <div className='item' id="1">
              <div className='flex flex-col gap-7 pb-30'>
                <h2 className={titleCssStr}>{t('Quick Start')}</h2>
                <ol className="flex flex-col gap-6">
                  <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                    <span className="bg-muted flex size-8 items-center justify-center rounded-full border font-mono text-xs font-semibold">1</span>
                    <div>
                      <h3 className="leading-7 font-medium">{t('Create API key after login')}</h3>
                      <div className="text-muted-foreground mt-1 text-sm leading-6">{t('The platform validates keys based on account groups, selected models, remaining quota and channel configurations simultaneously.')}</div>
                    </div>
                  </li>
                  <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                    <span className="bg-muted flex size-8 items-center justify-center rounded-full border font-mono text-xs font-semibold">2</span>
                    <div>
                      <h3 className="leading-7 font-medium">{t('Copy accurate model identifiers')}</h3><div className="text-muted-foreground mt-1 text-sm leading-6">{t('Use the public model catalog or call GET /v1/models with your key.')}</div>
                    </div>
                  </li>
                  <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                    <span className="bg-muted flex size-8 items-center justify-center rounded-full border font-mono text-xs font-semibold">3</span>
                    <div>
                      <h3 className="leading-7 font-medium">{t('Set local environment variables')}</h3>
                      <div className="text-muted-foreground mt-1 text-sm leading-6">{t('Do not store credentials in source files or browser-side code.')}</div>
                    </div>
                  </li>
                </ol>
                <CodeBlock
                  code={`export COMPUTINGER_BASE_URL="https://www.computinger.com"
export COMPUTINGER_API_KEY="replace-with-your-api-key"
export COMPUTINGER_MODEL="replace-with-a-model-from-the-catalog"`}
                  language='json'
                  maxExpandedLines={20}
                  showToolbar
                  title={'terminal'}
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
                <CodeBlock
                  code={dedent`curl "$COMPUTINGER_BASE_URL/v1/chat/completions" \\
  \ -H "Authorization: Bearer $COMPUTINGER_API_KEY" \\
  \ -H "Content-Type: application/json" \\
  \ -d '{
      "model": "'"$COMPUTINGER_MODEL"'",
      "messages": [{"role": "user", "content": "Hello"}]
    }'`}
                  language='json'
                  maxExpandedLines={20}
                  showToolbar
                  title={'terminal'}
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
                <div className='text-muted-foreground overflow-hidden rounded-lg border p-2 text-left text-sm'>
                  <div className='text-card-foreground'>{t('Model visibility and invocation permissions are separate')}</div>
                  <div>{t('Every published model remains visible in the catalog. Key, group, model, quota and channel rules on the server still accept or reject requests.')}</div>
                </div>
              </div>
            </div>
            <div className='item' id="2">
              <div className='flex flex-col gap-7 pb-30'>
                <h2 className={titleCssStr}>{t('Verified Endpoints')}</h2>
                <p className="text-muted-foreground text-[15px] leading-7">{t('These routes fall within the scope of the current Computinger API. Other routes may exist in the system, but only those explicitly listed in the documentation constitute public API agreements.')}</p>
                {/* ✅ 直接把 table 传给组件，不再用state中转 */}
                <DataTablePage
                  table={table}
                  columns={columns}
                  className='h-auto min-h-0 flex-1'
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
            <div className='item' id="3">
              <div className='flex flex-col gap-7 pb-30'>
                <h2 className={titleCssStr}>{t('OpenAI Compatible SDK')}</h2>
                <p className="text-muted-foreground text-[15px] leading-7">{t('Set the SDK Base URL to Computinger\'s /v1 address and pass the model identifier via environment variables.')}</p>
                <h3 className="text-lg font-semibold">{t('Python Chat Completions')}</h3>
                <CodeBlock
                  code={dedent`import os
                    from openai import OpenAI
                    client = OpenAI(
                        base_url=f"{os.environ['COMPUTINGER_BASE_URL']}/v1",
                        api_key=os.environ["COMPUTINGER_API_KEY"],
                    )
                    response = client.chat.completions.create(
                        model=os.environ["COMPUTINGER_MODEL"],
                        messages=[{"role": "user", "content": "Hello"}],
                    )
                    print(response.choices[0].message.content)`}
                  language='python'
                  maxExpandedLines={20}
                  showToolbar
                  title={'app.py'}
                  className="[&_.tracking-wide]:!normal-case"
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
                <h3 className="text-lg font-semibold">{t('TypeScript Responses Example')}</h3>
                <CodeBlock code={dedent`import OpenAI from 'openai'
                    const client = new OpenAI({
                      baseURL: \`\${process.env.COMPUTINGER_BASE_URL}/v1\`,
                      apiKey: process.env.COMPUTINGER_API_KEY,
                    })
                    const response = await client.chat.completions.create({
                      model: process.env.COMPUTINGER_MODEL!,
                      input: 'Hello',
                    })
                    console.log(response.output_text)`}
                  language='python'
                  maxExpandedLines={20}
                  showToolbar
                  title={'app.ts'}
                  className="[&_.tracking-wide]:!normal-case"
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
              </div>
            </div>
            <div className='item' id="4">
              <div className='flex flex-col gap-7 pb-30'>
                <h2 className={titleCssStr}>{t('Anthropic Compatible SDK')}</h2>
                <p className="text-muted-foreground text-[15px] leading-7">{t('The Anthropic client uses the host address as Base URL and appends /v1/messages automatically.')}</p>
                <CodeBlock
                  code={dedent`import os
                    from anthropic import Anthropic
                    client = Anthropic(
                        base_url=os.environ["COMPUTINGER_BASE_URL"],
                        api_key=os.environ["COMPUTINGER_API_KEY"],
                    )
                    message = client.messages.create(
                        model=os.environ["COMPUTINGER_MODEL"],
                        max_tokens=256,
                        messages=[{"role": "user", "content": "Hello"}],
                    )
                    print(message.content[0].text)`}
                  language='python'
                  maxExpandedLines={20}
                  showToolbar
                  title={'app.py'}
                  className="[&_.tracking-wide]:!normal-case"
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
                <div className='text-muted-foreground overflow-hidden rounded-lg border p-2 text-left text-sm'>
                  <div className='text-card-foreground'>{t('Use /v1/messages')}</div>
                  <div>{t('Do not add the /anthropic prefix. The public Anthropic-compatible route is /v1/messages.')}</div>
                </div>
              </div>
            </div>
            <div className='item' id="5">
              <div className='flex flex-col gap-7 pb-30'>
                <h2 className={titleCssStr}>{t('Gemini Compatible REST')}</h2>
                <p className="text-muted-foreground text-[15px] leading-7">{t('Write the exact model identifier into the URL and send the API key through the x-goog-api-key request header.')}</p>
                <CodeBlock
                  code={dedent`curl "$COMPUTINGER_BASE_URL/v1beta/models/$COMPUTINGER_MODEL:generateContent" 
                    -H "x-goog-api-key: $COMPUTINGER_API_KEY" 
                    -H "Content-Type: application/json" 
                    -d '{
                      "contents": [{"parts": [{"text": "Hello"}]}]
                    }'`}
                  language='python'
                  maxExpandedLines={20}
                  showToolbar
                  title={'app.py'}
                  className="[&_.tracking-wide]:!normal-case"
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
              </div>
            </div>
            <div className='item' id="6">
              <div className='flex flex-col gap-7 pb-30'>
                <h2 className={titleCssStr}>{t('Developer Clients')}</h2>
                <p className="text-muted-foreground text-[15px] leading-7">{t('Only use these protocol settings in clients that support custom providers or base URLs. Product menus may vary depending on client version.')}</p>
                <h3 className="text-lg font-semibold">Codex CLI</h3>
                <CodeBlock
                  code={dedent`[model_providers.computinger]
                    name = "Computinger"
                    base_url = "https://www.computinger.com/v1"
                    env_key = "COMPUTINGER_API_KEY"
                    wire_api = "responses"
                    [profiles.computinger]
                    model_provider = "computinger"
                    model = "replace-with-a-model-from-the-catalog"`}
                  language='python'
                  maxExpandedLines={20}
                  showToolbar
                  title={'~/.codex/config.toml'}
                  className="[&_.tracking-wide]:!normal-case"
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
                <h3 className="text-lg font-semibold">Claude Code</h3>
                <CodeBlock
                  code={dedent`export ANTHROPIC_BASE_URL="$COMPUTINGER_BASE_URL"
                    export ANTHROPIC_AUTH_TOKEN="$COMPUTINGER_API_KEY"
                    claude --model "$COMPUTINGER_MODEL"`}
                  language='python'
                  maxExpandedLines={20}
                  showToolbar
                  title={'terminal'}
                  className="[&_.tracking-wide]:!normal-case"
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
                <h3 className="text-lg font-semibold">{t('Other OpenAI Compatible Clients')}</h3>
                <div className="bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
                  <div className="bg-background p-4">
                    <p className="text-muted-foreground text-xs">{t('API Address')}</p>
                    <code className="mt-2 block overflow-x-auto font-mono text-xs">https://www.computinger.com/v1</code>
                  </div>
                  <div className="bg-background p-4">
                    <p className="text-muted-foreground text-xs">{t('API Key')}</p>
                    <code className="mt-2 block overflow-x-auto font-mono text-xs">COMPUTINGER_API_KEY</code>
                  </div>
                  <div className="bg-background p-4">
                    <p className="text-muted-foreground text-xs">{t('Model')}</p>
                    <code className="mt-2 block overflow-x-auto font-mono text-xs">COMPUTINGER_MODEL</code>
                  </div>
                </div>
              </div>
            </div>
            <div className='item' id="7">
              <div className='flex flex-col gap-7 pb-30'>
                <h2 className={titleCssStr}>{t('Keys, Logs & Usage')}</h2>
                <p className="text-muted-foreground text-[15px] leading-7">{t('After sending requests, verify actual processing results through console logs. Do not infer limits, pricing or capabilities solely from model names.')}</p>
                <div className='flex flex-row gap-4'>
                  <Link to='/keys' className="text-card-foreground flex rounded-xl border justify-center cursor-pointer px-4 py-1 text-sm leading-6 w-[33%]">
                    <span>{t('Manage API Keys')}</span>
                  </Link>
                  <Link to={"/usage-logs/common" as any} className="text-card-foreground flex rounded-xl border justify-center cursor-pointer px-4 py-1 text-sm leading-6 w-[33%]">
                    <span>{t('Check Usage Logs')}</span>
                  </Link>
                  <Link to='/wallet' className="text-card-foreground flex rounded-xl border justify-center cursor-pointer px-4 py-1 text-sm leading-6 w-[33%]">
                    <span>{t('View Quota and History')}</span>
                  </Link>
                </div>
                <div className="text-muted-foreground flex items-start gap-3 rounded-xl border p-4 text-sm leading-6">
                  <span>{t('When troubleshooting, retain the request time and request ID shown in API or usage logs.')}</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </PublicLayout>
  );
}
