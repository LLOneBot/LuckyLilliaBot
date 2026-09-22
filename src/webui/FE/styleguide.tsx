import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import AnimatedBackground from './components/common/AnimatedBackground'
import GlassLens from './components/common/GlassLens'
import { useThemeStore } from './stores/themeStore'
import { setGlassSource } from './utils/glassRuntime'
import './index.css'

// Dev hook: swap the wallpaper the lenses copy from, e.g. for a striped test
// canvas that makes the refraction band visible. The real wallpaper is too
// smooth to show it. Reset by reloading.
;(window as unknown as { __glass: unknown }).__glass = { setGlassSource }

/*
 * Material reference page, served only in dev at /styleguide.html.
 *
 * Every glass variant, the radius ladder and every control, on one screen in
 * both themes. Changing a token in styles/tokens.css shows up here first:
 * checking a token against the real app means logging in and clicking to the
 * right tab, which is slow enough that it stops happening.
 */

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className='mb-12'>
    <h2 className='mb-1 text-lg font-semibold text-theme'>{title}</h2>
    {note && <p className='mb-4 max-w-[62ch] text-sm text-theme-muted'>{note}</p>}
    {children}
  </section>
)

const Swatch: React.FC<{ cls: string; label: string; desc: string }> = ({ cls, label, desc }) => (
  <div className={`glass ${cls} r-panel p-5`}>
    <GlassLens />
    <div className='text-sm font-semibold text-theme'>{label}</div>
    <div className='mt-1 text-xs text-theme-muted'>{desc}</div>
  </div>
)

