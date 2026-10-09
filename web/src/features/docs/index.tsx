import { useTranslation } from 'react-i18next'
import { useState, useEffect, useRef } from 'react';
import { PublicLayout } from '@/components/layout'

// 目录条目类型
interface TocItem {
  id: string;
  title: string;
  level: number; // 2=h2,3=h3
}

// export function Docs() {
//   const { t } = useTranslation()

//   return (
//     <PublicLayout>
//       <div className='mx-auto max-w-6xl px-4 py-8'>
//         12312312312312
//       </div>
//     </PublicLayout>
//   )
// }

export function Docs() {
  const [activeId, setActiveId] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);
  const [tocList, setTocList] = useState<TocItem[]>([]);

  // 1. 自动提取右侧内容里所有h2/h3，生成目录
  useEffect(() => {
    if (!contentRef.current) return;
    const headings = Array.from(contentRef.current.querySelectorAll('h2, h3'))
      .map((el) => ({
        id: el.id,
        title: el.textContent || '',
        level: Number(el.tagName.replace('H', '')),
      }));
    setTocList(headings);
  }, []);

  // 2. 滚动监听，自动高亮当前章节
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      // 取所有标题元素
      const items = tocList.map(item => document.getElementById(item.id)).filter(Boolean) as HTMLElement[];
      let current = '';
      for (const el of items) {
        if (el.offsetTop - 120 <= scrollY) {
          current = el.id;
        } else {
          break;
        }
      }
      setActiveId(current);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [tocList]);

  // 3. 点击目录，平滑滚动到章节
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({
      top: el.offsetTop - 100, // 减去顶部header高度，防止标题被遮挡
      behavior: 'smooth'
    });
  };

  return (
    <PublicLayout>
      <div className="flex gap-8 max-w-6xl mx-auto p-4">
        {/* 左侧TOC目录 sticky 滚动固定 */}
        <aside className="w-64 shrink-0 sticky top-20 h-[calc(100vh-80px)] overflow-auto">
          <nav>
            <ul className="space-y-1">
              {tocList.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => scrollToSection(item.id)}
                    className={`text-left w-full py-1 px-2 rounded transition-all ${
                      activeId === item.id
                        ? 'text-blue-600 font-medium bg-blue-50'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* 右侧文档内容区域，h2/h3 必须带id */}
        <main ref={contentRef} className="flex-1">
          <h2 id="intro">简介</h2>

          <h2 id="quickstart">快速开始</h2>

          <h3 id="quickstart-key">获取密钥</h3>

          <h2 id="api">API接口</h2>
          
        </main>
      </div>
    </PublicLayout>
  );
}
