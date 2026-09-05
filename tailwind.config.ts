import type { Config } from 'tailwindcss'

// كل الألوان تُقرأ من متغيرات CSS حتى يتبدّل الوضع النهاري/الليلي بلا إعادة تصيير
const v = (name: string) => `hsl(var(${name}) / <alpha-value>)`

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}', './src/modules/*/renderer/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: v('--bg'),
        surface: v('--surface'),
        'surface-2': v('--surface-2'),
        border: v('--border'),
        fg: v('--fg'),
        muted: v('--muted'),
        accent: v('--accent'),
        'accent-fg': v('--accent-fg'),
        success: v('--success'),
        warning: v('--warning'),
        danger: v('--danger'),
        info: v('--info')
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px'
      },
      boxShadow: {
        soft: '0 1px 2px hsl(220 30% 10% / 0.06), 0 4px 16px hsl(220 30% 10% / 0.06)',
        pop: '0 8px 30px hsl(220 30% 10% / 0.16)'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Noto Sans Arabic', 'Tahoma', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(var(--slide-from, 16px))' }, to: { opacity: '1', transform: 'none' } }
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'scale-in': 'scale-in 140ms ease-out',
        'slide-in': 'slide-in 200ms ease-out'
      }
    }
  },
  plugins: []
} satisfies Config
