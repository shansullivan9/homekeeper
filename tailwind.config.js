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
        surface: {
          primary: '#FFFFFF',
          secondary: '#F2F2F7',
          tertiary: '#E5E5EA',
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
      borderRadius: {
        'ios': '12px',
        'ios-lg': '16px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'sheet': '0 -4px 24px rgba(0,0,0,0.12)',
        'nav': '0 -1px 0 rgba(0,0,0,0.08)',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
