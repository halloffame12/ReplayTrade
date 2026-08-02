/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0e17',
          panel: '#0e1420',
          elevated: '#131a29',
          hover: '#1a2233',
          border: '#232c3f',
        },
        accent: {
          DEFAULT: '#4f8cff',
          hover: '#3f76e0',
          dim: 'rgba(79, 140, 255, 0.12)',
        },
        up: {
          DEFAULT: '#22c55e',
          dim: 'rgba(34, 197, 94, 0.12)',
        },
        down: {
          DEFAULT: '#ef4444',
          dim: 'rgba(239, 68, 68, 0.12)',
        },
        text: {
          primary: '#e6ebf5',
          secondary: '#9aa6bd',
          muted: '#5b6a80',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'neo': '3px 3px 0 0 rgba(0,0,0,0.55)',
        'neo-sm': '2px 2px 0 0 rgba(0,0,0,0.5)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
      },
    },
  },
  plugins: [],
};
