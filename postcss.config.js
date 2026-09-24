// Tailwind is compiled here at build time (Vite picks this up automatically).
// It used to come from the Play CDN <script> in index.html, which meant
// production generated its CSS in the browser at runtime.
// ESM because package.json sets "type": "module".
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
