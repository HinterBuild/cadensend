/**
 * Tests for dashboard page
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';
import { seriesApi } from '@/lib/api';

jest.mock('@/components/assistant/AssistantChat', () => ({
  AssistantChat: () => <div data-testid="assistant-chat" />,
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock api client
jest.mock('@/lib/api', () => ({
  seriesApi: {
    list: jest.fn(),
  },
}));

const mockRequireAuth = { user: { id: '1', email: 'test@example.com' }, loading: false };
const mockAuth = { user: { id: '1', email: 'test@example.com' }, loading: false, logout: jest.fn() };

// Inline mock for context in each test
jest.mock('@/contexts/AuthContext', () => ({
  useRequireAuth: jest.fn(),
  useAuth: jest.fn(),
}));

const mockSeries = [
  {
    id: '1',
    workspace_id: 'ws_001',
    slug: 'intro-to-kubernetes',
    topic: 'Intro to Kubernetes',
    goal: 'Learn Kubernetes fundamentals',
    level: 'beginner',
    timezone: 'UTC',
    status: 'planned',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
];

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require('@/contexts/AuthContext') as any).useRequireAuth.mockReturnValue(mockRequireAuth);
    (require('@/contexts/AuthContext') as any).useAuth.mockReturnValue(mockAuth);
    (seriesApi.list as jest.Mock).mockResolvedValue({ series: mockSeries });
  });

  it('renders the dashboard title', async () => {
    render(<DashboardPage />);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('shows create new series button', async () => {
    render(<DashboardPage />);
    expect(await screen.findByText('Create New Series')).toBeInTheDocument();
  });

  it('filters series by topic and restores results when filters are cleared', async () => {
    render(<DashboardPage />);
    const search = await screen.findByRole('searchbox', { name: 'Search series' });
    fireEvent.change(search, { target: { value: 'missing topic' } });
    expect(screen.queryByText('Intro to Kubernetes')).not.toBeInTheDocument();
    expect(screen.getByText('No results match this view')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Intro to Kubernetes')).toBeInTheDocument();
    expect(search).toHaveValue('');
  });

  it('displays series when loaded', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Intro to Kubernetes')).toBeInTheDocument();
    });
  });
});