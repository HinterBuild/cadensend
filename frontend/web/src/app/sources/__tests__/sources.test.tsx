import { render, screen, fireEvent } from '@testing-library/react';
import SourcesPage from '../page';
import { sourceApi } from '@/lib/api';

jest.mock('@/contexts/AuthContext', () => ({ useRequireAuth: () => ({ loading: false }) }));
jest.mock('@/lib/api', () => ({ sourceApi: { list: jest.fn(), delete: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

it('distinguishes a load failure from an empty library and allows retry', async () => {
  (sourceApi.list as jest.Mock).mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValue({ data: [] });
  render(<SourcesPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  expect(screen.queryByText('Build your reference library')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Build your reference library')).toBeInTheDocument();
});

it('requires confirmation before deleting a source and preserves it after a failed delete', async () => {
  (sourceApi.list as jest.Mock).mockResolvedValue({ data: [{ id: 'source-1', url: 'https://example.com/reference', type: 'url', scope: 'workspace', status: 'ready' }] });
  (sourceApi.delete as jest.Mock).mockRejectedValue(new Error('Could not delete'));
  render(<SourcesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete https://example.com/reference' }));
  expect(sourceApi.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete source', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete');
  expect(screen.getByRole('heading', { name: 'https://example.com/reference' })).toBeInTheDocument();
});
