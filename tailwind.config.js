/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx,js,jsx}',
    './pages/**/*.{ts,tsx,js,jsx}',
    './hooks/**/*.{ts,tsx,js,jsx}',
    './lib/**/*.{ts,tsx,js,jsx}',
    './services/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Grok/X Design System - Single accent color (#1D9BF0)
        accent: {
          50: '#E8F5FD',
          100: '#D1EBFB',
          200: '#A3D7F7',
          300: '#75C3F3',
          400: '#47AFEF',
          500: '#1D9BF0', // Primary accent - Grok Blue
          600: '#177CC0',
          700: '#115D90',
          800: '#0B3E60',
          900: '#061F30',
        },
      },
    },
  },
  plugins: [],
};
