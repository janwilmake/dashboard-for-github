/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import {
  createGitHubAuthMiddleware,
  getCurrentUser,
  getAccessToken,
  type GitHubUser,
} from "./github-auth";
import { createStripeMiddleware } from "./stripe-middleware";

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  STRIPE_PAYMENT_LINK: string;
  STRIPE_PAYMENT_LINK_ID: string;
  STRIPE_SECRET: string;
  STRIPE_WEBHOOK_SIGNING_SECRET: string;
  DashboardDO: DurableObjectNamespace<DashboardDO>;
  DASHBOARD_KV: KVNamespace;
}

const DO_NAME = "global1";

// ============================================================================
// HTML Templates
// ============================================================================
function getLandingPageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard for GitHub</title>
  <style>
    :root {
      --color-bg: #ffffff;
      --color-bg-secondary: #f6f8fa;
      --color-border: #d0d7de;
      --color-text: #1f2328;
      --color-text-secondary: #656d76;
      --color-accent: #0969da;
      --color-accent-emphasis: #0550ae;
      --color-success: #1a7f37;
      --color-btn-primary-bg: #1f883d;
      --color-btn-primary-hover: #1a7f37;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #0d1117;
        --color-bg-secondary: #161b22;
        --color-border: #30363d;
        --color-text: #e6edf3;
        --color-text-secondary: #8b949e;
        --color-accent: #58a6ff;
        --color-accent-emphasis: #79c0ff;
        --color-success: #3fb950;
        --color-btn-primary-bg: #238636;
        --color-btn-primary-hover: #2ea043;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.5;
    }
    .header {
      background: var(--color-bg-secondary);
      border-bottom: 1px solid var(--color-border);
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      font-weight: 600;
      text-decoration: none;
      color: var(--color-text);
    }
    .logo svg { fill: var(--color-text); }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid var(--color-border);
      background: var(--color-bg);
      color: var(--color-text);
      transition: all 0.2s;
    }
    .btn:hover {
      background: var(--color-bg-secondary);
      border-color: var(--color-text-secondary);
    }
    .btn-primary {
      background: var(--color-btn-primary-bg);
      border-color: var(--color-btn-primary-bg);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--color-btn-primary-hover);
      border-color: var(--color-btn-primary-hover);
    }
    .hero {
      text-align: center;
      padding: 80px 32px 40px;
      max-width: 900px;
      margin: 0 auto;
    }
    .hero h1 {
      font-size: 48px;
      font-weight: 700;
      margin-bottom: 24px;
      line-height: 1.2;
    }
    .hero p {
      font-size: 20px;
      color: var(--color-text-secondary);
      margin-bottom: 32px;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }
    .twitter-widget {
      max-width: 550px;
      margin: 48px auto;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
      padding: 48px 32px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .feature {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      padding: 24px;
    }
    .feature h3 {
      font-size: 18px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .feature p {
      color: var(--color-text-secondary);
      font-size: 14px;
    }
    .pricing {
      text-align: center;
      padding: 64px 32px;
      background: var(--color-bg-secondary);
      border-top: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
    }
    .pricing h2 {
      font-size: 32px;
      margin-bottom: 16px;
    }
    .price {
      font-size: 48px;
      font-weight: 700;
      color: var(--color-success);
    }
    .price span {
      font-size: 18px;
      color: var(--color-text-secondary);
      font-weight: 400;
    }
    .footer {
      text-align: center;
      padding: 32px;
      color: var(--color-text-secondary);
      font-size: 12px;
    }
    .footer a {
      color: var(--color-accent);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="logo">
      <svg height="32" viewBox="0 0 16 16" width="32">
        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
      </svg>
      Dashboard for GitHub
    </a>
    <a href="/login" class="btn">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
      </svg>
      Sign in with GitHub
    </a>
  </header>

  <main>
    <section class="hero">
      <h1>A better GitHub homepage</h1>
      <a href="/login" class="btn btn-primary" style="font-size: 16px; padding: 14px 28px;">
        Get Started
      </a>
    </section>

    <section class="features">
      <div class="feature">
        <h3>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="var(--color-success)">
            <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path>
          </svg>
          Your Pull Requests
        </h3>
        <p>All your open PRs across all repositories, organized and easy to access.</p>
      </div>
      <div class="feature">
        <h3>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="var(--color-accent)">
            <path d="M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"></path>
          </svg>
          Review Requests
        </h3>
        <p>Never miss a review request. See all PRs waiting for your review in one place.</p>
      </div>
      <div class="feature">
        <h3>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="var(--color-text-secondary)">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"></path>
          </svg>
          All Your Repos
        </h3>
        <p>Quick access to all your repositories.</p>
      </div>
    </section>

    <div class="twitter-widget">
      <blockquote class="twitter-tweet" data-theme="dark"><p lang="en" dir="ltr">I made a better GitHub homepage<br><br>It shows you all your open PRs and PRs that need your review in a single place<br><br>Check it out at <a href="https://t.co/9QqYxKZE8Y">https://t.co/9QqYxKZE8Y</a> <a href="https://t.co/AbQJ0fEZpX">pic.twitter.com/AbQJ0fEZpX</a></p>&mdash; Rhys (@RhysSullivan) <a href="https://twitter.com/RhysSullivan/status/1918486708565492170?ref_src=twsrc%5Etfw">January 30, 2025</a></blockquote>
      <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
    </div>

    <section class="pricing">
      <h2>Simple Pricing</h2>
      <div class="price">$10<span>/month</span></div>
      <p style="color: var(--color-text-secondary); margin: 16px 0 32px;">Unlimited repos • Daily updates • Cancel anytime</p>
      <a href="/login" class="btn btn-primary" style="font-size: 16px; padding: 14px 28px;">
        Start Now
      </a>
    </section>
  </main>

  <footer class="footer">
    <p>Dashboard for GitHub is not affiliated with GitHub, Inc.</p>
    <p style="margin-top: 8px;">
      <a href="https://context.forgithub.com">Context for GitHub</a>
    </p>
  </footer>
</body>
</html>`;
}

function getPricingPageHTML(user: GitHubUser, paymentLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscribe - Dashboard for GitHub</title>
  <style>
    :root {
      --color-bg: #ffffff;
      --color-bg-secondary: #f6f8fa;
      --color-border: #d0d7de;
      --color-text: #1f2328;
      --color-text-secondary: #656d76;
      --color-accent: #0969da;
      --color-success: #1a7f37;
      --color-btn-primary-bg: #1f883d;
      --color-btn-primary-hover: #1a7f37;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #0d1117;
        --color-bg-secondary: #161b22;
        --color-border: #30363d;
        --color-text: #e6edf3;
        --color-text-secondary: #8b949e;
        --color-accent: #58a6ff;
        --color-success: #3fb950;
        --color-btn-primary-bg: #238636;
        --color-btn-primary-hover: #2ea043;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: var(--color-bg-secondary);
      border-bottom: 1px solid var(--color-border);
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      font-weight: 600;
      text-decoration: none;
      color: var(--color-text);
    }
    .logo svg { fill: var(--color-text); }
    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .user-info img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid var(--color-border);
      background: var(--color-bg);
      color: var(--color-text);
      transition: all 0.2s;
    }
    .btn:hover {
      background: var(--color-bg-secondary);
    }
    .btn-primary {
      background: var(--color-btn-primary-bg);
      border-color: var(--color-btn-primary-bg);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--color-btn-primary-hover);
    }
    .main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
    }
    .pricing-card {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      padding: 48px;
      max-width: 400px;
      text-align: center;
    }
    .pricing-card h1 {
      font-size: 28px;
      margin-bottom: 8px;
    }
    .pricing-card .subtitle {
      color: var(--color-text-secondary);
      margin-bottom: 32px;
    }
    .price {
      font-size: 56px;
      font-weight: 700;
      color: var(--color-success);
      margin-bottom: 8px;
    }
    .price span {
      font-size: 20px;
      color: var(--color-text-secondary);
      font-weight: 400;
    }
    .features-list {
      text-align: left;
      margin: 32px 0;
      list-style: none;
    }
    .features-list li {
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .features-list svg {
      fill: var(--color-success);
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="logo">
      <svg height="32" viewBox="0 0 16 16" width="32">
        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
      </svg>
      Dashboard for GitHub
    </a>
    <div class="user-info">
      <img src="${user.avatar_url}" alt="${user.login}">
      <span>${user.login}</span>
      <a href="/logout" class="btn">Sign out</a>
    </div>
  </header>

  <main class="main">
    <div class="pricing-card">
      <h1>Subscribe to Dashboard</h1>
      <p class="subtitle">Get instant access to your PR dashboard</p>
      <div class="price">$10<span>/month</span></div>
      <ul class="features-list">
        <li>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>
          All your open pull requests
        </li>
        <li>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>
          PRs awaiting your review
        </li>
        <li>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>
          All your repositories
        </li>
        <li>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>
          Daily updates at 2 AM UTC
        </li>
        <li>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>
          Cancel anytime
        </li>
      </ul>
      <a href="${paymentLink}" class="btn btn-primary" style="width: 100%; justify-content: center; font-size: 16px; padding: 14px;">
        Subscribe Now
      </a>
    </div>
  </main>
</body>
</html>`;
}

function getDashboardHTML(
  user: GitHubUser,
  repos: any[],
  starredRepos: any[],
  myPRs: any[],
  reviewRequests: any[],
  lastUpdated: string,
): string {
  const reposJson = JSON.stringify(repos);
  const starredReposJson = JSON.stringify(starredRepos);
  const myPRsJson = JSON.stringify(myPRs);
  const reviewRequestsJson = JSON.stringify(reviewRequests);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - ${user.login}</title>
  <style>
    :root {
      --color-bg: #ffffff;
      --color-bg-secondary: #f6f8fa;
      --color-border: #d0d7de;
      --color-text: #1f2328;
      --color-text-secondary: #656d76;
      --color-accent: #0969da;
      --color-success: #1a7f37;
      --color-btn-primary-bg: #1f883d;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #0d1117;
        --color-bg-secondary: #161b22;
        --color-border: #30363d;
        --color-text: #e6edf3;
        --color-text-secondary: #8b949e;
        --color-accent: #58a6ff;
        --color-success: #3fb950;
        --color-btn-primary-bg: #238636;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.5;
    }
    .header {
      background: var(--color-bg-secondary);
      border-bottom: 1px solid var(--color-border);
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      font-weight: 600;
      text-decoration: none;
      color: var(--color-text);
    }
    .logo svg { fill: var(--color-text); }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .user-info img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      border: 1px solid var(--color-border);
      background: var(--color-bg);
      color: var(--color-text);
      cursor: pointer;
    }
    .btn:hover {
      background: var(--color-bg-secondary);
    }
    .btn.active {
      background: var(--color-accent);
      color: white;
      border-color: var(--color-accent);
    }
    .main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px;
    }
    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .search-box {
      position: relative;
      flex: 1;
      min-width: 300px;
    }
    .search-box input {
      width: 100%;
      padding: 10px 14px 10px 38px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-bg-secondary);
      color: var(--color-text);
      font-size: 14px;
    }
    .search-box svg {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      fill: var(--color-text-secondary);
    }
    .sort-buttons {
      display: flex;
      gap: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
    }
    @media (max-width: 1200px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
    .section {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .section-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--color-border);
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .section-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-content {
      flex: 1;
      overflow-y: auto;
      max-height: 600px;
    }
    .repo-item, .pr-item {
      display: block;
      padding: 12px 20px;
      border-bottom: 1px solid var(--color-border);
      text-decoration: none;
      color: var(--color-text);
      transition: background 0.15s;
    }
    .repo-item:hover, .pr-item:hover {
      background: var(--color-bg);
    }
    .repo-item:last-child, .pr-item:last-child {
      border-bottom: none;
    }
    .repo-name, .pr-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .repo-desc {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin: 4px 0;
      margin-left: 24px;
    }
    .repo-meta, .pr-meta {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-top: 4px;
      margin-left: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .repo-topics {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
      margin-left: 24px;
    }
    .topic-tag {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--color-accent);
      color: white;
      border-radius: 12px;
    }
    .lang {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .lang::before {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--color-accent);
    }
    .empty-state {
      padding: 32px 20px;
      text-align: center;
      color: var(--color-text-secondary);
    }
    .meta-bar {
      color: var(--color-text-secondary);
      font-size: 14px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="logo">
      <svg height="32" viewBox="0 0 16 16" width="32">
        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
      </svg>
      Dashboard for GitHub
    </a>
    <div class="header-actions">
      <a href="https://context.forgithub.com" class="btn" target="_blank">Context for GitHub</a>
      <button onclick="manageSubscription()" class="btn">Manage Subscription</button>
      <div class="user-info">
        <img src="${user.avatar_url}" alt="${user.login}">
        <span>${user.login}</span>
      </div>
      <a href="/logout" class="btn">Sign out</a>
    </div>
  </header>

  <main class="main">
    <div class="meta-bar">
      Last updated: ${lastUpdated}
    </div>

    <div class="controls">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.5 4.5 0 1 0-8.999 0A4.5 4.5 0 0 0 11.5 7Z"></path>
        </svg>
        <input 
          type="text" 
          id="search" 
          placeholder="Search repos and PRs by name, description, or tags..."
          oninput="handleSearch()"
        >
      </div>
      <div class="sort-buttons">
        <button class="btn active" data-sort="recency" onclick="changeSort('recency')">Recent</button>
        <button class="btn" data-sort="stars" onclick="changeSort('stars')">Stars</button>
      </div>
    </div>
    
    <div class="grid">
      <div class="section">
        <div class="section-header">
          <div class="section-header-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-text-secondary)">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"></path>
            </svg>
            Repositories
          </div>
          <span id="repos-count">${repos.length}</span>
        </div>
        <div class="section-content" id="repos-list"></div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-header-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-success)">
              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path>
            </svg>
            My Pull Requests
          </div>
          <span id="my-prs-count">${myPRs.length}</span>
        </div>
        <div class="section-content" id="my-prs-list"></div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-header-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-accent)">
              <path d="M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"></path>
            </svg>
            Review Requests
          </div>
          <span id="review-requests-count">${reviewRequests.length}</span>
        </div>
        <div class="section-content" id="review-requests-list"></div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-header-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-accent)">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"></path>
            </svg>
            Starred Repos
          </div>
          <span id="starred-count">${starredRepos.length}</span>
        </div>
        <div class="section-content" id="starred-list"></div>
      </div>
    </div>
  </main>

  <script>
    const allRepos = ${reposJson};
    const allStarred = ${starredReposJson};
    const allMyPRs = ${myPRsJson};
    const allReviewRequests = ${reviewRequestsJson};
    
    let currentSort = 'recency';
    let searchQuery = '';

    function formatDate(dateString) {
      const date = new Date(dateString);
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      
      if (days === 0) return 'today';
      if (days === 1) return 'yesterday';
      if (days < 7) return days + ' days ago';
      if (days < 30) return Math.floor(days / 7) + ' weeks ago';
      if (days < 365) return Math.floor(days / 30) + ' months ago';
      return Math.floor(days / 365) + ' years ago';
    }

    function matchesSearch(text, topics = []) {
      const query = searchQuery.toLowerCase();
      if (!query) return true;
      
      const textMatch = text.toLowerCase().includes(query);
      const topicMatch = topics.some(t => t.toLowerCase().includes(query));
      
      return textMatch || topicMatch;
    }

    function renderRepo(repo) {
      const searchableText = repo.full_name + ' ' + (repo.description || '');
      const topics = repo.topics || [];
      
      if (!matchesSearch(searchableText, topics)) return '';

      const topicsHtml = topics.length > 0 
        ? '<div class="repo-topics">' + topics.map(t => 
            '<span class="topic-tag">' + t + '</span>'
          ).join('') + '</div>'
        : '';

      return '<a href="' + repo.html_url + '" class="repo-item" target="_blank">' +
        '<div class="repo-name">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-text-secondary)">' +
            '<path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"></path>' +
          '</svg>' +
          repo.full_name +
        '</div>' +
        (repo.description ? '<div class="repo-desc">' + repo.description + '</div>' : '') +
        '<div class="repo-meta">' +
          (repo.language ? '<span class="lang">' + repo.language + '</span>' : '') +
          (repo.stargazers_count > 0 ? '<span>⭐ ' + repo.stargazers_count + '</span>' : '') +
          '<span>Updated ' + formatDate(repo.pushed_at) + '</span>' +
        '</div>' +
        topicsHtml +
      '</a>';
    }

    function renderPR(pr) {
      const repoName = pr.repository_url.split('/').slice(-2).join('/');
      const searchableText = pr.title + ' ' + repoName;
      
      if (!matchesSearch(searchableText)) return '';

      return '<a href="' + pr.html_url + '" class="pr-item" target="_blank">' +
        '<div class="pr-title">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-success)">' +
            '<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path>' +
          '</svg>' +
          pr.title +
        '</div>' +
        '<div class="pr-meta">' + repoName + ' #' + pr.number + '</div>' +
      '</a>';
    }

    function sortRepos(repos) {
      const sorted = [...repos];
      if (currentSort === 'stars') {
        sorted.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
      } else {
        sorted.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
      }
      return sorted;
    }

    function render() {
      const sortedRepos = sortRepos(allRepos);
      const sortedStarred = sortRepos(allStarred);

      const reposHtml = sortedRepos.map(renderRepo).filter(Boolean);
      const starredHtml = sortedStarred.map(renderRepo).filter(Boolean);
      const myPRsHtml = allMyPRs.map(pr => renderPR(pr)).filter(Boolean);
      const reviewRequestsHtml = allReviewRequests.map(pr => renderPR(pr)).filter(Boolean);

      document.getElementById('repos-list').innerHTML = 
        reposHtml.length > 0 ? reposHtml.join('') : '<div class="empty-state">No repositories found</div>';
      
      document.getElementById('starred-list').innerHTML = 
        starredHtml.length > 0 ? starredHtml.join('') : '<div class="empty-state">No starred repositories</div>';
      
      document.getElementById('my-prs-list').innerHTML = 
        myPRsHtml.length > 0 ? myPRsHtml.join('') : '<div class="empty-state">No open pull requests</div>';
      
      document.getElementById('review-requests-list').innerHTML = 
        reviewRequestsHtml.length > 0 ? reviewRequestsHtml.join('') : '<div class="empty-state">No review requests</div>';

      document.getElementById('repos-count').textContent = reposHtml.length;
      document.getElementById('starred-count').textContent = starredHtml.length;
      document.getElementById('my-prs-count').textContent = myPRsHtml.length;
      document.getElementById('review-requests-count').textContent = reviewRequestsHtml.length;
    }

    function changeSort(sort) {
      currentSort = sort;
      document.querySelectorAll('[data-sort]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === sort);
      });
      render();
    }

    function handleSearch() {
      searchQuery = document.getElementById('search').value;
      render();
    }

    async function manageSubscription() {
      try {
        const response = await fetch('/api/create-portal-session');
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          alert('Failed to create portal session');
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    render();
  </script>
</body>
</html>`;
}

// ============================================================================
// Durable Object Functions
// ============================================================================

interface UserMetadata {
  username: string;
  email: string;
  subscribed_at: number;
  access_token: string;
  stripe_customer_id: string | null;
  last_updated: string | null;
}

function initDatabase(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      username TEXT PRIMARY KEY,
      email TEXT,
      subscribed_at INTEGER,
      access_token TEXT,
      stripe_customer_id TEXT,
      last_updated TEXT
    )
  `);
}

