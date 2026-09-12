import * as AuthContext from '@/contexts/AuthContext';
import { render, screen, waitFor } from '@testing-library/react';
import InsightsPage from '@/app/insights/page';
import { analyticsApi } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  analyticsApi: { overview: jest.fn() },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useRequireAuth: jest.fn(),
}));

const overview = {
  headline: {
    series_total: 2,
    series_active: 1,
    issues_sent: 4,
    unique_topics: 2,
    diagrams: 3,
    code_blocks: 5,
    citations: 1,
  },
  cadence: { due_next_7_days: 1, overdue_pending: 0, stale_active_series: 0 },
  coverage: [{ series_id: 's1', topic: 'Python', planned: 4, issued: 2, percent: 50 }],
  improvements: [{ kind: 'no_diagrams', title: 'No diagrams', detail: 'Python', series_id: 's1' }],
};

describe('InsightsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AuthContext as { useRequireAuth: jest.Mock }).useRequireAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com' },
      loading: false,
    });
    (analyticsApi.overview as jest.Mock).mockResolvedValue({ data: overview });
  });

  it('renders key stats and attention items', async () => {
    render(<InsightsPage />);
    expect(await screen.findByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Active series')).toBeInTheDocument();
    });
    expect(screen.getByText('No diagrams')).toBeInTheDocument();
    expect(screen.getByText('Behind on plan')).toBeInTheDocument();
    expect(screen.queryByText('Topics covered')).not.toBeInTheDocument();
  });
});
