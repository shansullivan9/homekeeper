/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fb',
          400: '#36adf6',
          500: '#0c93e7',
          600: '#0074c5',
          700: '#015ca0',
          800: '#064f84',
          900: '#0b426e',
          950: '#072a49',
        },
        accent: {
          50:  '#FFF7ED',
          100: '#FFEDD5',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
        },
        surface: {
          primary: '#FFFFFF',
          secondary: '#F2F2F7',
          tertiary: '#E5E5EA',
          elevated: '#FCFCFE',
        },
        ink: {
          primary: '#1C1C1E',
          secondary: '#6E6E73',
          tertiary: '#AEAEB2',
        },
        status: {
          green: '#34C759',
          yellow: '#FF9F0A',
          red: '#FF3B30',
          blue: '#007AFF',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'micro':    ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
        'caption':  ['13px', { lineHeight: '18px' }],
        'body':     ['15px', { lineHeight: '22px' }],
        'title':    ['17px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
        'headline': ['22px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        'display':  ['28px', { lineHeight: '34px', letterSpacing: '-0.025em' }],
        'mega':     ['34px', { lineHeight: '40px', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        'ios':    '12px',
        'ios-lg': '16px',
        'ios-xl': '20px',
      },
      boxShadow: {
        'card':       '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'sheet':      '0 -4px 24px rgba(0,0,0,0.12)',
        'nav':        '0 -1px 0 rgba(0,0,0,0.08)',
        'float':      '0 12px 32px -8px rgba(12, 147, 231, 0.20), 0 6px 16px -6px rgba(0, 0, 0, 0.06)',
        'elevated':   '0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
        'crisp':      'inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 1px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
      },
      backgroundImage: {
        'gradient-hero':      'linear-gradient(135deg, #0c93e7 0%, #015ca0 100%)',
        'gradient-hero-soft': 'linear-gradient(135deg, #e0effe 0%, #f0f7ff 60%, #ffffff 100%)',
        'gradient-warm':      'linear-gradient(135deg, #FFEDD5 0%, #FFF7ED 100%)',
      },
      spacing: {
        'safe-top':    'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-468px 0' },
          '100%': { backgroundPosition: '468px 0' },
        },
        scaleIn: {
          '0%':   { transform: 'scale(0.94)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        countUp: {
          '0%':   { transform: 'translateY(6px)',  opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        'shimmer':    'shimmer 1.4s linear infinite',
        'scale-in':   'scaleIn 0.18s ease-out',
        'slide-down': 'slideDown 0.22s ease-out',
        'count-up':   'countUp 0.42s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
