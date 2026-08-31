"use client";

import { useState } from 'react';

const CONNECTOR_DOMAINS: Record<string, string> = {
  linear: 'linear.app',
  clickup: 'clickup.com',
  github: 'github.com',
  jira: 'atlassian.com',
  notion: 'notion.so',
  google_drive: 'drive.google.com',
  dropbox: 'dropbox.com',
  airtable: 'airtable.com',
  gmail: 'gmail.com',
  slack: 'slack.com',
  discord: 'discord.com',
  trello: 'trello.com',
  asana: 'asana.com',
  figma: 'figma.com',
  google_calendar: 'calendar.google.com',
  crm: 'hubspot.com',
  analytics: 'analytics.google.com',
  rss_aggregator: 'feedly.com',
  cms: 'wordpress.com',
  email_provider: 'brevo.com',
};

export function connectorDomain(id: string, domain?: string): string {
  return domain || CONNECTOR_DOMAINS[id] || '';
}

export function connectorFaviconUrl(domain: string, size = 64): string {
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function connectorLogoUrl(id: string, logoUrl?: string, domain?: string): string {
  if (logoUrl) return logoUrl;
  const resolved = connectorDomain(id, domain);
  return connectorFaviconUrl(resolved);
}

type ConnectorLogoProps = {
  id: string;
  name: string;
  domain?: string;
  logoUrl?: string;
  className?: string;
};

export function ConnectorLogo({ id, name, domain, logoUrl, className = 'h-10 w-10' }: ConnectorLogoProps) {
  const resolvedDomain = connectorDomain(id, domain);
  const primarySrc = connectorLogoUrl(id, logoUrl, domain);
  const [src, setSrc] = useState(primarySrc);
  const [failed, setFailed] = useState(!primarySrc);

  if (failed) {
    return (
      <div
        className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-stone-100 text-sm font-semibold text-stone-600`}
        aria-hidden
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${name} logo`}
      className={`${className} shrink-0 rounded-xl border border-[#e7e0d6] bg-white object-contain p-1`}
      onError={() => {
        if (resolvedDomain && src.includes('google.com/s2/favicons')) {
          setSrc(`https://${resolvedDomain}/favicon.ico`);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
