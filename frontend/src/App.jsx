import { useEffect, useState } from "react";
import axios from "axios";

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
  const [loginNotice] = useState(getLoginNotice);
  const [oauthConfig, setOauthConfig] = useState({ github: false, google: false, linkedin: false });
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("lastUsername") || "";
    } catch {
      return "";
    }
  });
  const [profile, setProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
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

  const startOAuthLogin = (provider) => {
    if (!oauthConfig[provider]) return;

    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  };

  const handleSignOut = () => {
    clearCookie("oauth_user");
    setAuthUser(null);
    setShowHistory(false);
    setProfile(null);
    setRepos([]);
    setUsername("");
    setSuggestions([]);
    setShowDropdown(false);
    localStorage.removeItem("lastUsername");
    localStorage.removeItem("history");
    setHistory([]);
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

  const analyzeProfile = async (user = username) => {
    if (!user || !authUser) return;

    setLoading(true);
    setProfile(null);

    try {
      const [profileRes, repoRes] = await Promise.all([
        axios.get(`https://api.github.com/users/${user}`),
        axios.get(`https://api.github.com/users/${user}/repos?per_page=100`)
      ]);

      setProfile(profileRes.data);
      setRepos(repoRes.data || []);
      localStorage.setItem("lastUsername", user);

      setHistory((prevHistory) => {
        const updated = [user, ...prevHistory.filter((item) => item !== user)].slice(0, 5);
        localStorage.setItem("history", JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.log(err);
    }

    setLoading(false);
  };

  const score = calculateScore(profile, repos);
  const level = getLevel(score);

  const recentProfileCards = [
    {
      name: "torvalds",
      meta: "1.2M commits • 45 repos",
      avatar: "👨‍💻",
    },
    {
      name: "gaearon",
      meta: "89K commits • 234 repos",
      avatar: "🧑‍💼",
    },
    {
      name: "sindresorhus",
      meta: "156K commits • 1100 repos",
      avatar: "👨‍💻",
    },
  ];

  return (
    <div className="app-shell min-h-screen px-4 py-4 text-white md:px-6 md:py-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12">
        <header className="nav-shell flex items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 px-4 py-3 md:px-5">
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

          <div className="flex items-center gap-3">
            <button
              onClick={() => authUser && setShowHistory((value) => !value)}
              disabled={!authUser}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                authUser
                  ? "text-slate-200 hover:bg-white/5"
                  : "cursor-not-allowed text-slate-500"
              }`}
            >
              <span>↺</span>
              <span>History</span>
            </button>

            {authUser ? (
              <button
                onClick={handleSignOut}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => startOAuthLogin("github")}
                disabled={!oauthConfig.github}
                className="login-pill rounded-full px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                Login <span className="ml-1 text-xs">⌄</span>
              </button>
            )}
          </div>
        </header>

        {loginNotice && (
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

        <section className="hero-panel relative overflow-hidden rounded-4xl px-4 py-12 text-center md:px-8 md:py-20">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-orb hero-orb--left" aria-hidden="true" />
          <div className="hero-orb hero-orb--right" aria-hidden="true" />

          <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center">
            <div className="hero-badge mb-10 inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-violet-200 shadow-lg shadow-violet-500/10">
              <span className="text-lg text-violet-300">✦</span>
              <span>Powered by Advanced AI Analytics</span>
              <span className="text-lg text-violet-300">✦</span>
            </div>

            <h1 className="hero-heading max-w-5xl text-balance font-extrabold leading-[0.88] tracking-tight">
              <span className="hero-heading__top block text-white/90">Unlock the Power of</span>
              <span className="hero-heading__bottom block">GitHub Intelligence</span>
            </h1>

            <p className="mt-9 max-w-4xl text-base leading-8 text-slate-300 md:text-[1.45rem] md:leading-[2.2rem]">
              Analyze profiles, track contributions, and gain deep insights into GitHub repositories with our advanced analytics platform.
            </p>

            <div className="mt-12 w-full max-w-5xl rounded-[1.8rem] border border-fuchsia-500/30 bg-[#1a2337]/95 p-3 shadow-[0_0_32px_rgba(236,72,153,0.38)] md:p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
                  <input
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      if (authUser) {
                        fetchSuggestions(event.target.value);
                      }
                    }}
                    onFocus={() => authUser && setShowDropdown(true)}
                    onKeyDown={(event) => event.key === "Enter" && analyzeProfile()}
                    placeholder="Enter GitHub username (e.g., torvalds)"
                    disabled={!authUser}
                    className="hero-input h-16 w-full rounded-2xl border border-white/5 bg-[#24314a] pl-14 pr-4 text-base text-slate-100 placeholder:text-slate-500 outline-none disabled:cursor-not-allowed disabled:opacity-60 md:h-16"
                  />
                </div>

                <button
                  onClick={() => analyzeProfile()}
                  disabled={!authUser}
                  className="hero-analyze-btn h-16 rounded-2xl px-8 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:h-16 md:w-44"
                >
                  <span className="mr-2">⚡</span>
                  Analyze
                </button>
              </div>

              <p className="mt-5 text-sm text-slate-400 md:text-base">
                Get detailed analytics, contribution graphs, and repository insights
              </p>

              {showDropdown && suggestions.length > 0 && authUser && (
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
                <div className="mt-6 text-sm text-slate-400">
                  Sign in to use search and history.
                </div>
              )}
            </div>

            <div className="mt-9 text-sm text-slate-400 md:text-base">
              Recently searched profiles:
            </div>

            <div className="mt-5 grid w-full max-w-5xl gap-4 md:grid-cols-3">
              {recentProfileCards.map((item) => (
                <div key={item.name} className="recent-card flex items-center gap-4 rounded-2xl border border-white/10 px-4 py-4 text-left">
                  <div className="recent-card__avatar">{item.avatar}</div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-white">{item.name}</div>
                    <div className="truncate text-xs text-slate-400">{item.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {authUser && showHistory && history.length > 0 && (
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-gray-200">
                Recent searches
              </h3>
              <span className="text-xs text-gray-500">Stored locally in your browser</span>
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

        {authUser && showHistory && history.length === 0 && (
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-gray-400">
            No search history yet.
          </div>
        )}

      </div>

      {profile && (
        <>
          <div className="mb-6 rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
            <h2 className="text-2xl font-semibold">
              {profile.name || profile.login}
            </h2>
            <p className="text-gray-400">@{profile.login}</p>
            <p className="mt-2 text-sm">{profile.bio}</p>
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
              <LanguageChart repos={repos} />
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