"use client";

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useRequireAuth } from '@/contexts/AuthContext';
import { authApi, modelsApi, OpenRouterModel } from '@/lib/api';
import { User, Save, Lock, LogOut, AlertCircle, Check, Mail, Clock, Sparkles } from 'lucide-react';

export default function SettingsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { logout, refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('');
  const [preferredModel, setPreferredModel] = useState('');
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [defaultModel, setDefaultModel] = useState('poolside/laguna-s-2.1:free');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setTimezone(user.timezone || 'UTC');
      setPreferredModel(user.preferred_model || '');
    }
  }, [user]);

  useEffect(() => {
    modelsApi.list().then((res) => {
      setAvailableModels(res.models || []);
      if (res.default_model) {
        setDefaultModel(res.default_model);
      }
    }).catch(() => {
      setAvailableModels([]);
    });
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await authApi.updateUser(user!.id, {
        name: name || undefined,
        timezone: timezone || undefined,
        preferred_model: preferredModel,
      });
      await refreshUser();
      setSuccess('Settings updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword(user!.id, currentPassword, newPassword);
      setSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      if (err.message?.includes('current password is incorrect')) {
        setError('Current password is incorrect. Please try again.');
      } else {
        setError(err.message || 'Failed to change password.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
            role="status"
            aria-label="Loading"
          ></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <button
            type="button"
            aria-label="Sign out"
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2"
          >
            <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid gap-8">
          {/* Profile Settings */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-3 mb-4">
              <User className="h-5 w-5 text-gray-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
                  placeholder="Enter your name"
                  aria-label="Full Name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                    aria-label="Email address (cannot be changed)"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Email cannot be changed from here.</p>
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                  Timezone
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="ai-model" className="block text-sm font-medium text-gray-700 mb-2">
                  AI model
                </label>
                <div className="relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <select
                    id="ai-model"
                    value={preferredModel === defaultModel ? '' : preferredModel}
                    onChange={(e) => setPreferredModel(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
                  >
                    <option value="">Default ({defaultModel})</option>
                    {availableModels
                      .filter((model) => model.id !== defaultModel)
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                  </select>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Used for curriculum planning, series, issues, and visuals via OpenRouter. Leave as default to use {defaultModel}.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                  {!saving && <Save className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </form>
          </div>

          {/* Password Settings */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="h-5 w-5 text-gray-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-gray-900">Password</h2>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div>
                <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-2">
                  Current Password
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  aria-label="Current password"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  aria-label="New password"
                />
                <p className="mt-1 text-xs text-gray-500">Minimum 8 characters.</p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 text-gray-900 bg-white"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  aria-label="Confirm new password"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                  {!changingPassword && <Lock className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
