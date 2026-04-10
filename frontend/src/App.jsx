import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

import {
  LanguageChart,
  RadarChartBox,
  ActivityChart
} from "./components/Charts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const calculateScore = (profile, repos) => {
  if (!profile || !repos) return 0;

  const repoCount = repos.length;
  const stars = repos.reduce((a, r) => a + r.stargazers_count, 0);
  const followers = profile.followers || 0;

  const recentRepos = repos.filter((repo) => {
    const diff =
      (Date.now() - new Date(repo.updated_at)) / (1000 * 60 * 60 * 24);
    return diff < 30;
  }).length;

  return Math.round(
    Math.min(repoCount * 1.5, 25) +
    Math.min(stars * 2, 25) +
    Math.min(followers * 3, 15) +
    Math.min(recentRepos * 2, 20)
  );
};

const getLevel = (score) => {
  if (score > 80) return "🚀 Pro Developer";
  if (score > 60) return "🔥 Strong";
  if (score > 40) return "⚡ Intermediate";
  return "🌱 Beginner";
};

const readCookie = (name) => {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  return cookie ? cookie.slice(name.length + 1) : null;
};

const getAuthUser = () => {
  const rawCookie = readCookie("oauth_user");

  if (!rawCookie) return null;

  try {
    return JSON.parse(decodeURIComponent(rawCookie));
  } catch {
    try {
      return JSON.parse(rawCookie);
    } catch {
      return null;
    }
  }
};

const clearCookie = (name) => {
  if (typeof document === "undefined") return;

  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
};

const getLoginNotice = () => {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const success = params.get("login_success");
  const error = params.get("login_error");

  if (success) {
    return {
      type: "success",
      text: `Signed in successfully with ${success}.`,
    };
  }

  if (error) {
    const friendlyErrors = {
      github_config_missing: "GitHub OAuth env missing",
      google_config_missing: "Google OAuth env missing",
      linkedin_config_missing: "LinkedIn OAuth env missing",
      github_state_mismatch: "GitHub login state mismatch",
      google_state_mismatch: "Google login state mismatch",
      linkedin_state_mismatch: "LinkedIn login state mismatch",
      github_callback_failed: "GitHub callback failed",
      google_callback_failed: "Google callback failed",
      linkedin_callback_failed: "LinkedIn callback failed",
    };

    return {
      type: "error",
      text: friendlyErrors[error] || `Login failed: ${error}`,
    };
  }

  return null;
};

