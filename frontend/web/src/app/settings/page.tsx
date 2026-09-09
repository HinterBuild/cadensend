"use client";

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useRequireAuth } from '@/contexts/AuthContext';
import { authApi, modelsApi, emailProviderApi } from '@/lib/api';
import type { EmailProviderConfig, EmailProviderOption } from '@/lib/api';
import { User, Save, Lock, LogOut, AlertCircle, Check, Mail, Clock, ShieldCheck, Sparkles, PenLine } from 'lucide-react';
import { ProviderConfigForm } from '@/components/llm-provider';
import { ModelPicker } from '@/components/llm-provider/ModelPicker';
import { ContentPreferencesEditor } from '@/components/settings/ContentPreferencesEditor';
import { useContentPreferences } from '@/hooks/useContentPreferences';

export default function SettingsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { logout, refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('');
  const [preferredModel, setPreferredModel] = useState('');
  const [llmProvider, setLlmProvider] = useState('openrouter');
  const [workspaceDefaultModel, setWorkspaceDefaultModel] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [emailProviders, setEmailProviders] = useState<EmailProviderOption[]>([]);
  const [emailConfig, setEmailConfig] = useState<EmailProviderConfig | null>(null);
  const [sendProvider, setSendProvider] = useState('brevo');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [savingContentPrefs, setSavingContentPrefs] = useState(false);
  const { prefs: contentPrefs, loading: contentPrefsLoading, save: saveContentPrefs } = useContentPreferences();

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setTimezone(user.timezone || 'UTC');
      setPreferredModel(user.preferred_model || '');
    }
  }, [user]);

  useEffect(() => {
    modelsApi.getProviderConfig().then((res) => {
      const cfg = res.data;
      if (cfg?.provider) setLlmProvider(cfg.provider);
      if (cfg?.default_model) setWorkspaceDefaultModel(cfg.default_model);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    emailProviderApi.listProviders().then((r) => setEmailProviders(r.data ?? [])).catch(() => {});
    emailProviderApi.get().then((r) => {
      const cfg = r.data;
      setEmailConfig(cfg);
      if (cfg.provider) setSendProvider(cfg.provider);
      if (cfg.from_email) setFromEmail(cfg.from_email);
      if (cfg.from_name) setFromName(cfg.from_name);
    }).catch(() => {});
  }, []);

  const handleSaveEmailProvider = async (e: FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    setError(null);
    setSuccess(null);
    try {
      const config: Record<string, string> = {};
      if (sendProvider === 'brevo' || sendProvider === 'sendgrid' || sendProvider === 'mailgun') {
        if (apiKey) config.api_key = apiKey;
      }
      if (sendProvider === 'smtp' || sendProvider === 'gmail') {
        config.smtp_host = smtpHost || (sendProvider === 'gmail' ? 'smtp.gmail.com' : '');
        config.smtp_port = smtpPort;
        config.smtp_user = smtpUser || fromEmail;
        if (smtpPassword) config.smtp_password = smtpPassword;
      }
      await emailProviderApi.update({ provider: sendProvider, from_email: fromEmail, from_name: fromName, config });
      setSuccess('Email provider saved.');
      const refreshed = await emailProviderApi.get();
      setEmailConfig(refreshed.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save email provider');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setError(null);
    try {
      const res = await emailProviderApi.test();
      setSuccess(res.message || 'Test email sent.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test email failed');
    } finally {
      setTestingEmail(false);
    }
  };

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

  const handleRevokeSessions = async () => {
    setRevokingSessions(true);
    setError(null);
    try {
      const response = await authApi.revokeSessions();
      setSuccess(response.message || 'All other sessions were signed out.');
    } catch (err: any) {
      setError(err.message || 'Failed to revoke sessions.');
    } finally {
      setRevokingSessions(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== user.email) {
      setError(`Type ${user?.email} to confirm account deletion.`);
      return;
    }
    setDeletingAccount(true);
    setError(null);
    try {
      await authApi.deleteAccount(user.id);
      localStorage.clear();
      window.location.href = '/login';
    } catch (err: any) {
      setError(err.message || 'Failed to delete account.');
      setDeletingAccount(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900 mx-auto"
            role="status"
            aria-label="Loading"
          ></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Account</p>
            <h1 className="font-display mt-1 text-3xl tracking-tight text-stone-900">Settings</h1>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
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
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white text-base sm:text-sm"
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
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed text-base sm:text-sm"
                    aria-label="Email address (cannot be changed)"
                  />
                </div>
                <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                  Email cannot be changed from here.
                  {user?.email_verified ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
                      Verified
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"
                      title="Sign in once with a magic link to verify this address"
                    >
                      Not verified — sign in with a magic link to verify
                    </span>
                  )}
                </p>
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
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white text-base sm:text-sm"
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
                  Personal model override
                </label>
                <ModelPicker
                  provider={llmProvider}
                  value={preferredModel}
                  onChange={setPreferredModel}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional override for plan and issue generation. Leave empty to use the workspace default
                  {workspaceDefaultModel ? ` (${workspaceDefaultModel})` : ''}.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 flex items-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                  {!saving && <Save className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </form>
          </div>

          {/* Voices & Goals */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-3 mb-4">
              <PenLine className="h-5 w-5 text-gray-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-gray-900">Voices & goals</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Create custom writing voices and goal presets. They appear when you create a new series.
            </p>
            {contentPrefsLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <ContentPreferencesEditor
                prefs={contentPrefs}
                saving={savingContentPrefs}
                onSave={async (next) => {
                  setSavingContentPrefs(true);
                  try {
                    await saveContentPrefs(next);
                    setSuccess('Voices and goals saved.');
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : 'Failed to save voices and goals');
                  } finally {
                    setSavingContentPrefs(false);
                  }
                }}
              />
            )}
          </div>

          {/* Model provider */}
          <div className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
            <div className="mb-4 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-stone-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-stone-900">Model provider</h2>
            </div>
            <p className="mb-6 text-sm text-stone-500">
              Choose your LLM provider and API key for this workspace. Generation and the assistant use these settings.
            </p>
            <ProviderConfigForm
              onUpdate={() => {
                modelsApi.getProviderConfig().then((res) => {
                  const cfg = res.data;
                  if (cfg?.provider) setLlmProvider(cfg.provider);
                  if (cfg?.default_model) setWorkspaceDefaultModel(cfg.default_model);
                }).catch(() => {});
              }}
            />
          </div>

          {/* Email Provider / Send Inbox */}
          <div className="rounded-2xl border border-[#e7e0d6] bg-white p-6">
            <div className="mb-4 flex items-center gap-3">
              <Mail className="h-5 w-5 text-stone-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-stone-900">Send inbox</h2>
            </div>
            <p className="mb-4 text-sm text-stone-500">
              Choose your email provider. Issues send from your configured inbox.
            </p>
            {emailConfig?.using_env && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Using platform default (Brevo). Configure below to use your own provider.
              </p>
            )}
            {emailConfig?.verified && !emailConfig.using_env && (
              <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Provider verified — test email succeeded.</p>
            )}
            <form onSubmit={handleSaveEmailProvider} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                <select
                  value={sendProvider}
                  onChange={(e) => setSendProvider(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                >
                  {emailProviders.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.description}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">From email</label>
                  <input type="email" required value={fromEmail} onChange={(e) => setFromEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="you@company.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">From name</label>
                  <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Your Newsletter" />
                </div>
              </div>
              {(sendProvider === 'brevo' || sendProvider === 'sendgrid' || sendProvider === 'mailgun') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">API key</label>
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Leave blank to keep existing" />
                </div>
              )}
              {(sendProvider === 'smtp' || sendProvider === 'gmail') && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SMTP host</label>
                    <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                      placeholder={sendProvider === 'gmail' ? 'smtp.gmail.com' : 'smtp.example.com'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SMTP port</label>
                    <input type="text" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SMTP user</label>
                    <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SMTP password / app password</label>
                    <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={handleTestEmail} disabled={testingEmail}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                  {testingEmail ? 'Sending…' : 'Send test email'}
                </button>
                <button type="submit" disabled={savingEmail}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 disabled:opacity-50">
                  {savingEmail ? 'Saving…' : 'Save provider'}
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
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white text-base sm:text-sm"
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
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white text-base sm:text-sm"
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
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-800 text-gray-900 bg-white text-base sm:text-sm"
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
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 flex items-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-800"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                  {!changingPassword && <Lock className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </form>
          </div>

          {/* Security */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="h-5 w-5 text-gray-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-gray-900">Security</h2>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              Signed out everywhere else? Revoke all sessions if a device was lost or you suspect
              unauthorized access. This device stays signed in.
            </p>
            <button
              type="button"
              onClick={handleRevokeSessions}
              disabled={revokingSessions}
              className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {revokingSessions ? 'Revoking…' : 'Sign out all other sessions'}
            </button>
          </div>

          {/* Danger zone */}
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="text-xl font-semibold text-red-800">Danger zone</h2>
            <p className="mb-4 mt-1 text-sm text-red-700">
              Deleting your account revokes all access immediately and signs out every device.
              Your series stay in the workspace for other members.
            </p>
            {!showDeleteZone ? (
              <button
                type="button"
                onClick={() => setShowDeleteZone(true)}
                className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Delete account…
              </button>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleDeleteAccount(); }} className="space-y-3">
                <label htmlFor="delete-confirm" className="block text-sm font-medium text-red-800">
                  Type <span className="font-mono">{user?.email}</span> to confirm
                </label>
                <input
                  id="delete-confirm"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoComplete="off"
                  className="w-full max-w-sm px-3 py-2.5 border border-red-300 rounded-lg bg-white text-base sm:text-sm"
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={deletingAccount || deleteConfirmText !== user?.email}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                  >
                    {deletingAccount ? 'Deleting…' : 'Permanently delete my account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteZone(false);
                      setDeleteConfirmText('');
                    }}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