async function addSubscription(
  sql: SqlStorage,
  env: Env,
  username: string,
  email: string,
  stripeCustomerId?: string,
): Promise<void> {
  const now = Date.now();

  sql.exec(
    `INSERT INTO subscriptions (username, email, subscribed_at, stripe_customer_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET 
       email = excluded.email,
       subscribed_at = excluded.subscribed_at,
       stripe_customer_id = excluded.stripe_customer_id`,
    username,
    email,
    now,
    stripeCustomerId || null,
  );

  const user = sql
    .exec<{ access_token: string }>(
      `SELECT access_token FROM subscriptions WHERE username=?`,
      username,
    )
    .one();

  await updateUserDashboard(sql, env, username, user.access_token);
}

function removeSubscriptionByEmail(sql: SqlStorage, email: string): void {
  sql.exec(
    "UPDATE subscriptions SET subscribed_at = NULL WHERE email = ?",
    email,
  );
}

function isSubscribed(sql: SqlStorage, username: string): boolean {
  const result = sql.exec(
    "SELECT username FROM subscriptions WHERE username = ? AND subscribed_at IS NOT NULL AND subscribed_at > 0",
    username,
  );
  return result.toArray().length > 0;
}

function getStripeCustomerId(sql: SqlStorage, username: string): string | null {
  const result = sql.exec(
    "SELECT stripe_customer_id FROM subscriptions WHERE username = ?",
    username,
  );
  const rows = result.toArray();
  return rows.length > 0 ? (rows[0] as any).stripe_customer_id : null;
}

