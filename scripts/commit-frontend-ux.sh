#!/usr/bin/env bash
# Granular commits for frontend UX/security pass. Excludes AGENTS.md / CLAUDE.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if git diff --cached --quiet && git diff --quiet; then
  echo "Nothing to commit"
  exit 0
fi

commit_paths() {
  local msg="$1"
  shift
  [[ $# -eq 0 ]] && return 0
  git add -- "$@"
  if git diff --cached --quiet; then
    echo "skip (empty): $msg"
    return 0
  fi
  if git diff --cached | grep -Eqi '(sk-[a-z0-9]{20,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY|aws_secret_access_key)'; then
    echo "ABORT: possible secret in staged diff for: $msg"
    exit 1
  fi
  git commit -m "$msg"
  git push origin HEAD
  echo "OK: $msg"
}

commit_paths "chore: ignore local agent notes and env variants" .gitignore

commit_paths "feat(web): add shared errorMessage helper (#38)" \
  frontend/web/src/lib/errors.ts

commit_paths "feat(web): add escaped markdown preview helpers for Studio (#65-68)" \
  frontend/web/src/lib/studioContent.ts

commit_paths "test(web): unit tests for studio markdown utilities (#71)" \
  frontend/web/src/lib/__tests__/studioContent.test.ts

commit_paths "feat(web): add Modal and ConfirmDialog for destructive actions (#36-37)" \
  frontend/web/src/components/Modal.tsx

commit_paths "chore(web): migrate Jest config to CommonJS (#100)" \
  frontend/web/jest.config.cjs \
  frontend/web/jest.config.js

commit_paths "chore(web): migrate test setup to CommonJS (#100)" \
  frontend/web/src/setupTests.cjs \
  frontend/web/src/setupTests.js

commit_paths "chore(web): align ESLint config with App Router (#100)" \
  frontend/web/eslint.config.mjs

commit_paths "docs(web): add font license files for bundled typefaces" \
  frontend/web/src/app/fonts/Geist-OFL.txt \
  frontend/web/src/app/fonts/Newsreader-OFL.txt \
  frontend/web/src/app/fonts/README.md

commit_paths "feat(web): bundle Geist variable font locally (#100 offline build)" \
  frontend/web/src/app/fonts/geist-latin.woff2

commit_paths "feat(web): bundle Newsreader fonts locally (#100 offline build)" \
  frontend/web/src/app/fonts/newsreader-latin.woff2 \
  frontend/web/src/app/fonts/newsreader-latin-italic.woff2

commit_paths "feat(web): load local fonts in root layout (#100)" \
  frontend/web/src/app/layout.tsx

commit_paths "style(web): shared nav, buttons, surfaces, and skip link (#27-42)" \
  frontend/web/src/app/globals.css

commit_paths "feat(web): harden API proxy sessions, CSRF, and query forwarding (#1-12)" \
  frontend/web/src/app/api/v1/\[...slug\]/route.ts

ROUTE_TEST="frontend/web/src/app/api/v1/[...slug]/__tests__/route.test.ts"
mkdir -p "$(dirname "$ROUTE_TEST")"
cat > "$ROUTE_TEST" <<'EOF'
/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

afterEach(() => jest.restoreAllMocks());

it('preserves query parameters when proxying filters and verification links', async () => {
  const upstream = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ data: [] }));
  const response = await GET(new NextRequest('http://localhost:3000/api/v1/runs?kind=plan&status=failed'));
  expect(response.status).toBe(200);
  expect(upstream.mock.calls[0][0]).toBe('http://localhost:8080/v1/runs?kind=plan&status=failed');
});
EOF
commit_paths "test(web): proxy preserves query string (#5-6)" "$ROUTE_TEST"

cat >> "$ROUTE_TEST" <<'EOF'

