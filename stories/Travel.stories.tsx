import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Travel from '@/components/travel/Travel';
import type { Trip } from '@/lib/data/travel';

// Explicit fixtures, never imported from the server-backed data module at runtime.
const trips: Trip[] = [{
  id: 'storybook-trip-001', ent: 'PER', dest: 'Seattle · Design review',
  dates: 'Nov 12–14, 2030', start: '2030-11-12', end: '2030-11-14', status: 'up',
  purpose: 'Fictional planning workshop', travelers: ['Demo Traveler'], total: 245,
  itin: [{ ic: '✈️', day: 'Tue Nov 12', title: 'Flight: Sample Air · Boise → Seattle',
    when: '9:00 AM MT – 9:40 AM PT', sub: 'Demo Traveler · fictional itinerary', conf: 'DEMO01' }],
  exps: [{ id: 'storybook-expense-001', ic: '✈️', what: 'Sample Air',
    sub: 'Fictional airfare receipt', amount: 245, gl: 'Travel', status: 'open',
    needsDoc: true, category: 'Flights', traveler: 'Demo Traveler' }],
}];
const meta = {
  title: 'Travel/Existing portal', component: Travel,
  args: { trips, needsTrip: [], credits: [] },
} satisfies Meta<typeof Travel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Example: Story = {};
export const Empty: Story = { args: { trips: [] } };