function upsertUser(
  sql: SqlStorage,
  username: string,
  accessToken: string,
): void {
  sql.exec(
    `INSERT INTO subscriptions (username, access_token)
     VALUES (?, ?)
     ON CONFLICT(username) DO UPDATE SET access_token = excluded.access_token`,
    username,
    accessToken,
  );
}

async function getDashboardData(
  sql: SqlStorage,
  kv: KVNamespace,
  username: string,
): Promise<{
  repos: any[];
  starredRepos: any[];
  myPRs: any[];
  reviewRequests: any[];
  lastUpdated: string;
}> {
  const result = sql.exec(
    "SELECT last_updated FROM subscriptions WHERE username = ?",
    username,
  );
  const rows = result.toArray();

  if (rows.length === 0) {
    return {
      repos: [],
      starredRepos: [],
      myPRs: [],
      reviewRequests: [],
      lastUpdated: "",
    };
  }

  const row = rows[0] as any;

  const [reposData, starredReposData, myPRsData, reviewRequestsData] =
    await Promise.all([
      kv.get(`repos:${username}`, "json"),
      kv.get(`starred:${username}`, "json"),
      kv.get(`prs:${username}`, "json"),
      kv.get(`reviews:${username}`, "json"),
    ]);

  return {
    repos: (reposData as any[]) || [],
    starredRepos: (starredReposData as any[]) || [],
    myPRs: (myPRsData as any[]) || [],
    reviewRequests: (reviewRequestsData as any[]) || [],
    lastUpdated: row.last_updated || "",
  };
}

