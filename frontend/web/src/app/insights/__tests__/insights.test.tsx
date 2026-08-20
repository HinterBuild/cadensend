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
  series_by_status: [{ name: 'active', count: 1 }],
  issues_by_status: [{ name: 'sent', count: 4 }],
  levels: [{ name: 'beginner', count: 2 }],
  genres: [{ name: 'programming', count: 2 }],
  topics: [{ name: 'Python', count: 1 }],
  diagrams_by_type: [{ name: 'mermaid', count: 3 }],
  sources_by_status: [{ name: 'ready', count: 1 }],
  pipeline: { planned_modules: 8, issues_total: 4, generated: 4, sent: 4, failed: 0 },
  cadence: { due_next_7_days: 1, overdue_pending: 0, stale_active_series: 0 },
  plan: { ready: 1, generating: 0, failed: 0, empty: 0, placeholder_titles: 0 },
  activity: [{ week_start: '2026-08-17', series_created: 1, issues_created: 2, issues_sent: 1 }],
  coverage: [{ series_id: 's1', topic: 'Python', planned: 4, issued: 2, percent: 50 }],
  improvements: [{ kind: 'no_diagrams', title: 'No diagrams', detail: 'Python', series_id: 's1' }],
  suggestions: [
    {
      topic: 'Intermediate Python',
      goal: 'Go deeper',
      level: 'intermediate',
      genre: 'programming',
      reason: 'You already have a beginner series.',
    },
  ],
};

describe('InsightsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require('@/contexts/AuthContext') as { useRequireAuth: jest.Mock }).useRequireAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com' },
      loading: false,
    });
    (analyticsApi.overview as jest.Mock).mockResolvedValue({ data: overview });
  });

  it('renders headline stats and suggestions', async () => {
    render(<InsightsPage />);
    expect(await screen.findByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Topics covered')).toBeInTheDocument();
    });
    expect(screen.getByText('Intermediate Python')).toBeInTheDocument();
    expect(screen.getByText('No diagrams')).toBeInTheDocument();
  });
});
