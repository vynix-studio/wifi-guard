/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base dark theme
        base: {
          900: '#08090B',
          800: '#0B0D10',
          700: '#0E1014',
          600: '#121619',
          500: '#1A1E24',
          400: '#252B33',
          300: '#353D47',
          200: '#4A5563',
          100: '#6B7A8F',
        },
        // Primary accent - electric violet/indigo
        primary: {
          600: '#7C3AED',
          500: '#8B5CF6',
          400: '#A78BFA',
        },
        // Secondary - cool blue
        secondary: {
          600: '#0EA5E9',
          500: '#06B6D4',
          400: '#22D3EE',
        },
        // Security states
        safe: {
          600: '#10B981',
          500: '#34D399',
          400: '#6EE7B7',
        },
        unknown: {
          600: '#F59E0B',
          500: '#FBBF24',
          400: '#FCD34D',
        },
        suspicious: {
          600: '#F97316',
          500: '#FB923C',
          400: '#FDBA74',
        },
        danger: {
          600: '#DC2626',
          500: '#EF4444',
          400: '#F87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '28px' }],
        '2xl': ['20px', { lineHeight: '28px' }],
      },
      backgroundColor: {
        // Use base colors for backgrounds
        app: '#08090B',
        panel: '#0B0D10',
        elevated: '#0E1014',
        hover: '#121619',
      },
      borderColor: {
        subtle: '#1A1E24',
        divider: '#252B33',
      },
      textColor: {
        primary: '#F5F5F5',
        secondary: '#A0A0A0',
        tertiary: '#6B7A8F',
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      boxShadow: {
        panel: '0 4px 12px rgba(0, 0, 0, 0.4)',
        'panel-sm': '0 2px 6px rgba(0, 0, 0, 0.3)',
        overlay: '0 8px 24px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
};
