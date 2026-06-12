/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dom: {
          primary:  '#1d4ed8',
          secondary:'#1e40af',
          accent:   '#3b82f6',
        },
        lead: {
          red:  '#ef4444',
          blue: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
};
