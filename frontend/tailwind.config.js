import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cadastre: {
          residential: '#10b981', // Emerald green
          commercial: '#0ea5e9', // Sky blue
          common: '#f59e0b', // Amber
          parking: '#8b5cf6', // Purple
          clash: '#ef4444', // Red
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.7)',
          },
          '50%': {
            opacity: '0.8',
            boxShadow: '0 0 40px rgba(239, 68, 68, 1)',
          },
        },
        'fade-in': {
          '0%': {
            opacity: '0',
            transform: 'translateY(-10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
    },
  },
  plugins: [],
}

export default config
