/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // All colors use CSS variables so `.dark` scope can override
        // them in one place. The `<alpha-value>` syntax lets Tailwind's
        // `/30` `/60` opacity modifiers work on var-based colors.
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          50: 'rgb(var(--ink-50) / <alpha-value>)',
        },
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        pos: 'rgb(var(--pos) / <alpha-value>)',
        posBg: 'rgb(var(--pos-bg) / <alpha-value>)',
        neg: 'rgb(var(--neg) / <alpha-value>)',
        negBg: 'rgb(var(--neg-bg) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        warnBg: 'rgb(var(--warn-bg) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        infoBg: 'rgb(var(--info-bg) / <alpha-value>)',
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',
        lg: '14px',
        xl: '16px',
        '2xl': '20px',
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
      },
      boxShadow: {
        none: 'none',
        glass: '0 8px 32px var(--shadow-glass)',
      },
      backdropBlur: {
        glass: '20px',
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
      },
      transitionTimingFunction: {
        pulse: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-in': 'fade-in 200ms cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
}
