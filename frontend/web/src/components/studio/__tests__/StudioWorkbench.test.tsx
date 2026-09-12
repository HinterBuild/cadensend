import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudioWorkbench } from '../StudioWorkbench';
import { platformApi } from '@/lib/api';

const params = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => params }));
jest.mock('@/contexts/AuthContext', () => ({ useRequireAuth: () => ({ loading: false }) }));
jest.mock('@/lib/api', () => ({ platformApi: { skills: jest.fn(), studioMeta: jest.fn(), studioCompose: jest.fn(), studioSection: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  (platformApi.skills as jest.Mock).mockResolvedValue({ data: [{ id: 'daily', name: 'Daily brief', sections: ['intro', 'next'] }] });
  (platformApi.studioMeta as jest.Mock).mockResolvedValue({ data: null });
});

it('keeps an existing draft when generation fails', async () => {
  (platformApi.studioCompose as jest.Mock).mockRejectedValue(new Error('Provider unavailable'));
  render(<StudioWorkbench />);
  const editor = await screen.findByRole('textbox', { name: 'Issue Markdown' });
  fireEvent.change(editor, { target: { value: 'My carefully edited draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate full issue' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable');
  expect(editor).toHaveValue('My carefully edited draft');
});

it('reorders outline sections with the keyboard', async () => {
  render(<StudioWorkbench />);
  const rows = await screen.findAllByRole('listitem');
  expect(rows.length).toBeGreaterThan(1);
  const firstTitle = rows[0].textContent;
  rows[0].focus();
  fireEvent.keyDown(rows[0], { key: 'ArrowDown', shiftKey: true });
  const rowsAfter = screen.getAllByRole('listitem');
  expect(rowsAfter[1].textContent).toContain(firstTitle!.trim().split(/\s/)[0]);
});

it('updates the preview after editing a generated draft', async () => {
  (platformApi.studioCompose as jest.Mock).mockResolvedValue({ data: {
    issue: { markdown: 'Original draft', subject: 'Subject', content_blocks: [] },
    html: '<p>Stale server preview</p>', preheader: { text: '', length: 0 },
  } });
  render(<StudioWorkbench />);
  fireEvent.click(await screen.findByRole('button', { name: 'Generate full issue' }));
  const editor = screen.getByRole('textbox', { name: 'Issue Markdown' });
  await waitFor(() => expect(editor).toHaveValue('Original draft'));
  fireEvent.change(editor, { target: { value: '# Updated heading' } });
  expect(screen.getByRole('heading', { name: 'Updated heading' })).toBeInTheDocument();
  expect(screen.queryByText('Stale server preview')).not.toBeInTheDocument();
});
