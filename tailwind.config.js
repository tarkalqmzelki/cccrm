/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#0A0A0A',
          900: '#0A0A0A',
          800: '#171717',
          700: '#262626',
          600: '#404040',
          500: '#525252',
          400: '#737373',
          300: '#A3A3A3',
          200: '#D4D4D4',
          100: '#E5E5E5',
          50: '#F5F5F5',
        },
        canvas: '#FAFAFA',
        surface: '#FFFFFF',
        line: '#ECECEC',
        // status accents (used sparingly)
        pos: '#16A34A',
        posBg: '#F0FDF4',
        neg: '#DC2626',
        negBg: '#FEF2F2',
        warn: '#D97706',
        warnBg: '#FFFBEB',
        info: '#2563EB',
        infoBg: '#EFF6FF',
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
        glass: '0 8px 32px rgba(10,10,10,0.10)',
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
