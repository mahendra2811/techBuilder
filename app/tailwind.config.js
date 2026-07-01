/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#1A5276',
        success: '#27AE60',
        danger: '#E74C3C',
        warning: '#F39C12',
      },
    },
  },
  plugins: [],
};