async function updateAllDashboards(sql: SqlStorage, env: Env): Promise<void> {
  const result = sql.exec(
    "SELECT username, access_token FROM subscriptions WHERE subscribed_at IS NOT NULL AND subscribed_at > 0 AND access_token IS NOT NULL",
  );
  const users = result.toArray() as Array<{
    username: string;
    access_token: string;
  }>;

  for (const user of users) {
    try {
      await updateUserDashboard(sql, env, user.username, user.access_token);
    } catch (error) {
      console.error(`Error updating dashboard for ${user.username}:`, error);
    }
  }
}

async function updateUserDashboard(
  sql: SqlStorage,
  env: Env,
  username: string,
  accessToken: string,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Dashboard-for-GitHub",
  };

  // Fetch repos
  const repos: any[] = [];
  let page = 1;
  while (true) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed`,
      { headers },
    );
    if (!response.ok) break;
    const pageRepos = await response.json();
    if (!Array.isArray(pageRepos) || pageRepos.length === 0) break;
    repos.push(...pageRepos);
    if (pageRepos.length < 100) break;
    page++;
  }

  // Fetch starred repos
  const starredRepos: any[] = [];
  page = 1;
  while (true) {
    const response = await fetch(
      `https://api.github.com/user/starred?per_page=100&page=${page}`,
      { headers },
    );
    if (!response.ok) break;
    const pageStarred = await response.json();
    if (!Array.isArray(pageStarred) || pageStarred.length === 0) break;
    starredRepos.push(...pageStarred);
    if (pageStarred.length < 100) break;
    page++;
  }

  // Fetch my open PRs
  const myPRsResponse = await fetch(
    `https://api.github.com/search/issues?q=${encodeURIComponent(
      `is:pr is:open author:${username}`,
    )}&per_page=100`,
    { headers },
  );
  const myPRsData = myPRsResponse.ok
    ? await myPRsResponse.json()
    : { items: [] };
  const myPRs = (myPRsData as any).items || [];

  // Fetch review requests
  const reviewResponse = await fetch(
    `https://api.github.com/search/issues?q=${encodeURIComponent(
      `is:pr is:open review-requested:${username}`,
    )}&per_page=100`,
    { headers },
  );
  const reviewData = reviewResponse.ok
    ? await reviewResponse.json()
    : { items: [] };
  const reviewRequests = (reviewData as any).items || [];

  const lastUpdated = new Date().toISOString();

  // Store large data in KV
  await Promise.all([
    env.DASHBOARD_KV.put(`repos:${username}`, JSON.stringify(repos)),
    env.DASHBOARD_KV.put(`starred:${username}`, JSON.stringify(starredRepos)),
    env.DASHBOARD_KV.put(`prs:${username}`, JSON.stringify(myPRs)),
    env.DASHBOARD_KV.put(`reviews:${username}`, JSON.stringify(reviewRequests)),
  ]);

  // Only store metadata in SQLite
  sql.exec(
    `UPDATE subscriptions 
     SET last_updated = ?
     WHERE username = ?`,
    lastUpdated,
    username,
  );

  // Get user info for the dashboard
  const userResponse = await fetch("https://api.github.com/user", {
    headers,
  });
  if (!userResponse.ok) return;
  const userData = (await userResponse.json()) as any;

  const user = {
    login: userData.login,
    id: userData.id,
    avatar_url: userData.avatar_url,
  };

  // Generate and store HTML in KV
  const html = getDashboardHTML(
    user,
    repos,
    starredRepos,
    myPRs,
    reviewRequests,
    new Date(lastUpdated).toLocaleString(),
  );
  await env.DASHBOARD_KV.put(`dashboard:${username}`, html);
}