it('clears the httpOnly session cookie without depending on backend availability', async () => {
  const upstream = jest.spyOn(global, 'fetch');
  const response = await POST(new NextRequest('http://localhost:3000/api/v1/users/logout', {
    method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000', cookie: 'cadensend_session=demo' },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('cadensend_session=;');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(upstream).not.toHaveBeenCalled();
});
EOF
commit_paths "test(web): logout clears httpOnly cookie without backend (#1)" "$ROUTE_TEST"

cat >> "$ROUTE_TEST" <<'EOF'

it('rejects a cross-origin sign-out request', async () => {
  const response = await POST(new NextRequest('http://localhost:3000/api/v1/users/logout', {
    method: 'POST', headers: { origin: 'https://other.example.com', host: 'localhost:3000' },
  }));
  expect(response.status).toBe(403);
  expect(response.headers.get('set-cookie')).toBeNull();
});
EOF
commit_paths "test(web): block cross-origin logout CSRF (#7)" "$ROUTE_TEST"

cat >> "$ROUTE_TEST" <<'EOF'

it('forwards X-Forwarded-For to the backend for rate limiting', async () => {
  const upstream = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ data: [] }));
  await GET(new NextRequest('http://localhost:3000/api/v1/series', {
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      'x-forwarded-for': '203.0.113.44',
    },
  }));
  const init = upstream.mock.calls[0][1] as RequestInit;
  expect((init.headers as Record<string, string>)['X-Forwarded-For']).toBe('203.0.113.44');
});
EOF
commit_paths "test(web): forward X-Forwarded-For for rate limits (#10)" "$ROUTE_TEST"

cat >> "$ROUTE_TEST" <<'EOF'

it('clears the session cookie when a protected route returns 401', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const response = await GET(new NextRequest('http://localhost:3000/api/v1/series', {
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      cookie: 'cadensend_session=eyJhbGciOiJub25lIn0.eyJleHAiOjk5OTk5OTk5OTl9.',
    },
  }));
  expect(response.status).toBe(401);
  expect(response.headers.get('set-cookie')).toContain('cadensend_session=;');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
EOF
commit_paths "test(web): clear session cookie on 401 (#2)" "$ROUTE_TEST"

commit_paths "chore(web): add production security headers in Next config" \
  frontend/web/next.config.ts

commit_paths "fix(web): logout clears client state and redirects safely (#3-4)" \
  frontend/web/src/contexts/AuthContext.tsx

commit_paths "fix(web): keep API client aligned with httpOnly session proxy" \
  frontend/web/src/lib/api.ts

commit_paths "feat(web): shared page chrome primitives (#29-35)" \
  frontend/web/src/components/WorkspaceUI.tsx

commit_paths "refactor(web): grouped sidebar navigation and collapsed a11y (#13-19)" \
  frontend/web/src/components/AppSidebar.tsx

commit_paths "refactor(web): shell header, mobile nav, breadcrumbs, sign-out (#20-28)" \
  frontend/web/src/components/AppShell.tsx

commit_paths "fix(web): dashboard errors, empty states, and delete confirm (#43-49)" \
  frontend/web/src/app/dashboard/page.tsx

commit_paths "test(web): dashboard auth mock and list behavior (#50)" \
  frontend/web/src/app/dashboard/__tests__/dashboard.test.tsx

commit_paths "fix(web): sources distinguish load errors from empty library (#51-62)" \
  frontend/web/src/app/sources/page.tsx

commit_paths "test(web): sources retry UI and delete confirmation (#52)" \
  frontend/web/src/app/sources/__tests__/sources.test.tsx

commit_paths "fix(web): studio draft preservation, live preview, outline keys (#63-69)" \
  frontend/web/src/components/studio/StudioWorkbench.tsx

STUDIO_TEST="frontend/web/src/components/studio/__tests__/StudioWorkbench.test.tsx"
mkdir -p "$(dirname "$STUDIO_TEST")"
cat > "$STUDIO_TEST" <<'EOF'
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
EOF
commit_paths "test(web): studio keeps draft when compose fails (#63-64)" "$STUDIO_TEST"

cat >> "$STUDIO_TEST" <<'EOF'

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
EOF
commit_paths "test(web): studio outline keyboard reorder (#69-70)" "$STUDIO_TEST"

cat >> "$STUDIO_TEST" <<'EOF'

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
EOF
commit_paths "test(web): studio live preview tracks editor (#65-66)" "$STUDIO_TEST"

