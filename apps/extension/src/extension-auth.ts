export interface ExtensionCredentials {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export interface BrowserIdentity {
  getRedirectURL(): string;
  launchWebAuthFlow(input: {
    interactive: boolean;
    url: string;
  }): Promise<string | undefined>;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function verifierAndChallenge() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(48));
  const verifier = base64Url(verifierBytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { challenge: base64Url(new Uint8Array(digest)), verifier };
}

function credentialsFrom(payload: unknown): ExtensionCredentials {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("accessToken" in payload) ||
    typeof payload.accessToken !== "string" ||
    !("refreshToken" in payload) ||
    typeof payload.refreshToken !== "string" ||
    !("expiresIn" in payload) ||
    typeof payload.expiresIn !== "number"
  ) {
    throw new Error("The API returned invalid extension credentials.");
  }
  return {
    accessToken: payload.accessToken,
    expiresIn: payload.expiresIn,
    refreshToken: payload.refreshToken,
  };
}

export async function signInWithTwitch({
  apiBaseUrl,
  fetchFromApi = fetch,
  identity,
}: {
  apiBaseUrl: string;
  fetchFromApi?: typeof fetch;
  identity: BrowserIdentity;
}) {
  const { challenge, verifier } = await verifierAndChallenge();
  const redirectUri = identity.getRedirectURL();
  const authorizationUrl = new URL("/auth/extension/twitch", apiBaseUrl);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  const completedUrl = await identity.launchWebAuthFlow({
    interactive: true,
    url: authorizationUrl.toString(),
  });
  const code = completedUrl
    ? new URL(completedUrl).searchParams.get("code")
    : null;
  if (!code) throw new Error("Twitch sign-in did not return an exchange code.");

  const response = await fetchFromApi(
    new URL("/api/extension-auth/exchange", apiBaseUrl).toString(),
    {
      body: JSON.stringify({ code, codeVerifier: verifier }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("The extension code exchange failed.");
  return credentialsFrom(await response.json());
}
