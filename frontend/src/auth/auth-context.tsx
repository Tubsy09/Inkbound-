import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, setAuthToken } from "@/src/api/client";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "inkbound_auth_token";
const AUTH_URL = "https://auth.emergentagent.com/";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role: "customer" | "artist";
  artist_id?: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string, role: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const processed = useRef<Set<string>>(new Set());

  const applyAuth = useCallback(async (token: string, u: User) => {
    setAuthToken(token);
    await storage.secureSet(TOKEN_KEY, token);
    queryClient.clear();
    setUser(u);
  }, []);

  const processSessionId = useCallback(
    async (sessionId: string) => {
      if (processed.current.has(sessionId)) return;
      processed.current.add(sessionId);
      const data = await api<{ session_token: string; user: User }>("/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      await applyAuth(data.session_token, data.user);
    },
    [applyAuth],
  );

  // Bootstrap: process any inbound session_id first, else restore stored token.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        if (Platform.OS === "web") {
          const sid = extractSessionId(
            (typeof window !== "undefined" &&
              (window.location.hash || window.location.search)) || null,
          );
          if (sid) {
            await processSessionId(sid);
            if (typeof window !== "undefined") {
              window.history.replaceState(
                window.history.state,
                "",
                window.location.pathname,
              );
            }
            return;
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            await processSessionId(sid);
            return;
          }
        }

        const stored = await storage.secureGet<string>(TOKEN_KEY, "");
        if (stored) {
          setAuthToken(stored);
          try {
            const data = await api<{ user: User }>("/api/auth/me");
            setUser(data.user);
          } catch {
            setAuthToken(null);
            await storage.secureRemove(TOKEN_KEY);
            setUser(null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();

    if (Platform.OS !== "web") {
      sub = Linking.addEventListener("url", ({ url }) => {
        const sid = extractSessionId(url);
        if (sid) processSessionId(sid).catch(() => {});
      });
    }
    return () => sub?.remove();
  }, [processSessionId]);

  const signInEmail = useCallback(
    async (email: string, password: string) => {
      const data = await api<{ session_token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await applyAuth(data.session_token, data.user);
    },
    [applyAuth],
  );

  const signUpEmail = useCallback(
    async (name: string, email: string, password: string, role: string) => {
      const data = await api<{ session_token: string; user: User }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      await applyAuth(data.session_token, data.user);
    },
    [applyAuth],
  );

  const signInGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? window.location.origin + "/"
        : Linking.createURL("");
    const authUrl = `${AUTH_URL}?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }

    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (!captured) captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let sid: string | null = null;
      if (result.type === "success" && "url" in result) {
        sid = extractSessionId(result.url);
      }
      if (!sid) sid = extractSessionId(captured);
      if (!sid) sid = extractSessionId(await Linking.getInitialURL());
      if (sid) await processSessionId(sid);
    } finally {
      sub.remove();
    }
  }, [processSessionId]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors on logout
    }
    setAuthToken(null);
    await storage.secureRemove(TOKEN_KEY);
    queryClient.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signInEmail, signUpEmail, signInGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
