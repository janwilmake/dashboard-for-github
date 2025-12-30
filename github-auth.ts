/// <reference types="@cloudflare/workers-types" />

export interface GitHubAuthConfig {
  clientId: string;
  clientSecret: string;
  scope: string;
  onSessionCreated?: (user: GitHubUser, accessToken: string) => Promise<void>;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  email?: string;
}

export interface SessionData {
  user: GitHubUser;
  accessToken: string;
  exp: number;
}

interface OAuthState {
  redirectTo?: string;
  codeVerifier: string;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  return cookies;
}

export function getCurrentUser(request: Request): GitHubUser | null {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const sessionToken = cookies.session;
  if (!sessionToken) return null;

  try {
    const sessionData: SessionData = JSON.parse(atob(sessionToken));
    if (Date.now() > sessionData.exp) return null;
    return sessionData.user;
  } catch {
    return null;
  }
}

export function getAccessToken(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const sessionToken = cookies.session;
  if (!sessionToken) return null;

  try {
    const sessionData: SessionData = JSON.parse(atob(sessionToken));
    if (Date.now() > sessionData.exp) return null;
    return sessionData.accessToken;
  } catch {
    return null;
  }
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...Array.from(array)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(digest))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function handleLogin(
  request: Request,
  config: GitHubAuthConfig,
): Promise<Response> {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect_to") || "/";

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const state: OAuthState = { redirectTo, codeVerifier };
  const stateString = btoa(JSON.stringify(state));

  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", config.clientId);
  githubUrl.searchParams.set("redirect_uri", `${url.origin}/callback`);
  githubUrl.searchParams.set("scope", config.scope);
  githubUrl.searchParams.set("state", stateString);
  githubUrl.searchParams.set("code_challenge", codeChallenge);
  githubUrl.searchParams.set("code_challenge_method", "S256");

  return new Response(null, {
    status: 302,
    headers: {
      Location: githubUrl.toString(),
      "Set-Cookie": `oauth_state=${encodeURIComponent(
        stateString,
      )}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
    },
  });
}

async function handleCallback(
  request: Request,
  config: GitHubAuthConfig,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  if (!code || !stateParam) {
    return new Response("Missing code or state parameter", { status: 400 });
  }

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const stateCookie = cookies.oauth_state;

  if (!stateCookie || stateCookie !== stateParam) {
    return new Response("Invalid state parameter", { status: 400 });
  }

  let state: OAuthState;
  try {
    state = JSON.parse(atob(stateParam));
  } catch {
    return new Response("Invalid state format", { status: 400 });
  }

  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: `${url.origin}/callback`,
        code_verifier: state.codeVerifier,
      }),
    },
  );

  const tokenData: any = await tokenResponse.json();
  if (!tokenData.access_token) {
    return new Response("Failed to get access token", { status: 400 });
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Dashboard-for-GitHub",
    },
  });

  if (!userResponse.ok) {
    return new Response("Failed to get user info", { status: 400 });
  }

  const userData: any = await userResponse.json();

  const user: GitHubUser = {
    login: userData.login,
    id: userData.id,
    avatar_url: userData.avatar_url,
    email: userData.email,
  };

  // Call the onSessionCreated callback if provided
  if (config.onSessionCreated) {
    await config.onSessionCreated(user, tokenData.access_token);
  }

  const sessionData: SessionData = {
    user,
    accessToken: tokenData.access_token,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  const sessionToken = btoa(JSON.stringify(sessionData));
  const headers = new Headers({ Location: state.redirectTo || "/" });
  headers.append(
    "Set-Cookie",
    "oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/",
  );
  headers.append(
    "Set-Cookie",
    `session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=${
      7 * 24 * 60 * 60
    }; Path=/`,
  );

  return new Response(null, { status: 302, headers });
}

async function handleLogout(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect_to") || "/";
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectTo,
      "Set-Cookie":
        "session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/",
    },
  });
}

export function createGitHubAuthMiddleware(config: GitHubAuthConfig) {
  return {
    handleLogin: (request: Request) => handleLogin(request, config),
    handleCallback: (request: Request) => handleCallback(request, config),
    handleLogout,
    getCurrentUser,
    getAccessToken,
  };
}
