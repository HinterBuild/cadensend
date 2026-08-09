/**
 * Tests for dashboard page
 */

import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';
import { useAuth } from '@/contexts/AuthContext';

// Mock the auth context
jest.mock('@/contexts/AuthContext', () => ({
    useAuth: jest.fn(),
    useRequireAuth: jest.fn(),
}));

describe('DashboardPage', () => {
    beforeEach(() => {
        (useAuth as jest.Mock).mockReturnValue({
            user: { id: '1', email: 'test@example.com' },
            loading: false,
        });
    });

    it('renders the dashboard title', async () => {
        render(<DashboardPage />);
        expect(screen.getByText('Cadensend')).toBeInTheDocument();
    });

    it('shows create new series button', async () => {
        render(<DashboardPage />);
        expect(screen.getByText('Create New Series')).toBeInTheDocument();
    });

    it('displays series when loaded', async () => {
        render(<DashboardPage />);
        await waitFor(() => {
            expect(screen.getByText('Intro to Kubernetes')).toBeInTheDocument();
        });
    });
});