// ============================================================================
// Durable Object
// ============================================================================

export class DashboardDO extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    initDatabase(this.sql);
  }

  async addSubscription(
    username: string,
    email: string,
    stripeCustomerId?: string,
  ): Promise<void> {
    return addSubscription(
      this.sql,
      this.env,
      username,
      email,
      stripeCustomerId,
    );
  }

  async removeSubscriptionByEmail(email: string): Promise<void> {
    return removeSubscriptionByEmail(this.sql, email);
  }

  async isSubscribed(username: string): Promise<boolean> {
    return isSubscribed(this.sql, username);
  }

  async getStripeCustomerId(username: string): Promise<string | null> {
    return getStripeCustomerId(this.sql, username);
  }

  async upsertUser(username: string, accessToken: string): Promise<void> {
    return upsertUser(this.sql, username, accessToken);
  }

  async getDashboardData(username: string): Promise<{
    repos: any[];
    starredRepos: any[];
    myPRs: any[];
    reviewRequests: any[];
    lastUpdated: string;
  }> {
    return getDashboardData(this.sql, this.env.DASHBOARD_KV, username);
  }

  async updateAllDashboards(kv: KVNamespace): Promise<void> {
    return updateAllDashboards(this.sql, this.env);
  }
}

// ============================================================================
// Main Worker
// ============================================================================

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const stub = env.DashboardDO.get(env.DashboardDO.idFromName(DO_NAME));

    // GitHub Auth
    const githubAuth = createGitHubAuthMiddleware({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      scope: "user:email repo read:org",
      onSessionCreated: async (user, accessToken) => {
        await stub.upsertUser(user.login, accessToken);
      },
    });

    // Stripe
    const stripe = createStripeMiddleware({
      secretKey: env.STRIPE_SECRET,
      webhookSigningSecret: env.STRIPE_WEBHOOK_SIGNING_SECRET,
      paymentLinkId: env.STRIPE_PAYMENT_LINK_ID,
      paymentLinkUrl: env.STRIPE_PAYMENT_LINK,
      onSubscribe: async (username, email, customerId) => {
        await stub.addSubscription(username, email, customerId);
      },
      onCancel: async (email) => {
        await stub.removeSubscriptionByEmail(email);
      },
      getCustomerId: async (request) => {
        const user = getCurrentUser(request);
        if (!user) return null;
        return await stub.getStripeCustomerId(user.login);
      },
    });

    // OAuth routes
    if (path === "/login") return githubAuth.handleLogin(request);
    if (path === "/callback") return githubAuth.handleCallback(request);
    if (path === "/logout") return githubAuth.handleLogout(request);

    // Stripe webhook
    if (path === "/webhook/stripe") {
      return stripe.handleWebhook(request);
    }

    // API: Get logged in user info
    if (path === "/api/user") {
      const user = getCurrentUser(request);
      if (!user) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(user), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // API: Create Stripe customer portal session
    if (path === "/api/create-portal-session") {
      const user = getCurrentUser(request);
      if (!user) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return stripe.createPortalSession(request);
    }

    // Homepage - main dashboard route
    if (path === "/") {
      const user = getCurrentUser(request);

      // Not logged in - show landing page
      if (!user) {
        return new Response(getLandingPageHTML(), {
          headers: { "Content-Type": "text/html" },
        });
      }

      const accessToken = getAccessToken(request);
      if (!accessToken) {
        return new Response(getLandingPageHTML(), {
          headers: { "Content-Type": "text/html" },
        });
      }

      const isSubscribedStatus = await stub.isSubscribed(user.login);

      // Not subscribed - show pricing page
      if (!isSubscribedStatus) {
        const paymentLink = stripe.getPaymentLink(user.login);
        return new Response(getPricingPageHTML(user, paymentLink), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Subscribed - try to get prerendered dashboard from KV
      const cachedDashboard = await env.DASHBOARD_KV.get(
        `dashboard:${user.login}`,
      );
      if (cachedDashboard) {
        return new Response(cachedDashboard, {
          headers: { "Content-Type": "text/html" },
        });
      }

      // No cached dashboard yet - generate one on the fly
      const dashboardData = await stub.getDashboardData(user.login);
      const html = getDashboardHTML(
        user,
        dashboardData.repos || [],
        dashboardData.starredRepos || [],
        dashboardData.myPRs || [],
        dashboardData.reviewRequests || [],
        dashboardData.lastUpdated || "Generating...",
      );

      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event, env: Env, ctx: ExecutionContext): Promise<void> {
    const stub = env.DashboardDO.get(env.DashboardDO.idFromName(DO_NAME));
    await stub.updateAllDashboards(env.DASHBOARD_KV);
  },
} satisfies ExportedHandler<Env>;