commit_paths "fix(web): issue editor autosave race and save failures (#73-82)" \
  frontend/web/src/app/issues/\[id\]/page.tsx

commit_paths "fix(web): series detail destructive actions use ConfirmDialog (#93)" \
  frontend/web/src/app/series/\[id\]/page.tsx

commit_paths "refactor(web): simplify series create copy and layout (#94)" \
  frontend/web/src/app/series/create/page.tsx

commit_paths "fix(web): settings account controls and sign-out labels (#83-84)" \
  frontend/web/src/app/settings/page.tsx

commit_paths "refactor(web): simplify model picker (#87)" \
  frontend/web/src/components/llm-provider/ModelPicker.tsx

commit_paths "a11y(web): improve API key input labeling (#89)" \
  frontend/web/src/components/llm-provider/ApiKeyInput.tsx

commit_paths "refactor(web): provider config form spacing (#88)" \
  frontend/web/src/components/llm-provider/ProviderConfigForm.tsx

commit_paths "refactor(web): provider credentials UX (#90)" \
  frontend/web/src/components/llm-provider/ProviderCredentials.tsx

commit_paths "refactor(web): provider selector states (#90)" \
  frontend/web/src/components/llm-provider/ProviderSelector.tsx

commit_paths "chore(web): model capabilities display tweak" \
  frontend/web/src/components/llm-provider/ModelCapabilities.tsx

commit_paths "fix(web): content preferences editor stability (#85-86)" \
  frontend/web/src/components/settings/ContentPreferencesEditor.tsx

commit_paths "fix(web): stabilize content preferences hook (#86)" \
  frontend/web/src/hooks/useContentPreferences.ts

commit_paths "fix(web): recipients delete confirm and error vs empty (#91-92)" \
  frontend/web/src/app/recipients/page.tsx

commit_paths "refactor(web): run center shared header, summary, and errors (#95)" \
  frontend/web/src/app/runs/page.tsx

commit_paths "refactor(web): trim insights to essential stats (#98)" \
  frontend/web/src/app/insights/page.tsx

commit_paths "test(web): insights page smoke tests" \
  frontend/web/src/app/insights/__tests__/insights.test.tsx

commit_paths "fix(web): login page copy and form errors" \
  frontend/web/src/app/login/page.tsx

commit_paths "test(web): login page tests" \
  frontend/web/src/app/login/__tests__/login.test.tsx

commit_paths "fix(web): magic-link verification error handling (#97)" \
  frontend/web/src/app/magic-link/page.tsx

commit_paths "fix(web): recipient verification alerts and proxy query (#96)" \
  frontend/web/src/app/verify-recipient/page.tsx

commit_paths "refactor(web): connectors page copy and layout" \
  frontend/web/src/app/connectors/page.tsx

commit_paths "refactor(web): skills page copy and layout" \
  frontend/web/src/app/skills/page.tsx

commit_paths "refactor(web): workflows page copy and layout" \
  frontend/web/src/app/workflows/page.tsx

commit_paths "refactor(web): assistant chat header and a11y (#99)" \
  frontend/web/src/components/assistant/AssistantChat.tsx

commit_paths "a11y(web): issue tag picker improvements" \
  frontend/web/src/components/assistant/IssueTagPicker.tsx

commit_paths "refactor(web): series setup form card copy" \
  frontend/web/src/components/assistant/SeriesSetupFormCard.tsx

commit_paths "fix(web): assistant chat hook stability" \
  frontend/web/src/hooks/useAssistantChat.ts

commit_paths "fix(web): assistant action handlers" \
  frontend/web/src/lib/assistantActions.ts

commit_paths "fix(web): issue version panel polish" \
  frontend/web/src/components/issues/IssueVersionPanel.tsx

commit_paths "docs: refresh dashboard screenshot" \
  docs/images/dashboard.png

commit_paths "docs: refresh sources screenshot" \
  docs/images/sources.png

commit_paths "docs: refresh studio screenshot" \
  docs/images/studio.png

commit_paths "docs: refresh series create screenshot" \
  docs/images/series-create.png

echo "Done. Remaining status:"
git status --short