const Styleguide: React.FC = () => {
  const { isDark, cycleMode, mode } = useThemeStore()
  const [checked, setChecked] = useState(true)
  const [popOpen, setPopOpen] = useState(false)

  return (
    <>
      <AnimatedBackground />
      <div className='relative z-10 mx-auto max-w-5xl px-6 py-12'>
        <header className='mb-12 flex items-start justify-between gap-6'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-theme'>材质样板</h1>
            <p className='mt-2 max-w-[60ch] text-sm text-theme-secondary'>
              Liquid Glass 的四档材质、同心圆角与控件。改 styles/tokens.css 后先来这里对照。
            </p>
          </div>
          <button onClick={cycleMode} className='btn-glass shrink-0'>
            {mode === 'auto' ? '跟随系统' : isDark ? '深色' : '浅色'}
          </button>
        </header>

        <Section
          title='边缘厚度'
          note='真 Liquid Glass 的边缘是折射带：背后内容在边缘被压缩成一圈更亮更密的环。Chrome 会静默丢掉 backdrop-filter 里的 url() SVG 滤镜（filter: url() 正常，backdrop-filter: url() 与纯 blur 逐像素相同），所以这圈环是画出来的：上缘亮、下缘暗的内壁渐变 + 1px 镜面 rim + 外侧暗描边。条纹底可以看到内壁渐变叠在透出的内容上。'
        >
          <div className='r-panel relative overflow-hidden' style={{ height: 200 }}>
            <div
              className='absolute inset-0'
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, var(--accent) 0 16px, transparent 16px 48px)',
                opacity: 0.75,
              }}
            />
            <div className='glass glass-clear r-card absolute inset-x-10 top-1/2 -translate-y-1/2 p-6'>
              <div className='text-sm font-semibold text-theme'>glass-clear</div>
              <div className='mt-1 text-xs text-theme-secondary'>上缘内壁反光，下缘回光，边缘 0.5px 暗线</div>
            </div>
          </div>
        </Section>

        <Section
          title='透镜与自适应'
          note='下面这片浮在裸壁纸上，所以能开透镜：运行时每帧把它每条边内侧的壁纸拉伸画进 14px 的边缘环（凸透镜边缘的放大）。中间仍是 backdrop 模糊，边缘是清晰放大的壁纸 — 厚玻璃的样子。同一份拷贝还采样亮度，写成 --glass-lum；压到暗色区域会自动切换成深色材质。壁纸是浅色时它不会触发，切到深色主题看它跟着变。按住右边的按钮看液化。'
        >
          <div className='glass glass-regular r-window p-6 flex items-center justify-between gap-4'>
            <GlassLens />
            <div>
              <div className='text-sm font-semibold text-theme'>glass-regular + GlassLens</div>
              <div className='mt-1 text-xs text-theme-muted'>
                边缘环里的壁纸比中间清晰，颜色也更密 — 那是折射后的壁纸而不是模糊
              </div>
            </div>
            <div className='relative flex shrink-0 items-center gap-2'>
              <button className='glass glass-chrome glass-interactive r-capsule px-4 py-2 text-sm text-theme'>按住我</button>
              <button
                className='glass glass-chrome glass-interactive r-capsule px-4 py-2 text-sm text-theme'
                onClick={() => setPopOpen((v) => !v)}
              >
                弹出
              </button>
              {popOpen && (
                <div className='bg-popup r-control glass-pop origin-top-right absolute right-0 top-full mt-2 w-44 py-1'>
                  {['从按钮长出来', '缩放 + 淡入', '320ms 玻璃缓动'].map((t) => (
                    <div key={t} className='px-3 py-2 text-sm text-theme fill-quiet-hover'>
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section
          title='四档材质'
          note='越薄越透、内壁越宽。文字多的地方用厚的，浮在内容上的控件用薄的。'
        >
          <div className='grid gap-4 sm:grid-cols-2'>
            <Swatch cls='glass-clear' label='glass-clear' desc='浮在内容/媒体之上，最透，内壁最宽' />
            <Swatch cls='glass-regular' label='glass-regular' desc='主力材质：卡片、面板、侧边栏' />
            <Swatch cls='glass-thick' label='glass-thick' desc='模态与长文本，可读性优先' />
            <Swatch cls='glass-chrome' label='glass-chrome' desc='小控件：按钮、chip、分段选择' />
          </div>
        </Section>

        <Section
          title='同心圆角'
          note='内层半径 = 外层半径 - 间距。嵌套时挑圆角等于挑层级，不是挑大小。'
        >
          <div className='glass glass-regular r-window p-4'>
            <div className='fill-quiet r-panel p-4'>
              <div className='fill-quiet r-card p-4'>
                <div className='fill-quiet r-control p-3'>
                  <div className='fill-quiet r-inner p-2 text-center text-xs text-theme-muted'>
                    r-window 28 → r-panel 22 → r-card 18 → r-control 12 → r-inner 8
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section title='控件' note='强调色只出现在主操作和开启态上，其余一律走无色玻璃。'>
          <div className='glass glass-regular r-panel space-y-5 p-6'>
            <div className='flex flex-wrap items-center gap-3'>
              <button className='btn-primary'>保存更改</button>
              <button className='btn-glass'>取消</button>
              <button className='btn-primary' disabled>
                保存中
              </button>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <input className='input-field' placeholder='未聚焦' />
              <input className='input-field' defaultValue='已填内容' />
            </div>

            <div className='flex items-center gap-6'>
              <label className='flex items-center gap-3'>
                <input
                  type='checkbox'
                  className='switch-toggle'
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                <span className='text-sm text-theme'>标准开关</span>
              </label>
              <label className='flex items-center gap-3'>
                <input type='checkbox' className='switch-toggle-lg' defaultChecked={false} />
                <span className='text-sm text-theme'>大号开关</span>
              </label>
            </div>

            <div className='flex flex-wrap gap-2'>
              <span className='glass glass-chrome r-capsule px-3 py-1.5 text-xs text-theme'>chip</span>
              <span className='fill-selected r-capsule px-3 py-1.5 text-xs' style={{ color: 'var(--accent)' }}>
                已选中
              </span>
              <span className='fill-quiet r-capsule px-3 py-1.5 text-xs text-theme-secondary'>未选中</span>
            </div>
          </div>
        </Section>

        <Section
          title='列表层次'
          note='玻璃里的行用平色填充，不再套一层模糊 — 玻璃叠玻璃两层都会发灰。'
        >
          <div className='glass glass-regular r-panel overflow-hidden'>
            {['第一行', '第二行（选中）', '第三行'].map((label, i) => (
              <div
                key={label}
                className={`flex items-center justify-between px-5 py-3.5 ${i === 1 ? 'fill-selected' : 'fill-quiet-hover'} ${i > 0 ? 'hairline-t' : ''}`}
              >
                <span className='text-sm text-theme'>{label}</span>
                <span className='tnum text-xs text-theme-muted'>{(i + 1) * 1024}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title='文字层级' note='Apple 的四级标签，靠不透明度分层而不是靠不同灰度。'>
          <div className='glass glass-regular r-panel space-y-2 p-6'>
            <p className='text-theme'>text-theme — 正文与标题</p>
            <p className='text-theme-secondary'>text-theme-secondary — 次要说明</p>
            <p className='text-theme-muted'>text-theme-muted — 元信息、时间戳</p>
            <p className='text-theme-hint'>text-theme-hint — 占位符</p>
          </div>
        </Section>

        <Section title='旧语义类' note='.card 与 .bg-popup 已别名到玻璃材质，原有调用点无需改动。'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='card p-5'>
              <div className='text-sm font-semibold text-theme'>.card</div>
              <div className='mt-1 text-xs text-theme-muted'>别名 → regular 的模糊 + 卡片 alpha .52，圆角 r-panel</div>
            </div>
            <div className='bg-popup p-5'>
              <div className='text-sm font-semibold text-theme'>.bg-popup</div>
              <div className='mt-1 text-xs text-theme-muted'>别名 → glass-thick，圆角 r-card</div>
            </div>
          </div>
        </Section>
      </div>
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Styleguide />
  </React.StrictMode>,
)
