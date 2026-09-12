/**
 * Tests for login page
 */

import * as AuthContext from '@/contexts/AuthContext';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '@/app/login/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock api client
jest.mock('@/lib/api', () => ({
  authApi: {
    login: jest.fn(),
    loginWithMagicLink: jest.fn(),
    verifyMagicLink: jest.fn(),
    getUser: jest.fn(),
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AuthContext.useAuth as jest.Mock).mockReturnValue({ login: jest.fn(), sendMagicLink: jest.fn() });
  });

  it('renders login form', () => {
    render(<LoginPage />);
    expect(screen.getByText('Cadensend')).toBeInTheDocument();
  });

  it('shows email and password fields', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('calls login on form submit', async () => {
    const mockLogin = jest.fn().mockResolvedValue(undefined);
    (AuthContext.useAuth as jest.Mock).mockReturnValue({
      login: mockLogin,
      sendMagicLink: jest.fn(),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('shows error on login failure', async () => {
    const mockLogin = jest.fn().mockRejectedValue(new Error('Login failed'));
    (AuthContext.useAuth as jest.Mock).mockReturnValue({
      login: mockLogin,
      sendMagicLink: jest.fn(),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
  });
});