export default function App() {
  const [authUser, setAuthUser] = useState(getAuthUser);
  const [loginNotice, setLoginNotice] = useState(getLoginNotice);
  const [oauthConfig, setOauthConfig] = useState({ github: false, google: false, linkedin: false });
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showLoginPage, setShowLoginPage] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showExploreMenu, setShowExploreMenu] = useState(false);
  const [languageData, setLanguageData] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const profileMenuRef = useRef(null);
  const exploreMenuRef = useRef(null);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("history")) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const loadOauthConfig = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/auth/config`);
        setOauthConfig(response.data);
      } catch (error) {
        console.log(error);
      }
    };

    loadOauthConfig();
  }, []);

  useEffect(() => {
    if (!loginNotice) return undefined;

    const timer = window.setTimeout(() => {
      setLoginNotice(null);

      const url = new URL(window.location.href);
      url.searchParams.delete("login_success");
      url.searchParams.delete("login_error");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [loginNotice]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }

      if (exploreMenuRef.current && !exploreMenuRef.current.contains(event.target)) {
        setShowExploreMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const startOAuthLogin = (provider) => {
    if (!oauthConfig[provider]) return;

    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  };

  const handleSignOut = () => {
    clearCookie("oauth_user");
    setAuthUser(null);
    setShowHistory(false);
    setShowProfileMenu(false);
    setShowExploreMenu(false);
    setProfile(null);
    setRepos([]);
    setLanguageData([]);
    setUsername("");
    setSuggestions([]);
    setShowDropdown(false);
    localStorage.removeItem("lastUsername");
    localStorage.removeItem("history");
    setHistory([]);
    setLanguageData([]);
  };

  const fetchSuggestions = async (value) => {
    if (!value) {
      setSuggestions([]);
      return;
    }

    try {
      const res = await axios.get(
        `https://api.github.com/search/users?q=${value}`
      );
      setSuggestions(res.data.items.slice(0, 5));
      setShowDropdown(true);
    } catch (err) {
      console.log(err);
    }
  };

  const collectLanguageData = async (repoList) => {
    const totals = {};

    await Promise.allSettled(
      repoList.map(async (repo) => {
        if (!repo.languages_url) {
          if (repo.language) {
            totals[repo.language] = (totals[repo.language] || 0) + 1;
          }
          return;
        }

        try {
          const response = await axios.get(repo.languages_url);
          const entries = Object.entries(response.data || {});

          if (entries.length === 0 && repo.language) {
            totals[repo.language] = (totals[repo.language] || 0) + 1;
            return;
          }

          entries.forEach(([language, bytes]) => {
            totals[language] = (totals[language] || 0) + bytes;
          });
        } catch {
          if (repo.language) {
            totals[repo.language] = (totals[repo.language] || 0) + 1;
          }
        }
      })
    );

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  };

  const analyzeProfile = async (user = username) => {
    if (!user) return;

    setLoading(true);
    setError("");
    setProfile(null);
    setRepos([]);
    setShowDropdown(false);

    try {
      const [profileRes, repoRes] = await Promise.all([
        axios.get(`https://api.github.com/users/${user}`),
        axios.get(`https://api.github.com/users/${user}/repos?per_page=100`)
      ]);

      setProfile(profileRes.data);
      const repoList = repoRes.data || [];
      setRepos(repoList);
      setLanguageData(await collectLanguageData(repoList));

      setHistory((prevHistory) => {
        const updated = [user, ...prevHistory.filter((item) => item !== user)].slice(0, 5);
        localStorage.setItem("history", JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.log(err);
      setError("User not found or GitHub API limit reached. Please try another username in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const score = calculateScore(profile, repos);
  const level = getLevel(score);
  const isResultView = Boolean(profile);
  const isHomeView = !isResultView && !showLoginPage && !showHistory;
  const isHistoryView = !isResultView && !showLoginPage && authUser && showHistory;
  const hasAnyOauthProvider = oauthConfig.github || oauthConfig.google || oauthConfig.linkedin;
  const authProviderLabel = authUser?.provider
    ? `${authUser.provider.charAt(0).toUpperCase()}${authUser.provider.slice(1)} Profile`
    : "Account";

  const loginProviders = [
    {
      key: "github",
      label: "Continue with GitHub",
      subtitle: "Best for developer-first sign in",
    },
    {
      key: "google",
      label: "Sign in with Google",
      subtitle: "Use your Google account securely",
    },
    {
      key: "linkedin",
      label: "Continue with LinkedIn",
      subtitle: "Use your professional profile",
    },
  ];

  return (
    <div className="app-shell min-h-screen px-4 py-4 text-white md:px-6 md:py-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12">
        <header className="nav-shell relative z-50 flex items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 px-4 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="brand-mark__icon">
                <path
                  fill="currentColor"
                  d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.48 0-.24-.01-.88-.02-1.72-2.78.62-3.37-1.38-3.37-1.38-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.15-4.56-5.12 0-1.13.39-2.06 1.03-2.79-.1-.27-.45-1.34.1-2.78 0 0 .84-.27 2.75 1.06A9.3 9.3 0 0 1 12 6.85c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.06 2.75-1.06.55 1.44.2 2.51.1 2.78.64.73 1.03 1.66 1.03 2.79 0 3.98-2.34 4.86-4.57 5.11.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.48A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-sky-300 md:text-xl">
                GitHub Intelligence
              </div>
              <div className="truncate text-xs text-slate-400 md:text-sm">
                Professional Analytics Platform
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-10 text-sm font-semibold text-slate-400 lg:flex">
            <a href="#">Features</a>
            <a href="#">Pricing</a>
            <a href="#">Documentation</a>
          </nav>

          <div className="hidden items-center lg:block" ref={exploreMenuRef}>
            <button
              type="button"
              onClick={() => setShowExploreMenu((value) => !value)}
              className="explore-pill rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
            >
              Explore
            </button>

            {showExploreMenu && (
              <div className="explore-menu absolute left-1/2 top-full z-50 mt-3 w-88 -translate-x-1/2 overflow-hidden rounded-3xl border border-white/10 bg-[#111827] p-4 shadow-2xl shadow-black/50">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  What this app includes
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-sm font-semibold text-white">Profile Search</div>
                    <div className="mt-1 text-xs text-slate-400">Search any public GitHub username and load profile data instantly.</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-sm font-semibold text-white">Analytics Dashboard</div>
                    <div className="mt-1 text-xs text-slate-400">View score, followers, stars, language breakdown, and activity graphs.</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-sm font-semibold text-white">Login + History</div>
                    <div className="mt-1 text-xs text-slate-400">Sign in to unlock search history and profile menu actions.</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isResultView ? (
              <button
                onClick={() => {
                  setProfile(null);
                  setRepos([]);
                  setLanguageData([]);
                  setError("");
                  setShowHistory(false);
                  setShowProfileMenu(false);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Search another profile
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (authUser) {
                      setShowHistory((value) => !value);
                      return;
                    }
                    setShowLoginPage(true);
                  }}
                  disabled={!authUser && !hasAnyOauthProvider}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    authUser
                      ? "text-slate-200 hover:bg-white/5"
                      : "text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:text-slate-500"
                  }`}
                >
                  <span>↺</span>
                  <span>History</span>
                </button>

                {authUser ? (
                  <div className="relative z-50" ref={profileMenuRef}>
                    <button
                      onClick={() => setShowProfileMenu((value) => !value)}
                      className="profile-pill flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-white/10"
                    >
                      <img
                        src={authUser.avatarUrl}
                        alt={authUser.name || authUser.login}
                        className="h-8 w-8 rounded-full border border-white/10 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm leading-tight text-white">
                          {authUser.name || authUser.login}
                        </div>
                        <div className="truncate text-xs leading-tight text-slate-400">
                          @{authUser.login}
                        </div>
                      </div>
                      <span className="ml-1 text-xs text-slate-400">⌄</span>
                    </button>

                    {showProfileMenu && (
                      <div className="profile-menu absolute right-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#111827] p-2 shadow-2xl shadow-black/50">
                        <div className="px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {authProviderLabel}
                        </div>
                        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
                          <img
                            src={authUser.avatarUrl}
                            alt={authUser.name || authUser.login}
                            className="h-10 w-10 rounded-full border border-white/10 object-cover"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {authUser.name || authUser.login}
                            </div>
                            <div className="truncate text-xs text-slate-400">
                              @{authUser.login}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={handleSignOut}
                          className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-200 transition hover:bg-white/5 hover:text-white"
                        >
                          <span>↪</span>
                          <span>Sign out</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowLoginPage(true)}
                    className="login-pill rounded-full px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Login <span className="ml-1 text-xs">⌄</span>
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        {!isResultView && loginNotice && (
          <div
            className={`mx-auto w-full max-w-6xl rounded-2xl border px-4 py-3 text-sm ${
              loginNotice.type === "error"
                ? "border-red-500/20 bg-red-500/10 text-red-200"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {loginNotice.text}
          </div>
        )}

        {isHomeView && (
        <section className="hero-panel relative overflow-hidden rounded-4xl px-4 py-10 text-center md:px-8 md:py-14">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-orb hero-orb--left" aria-hidden="true" />
          <div className="hero-orb hero-orb--right" aria-hidden="true" />

          <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center">
            <div className="hero-badge mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-violet-200 shadow-lg shadow-violet-500/10">
              <span className="text-lg text-violet-300">✦</span>
              <span>Powered by Advanced AI Analytics</span>
              <span className="text-lg text-violet-300">✦</span>
            </div>

            <h1 className="hero-heading max-w-4xl text-balance font-extrabold leading-[0.9] tracking-tight">
              <span className="hero-heading__top block text-white/90">Unlock the Power of</span>
              <span className="hero-heading__bottom block">GitHub Intelligence</span>
            </h1>

            <p className="mt-7 max-w-4xl text-base leading-8 text-slate-300 md:text-[1.3rem] md:leading-8">
              Analyze profiles, track contributions, and gain deep insights into GitHub repositories with our advanced analytics platform.
            </p>

            <div className="mt-9 w-full max-w-5xl rounded-[1.6rem] border border-fuchsia-500/30 bg-[#1a2337]/95 p-2.5 shadow-[0_0_28px_rgba(236,72,153,0.34)] md:p-3">
              <div className="flex flex-col gap-2.5 md:flex-row md:items-stretch">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                      <path
                        fill="currentColor"
                        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.48 0-.24-.01-.88-.02-1.72-2.78.62-3.37-1.38-3.37-1.38-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.15-4.56-5.12 0-1.13.39-2.06 1.03-2.79-.1-.27-.45-1.34.1-2.78 0 0 .84-.27 2.75 1.06A9.3 9.3 0 0 1 12 6.85c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.06 2.75-1.06.55 1.44.2 2.51.1 2.78.64.73 1.03 1.66 1.03 2.79 0 3.98-2.34 4.86-4.57 5.11.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.48A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
                      />
                    </svg>
                  </div>
                  <input
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      fetchSuggestions(event.target.value);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onKeyDown={(event) => event.key === "Enter" && analyzeProfile()}
                    placeholder="Enter GitHub username (e.g., torvalds)"
                    className="hero-input h-14 w-full rounded-xl border border-white/5 bg-[#24314a] pl-13 pr-4 text-[0.96rem] text-slate-100 placeholder:text-slate-500 outline-none disabled:cursor-not-allowed disabled:opacity-60 md:h-14"
                  />
                </div>

                <button
                  onClick={() => analyzeProfile()}
                  className="hero-analyze-btn h-14 rounded-xl px-6 text-[1rem] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:h-14 md:w-40"
                >
                  <span className="mr-2">⚡</span>
                  Analyze
                </button>
              </div>

              <p className="mt-4 text-sm text-slate-400 md:text-[0.98rem]">
                Get detailed analytics, contribution graphs, and repository insights
              </p>

              {loading && (
                <p className="mt-3 text-sm text-indigo-200">Fetching profile data...</p>
              )}

              {error && (
                <p className="mt-3 text-sm text-rose-300">{error}</p>
              )}

              {showDropdown && suggestions.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#111827] text-left shadow-2xl shadow-black/50">
                  {suggestions.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => {
                        setUsername(user.login);
                        setShowDropdown(false);
                        analyzeProfile(user.login);
                      }}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-white/5"
                    >
                      <img src={user.avatar_url} className="h-9 w-9 rounded-full" />
                      <p className="text-sm text-slate-200">{user.login}</p>
                    </div>
                  ))}
                </div>
              )}

              {!authUser && (
                <div className="mt-4 space-y-3">
                  <div className="text-sm text-slate-400">
                    Sign in to save and view search history.
                  </div>

                  {oauthConfig.google && (
                    <button
                      type="button"
                      onClick={() => startOAuthLogin("google")}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                      <span>Sign in with Google</span>
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        </section>
        )}

        {!isResultView && showLoginPage && (
          <section className="hero-panel relative overflow-hidden rounded-4xl px-4 py-8 md:px-8 md:py-10">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-orb hero-orb--left" aria-hidden="true" />
            <div className="hero-orb hero-orb--right" aria-hidden="true" />

            <div className="login-shell relative z-10 mx-auto grid w-full max-w-4xl gap-4 lg:grid-cols-[0.95fr_1.4fr]">
              <div className="login-brand rounded-3xl border border-white/10 p-6">
                <div className="inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-200">
                  Secure OAuth Access
                </div>
                <h2 className="mt-4 text-2xl font-bold text-white md:text-3xl">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-300 md:text-base">
                  Sign in to unlock history, saved profiles, and personalized insights.
                </p>
                <p className="mt-5 text-xs text-slate-400">
                  Your account is used only for authentication and personalized dashboard actions.
                </p>
              </div>

              <div className="login-card rounded-3xl border border-white/10 p-4 md:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-300">Choose a sign-in provider</div>
                  <button
                    onClick={() => setShowLoginPage(false)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    Back
                  </button>
                </div>

                <div className="space-y-2.5">
                  {loginProviders.map((provider) => (
                    <button
                      key={provider.key}
                      onClick={() => startOAuthLogin(provider.key)}
                      disabled={!oauthConfig[provider.key]}
                      className="login-provider w-full rounded-2xl border border-white/10 bg-[#18233a]/90 px-4 py-3 text-left transition hover:border-fuchsia-400/35 hover:bg-[#1d2a45] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${
                          provider.key === "github"
                            ? "bg-sky-400"
                            : provider.key === "google"
                              ? "bg-rose-400"
                              : "bg-indigo-400"
                        }`} />
                        <div className="text-base font-semibold text-white">{provider.label}</div>
                      </div>
                      <div className="mt-1 pl-5 text-sm text-slate-400">{provider.subtitle}</div>
                    </button>
                  ))}
                </div>

                {!oauthConfig.github && !oauthConfig.google && !oauthConfig.linkedin && (
                  <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                    OAuth is not configured on the backend yet. Add your client IDs and secrets in <span className="font-semibold">backend/.env</span>, then restart the backend.
                  </div>
                )}

                <p className="mt-4 text-xs text-slate-400">
                  Providers that are not configured in backend env are shown as disabled.
                </p>
              </div>
            </div>
          </section>
        )}

        {isHistoryView && history.length > 0 && (
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-gray-200">
                  Recent searches
                </h3>
                <span className="text-xs text-gray-500">Stored locally in your browser</span>
              </div>

              <button
                onClick={() => setShowHistory(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                Back to Home
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {history.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setUsername(item);
                    analyzeProfile(item);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-indigo-500/20"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {isHistoryView && history.length === 0 && (
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-gray-400">
            <div className="flex items-center justify-between gap-3">
              <span>No search history yet.</span>
              <button
                onClick={() => setShowHistory(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                Back to Home
              </button>
            </div>
          </div>
        )}

      </div>

      {profile && (
        <>
          <div className="mb-6 rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={profile.avatar_url}
                  alt={`${profile.login} avatar`}
                  className="h-18 w-18 rounded-full border border-white/20 object-cover"
                />
                <div>
                  <h2 className="text-2xl font-semibold">{profile.name || profile.login}</h2>
                  <p className="text-gray-400">@{profile.login}</p>
                </div>
              </div>

              <a
                href={profile.html_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                View GitHub Profile
              </a>
            </div>

            <p className="mt-4 text-sm text-slate-300">{profile.bio || "No bio provided."}</p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
              {profile.location && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Location: {profile.location}</span>
              )}
              {profile.company && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Company: {profile.company}</span>
              )}
              {profile.public_gists !== undefined && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Public gists: {profile.public_gists}</span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Joined: {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p>Developer Score</p>
              <h1 className="text-4xl font-bold">{score}</h1>
              <p className="text-sm text-indigo-400">{level}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p>Repositories</p>
              <h2 className="text-3xl">{repos.length}</h2>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p>Followers</p>
              <h2 className="text-3xl">{profile.followers}</h2>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p>Total Stars</p>
              <h2 className="text-3xl">
                {repos.reduce((a, r) => a + r.stargazers_count, 0)}
              </h2>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
              <h2 className="mb-4">Languages</h2>
              <LanguageChart repos={repos} languageData={languageData} />
              <div className="mt-4 flex flex-wrap gap-2">
                {(languageData.length > 0
                  ? languageData
                  : repos
                      .filter((repo, index, self) => repo.language && self.findIndex((item) => item.language === repo.language) === index)
                      .map((repo) => ({ name: repo.language, value: 1 })))
                  .slice(0, 8)
                  .map((item) => (
                    <span
                      key={item.name}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                    >
                      {item.name}
                    </span>
                  ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
              <h2 className="mb-4">Skills</h2>
              <RadarChartBox repos={repos} />
            </div>

            <div className="col-span-2 rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
              <h2 className="mb-4">Activity</h2>
              <ActivityChart repos={repos} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}