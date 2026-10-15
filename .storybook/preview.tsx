import type { Preview } from '@storybook/nextjs-vite';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '../app/globals.css';
import '../design/generated/tokens.css';
import './preview.css';

// No service-backed mutations in the catalogue. A failed action stays failed,
// rather than presenting a simulated success as a saved production change.
if (typeof window !== 'undefined') {
  window.fetch = async () => new Response(JSON.stringify({ error: 'Read-only synthetic Storybook example. Nothing was saved.' }), {
    status: 403, headers: { 'Content-Type': 'application/json' },
  });
}
const preview: Preview = {
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true }, a11y: { test: 'todo' } },
  decorators: [(Story) => <main className="min-h-screen p-4 sm:p-8">
    <aside className="mb-6 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
      <strong>Design review · fictional data.</strong> Existing portal components; service requests are blocked. This is not an approved new design or a live trip.
    </aside>
    <Story />
  </main>],
};
export default preview;
