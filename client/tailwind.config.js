/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#080b14',
        panel: '#101522',
        line: '#232b3c',
        electric: '#7c8cff',
      },
      boxShadow: {
        glow: '0 0 50px rgba(98, 112, 255, 0.16)',
      },
    },
  },
  plugins: [],
};
