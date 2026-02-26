/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans TC"', 'Nunito', 'sans-serif'],
        display: ['"Nunito"', '"Noto Sans TC"', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#4F46E5',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
        }
      },
      boxShadow: {
        'soft-tech': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
