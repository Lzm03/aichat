/** @type {import('tailwindcss').Config} */
// ESM because package.json sets "type": "module" — as CommonJS this config
// could not be loaded at all, which is part of why it drifted from reality.
export default {
  // Every file that can contain a class name must be listed: the build purges
  // anything it cannot see, so a missing directory loses its styling silently.
  // This list previously held only app/ + components/ — before the config was
  // ever actually compiled, so the gap went unnoticed.
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./utils/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}",
    "./App.tsx",
    "./index.tsx",
    "./index.html",
  ],
  // utils/userPreferences.ts toggles `.dark` on <html>, and globals.css keys its
  // colour tokens off that class — so dark: variants must follow the class too,
  // not the OS setting. No dark: utilities exist yet, so this is preventive.
  darkMode: 'class',
  theme: {
    extend: {
      // fontFamily is deliberately NOT declared here. docs/design-system.md is the
      // single source for type tokens, and this file held a second copy that
      // contradicted reality: the config had Noto Sans TC first, while the app
      // renders Nunito first (globals.css body) and `.font-sans` — used by the
      // AuthPage wordmark and two others — resolved to Tailwind's default system
      // stack under the Play CDN, which never read this file at all. Declaring
      // Noto-first here the moment the config became real would have silently
      // restyled those elements. Unifying the three stacks is a design call
      // (layer B), not part of wiring up the build pipeline.
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
