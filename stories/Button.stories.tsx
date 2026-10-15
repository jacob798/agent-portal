import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Button from '@/components/ui/Button';
const meta = { title: 'Components/Button', component: Button,
  args: { children: 'Review trip', variant: 'primary', size: 'md' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Disabled: Story = { args: { disabled: true } };
