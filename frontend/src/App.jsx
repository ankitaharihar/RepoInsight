import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import "./App.css";

import {
  LanguageChart,
  RadarChartBox,
  ActivityChart
} from "./components/Charts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const TRENDING_USERS = ["torvalds", "gaearon", "sindresorhus", "yyx990803", "vercel"];

const escapeCsvCell = (value) => {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
};

const buildRepoCsv = (repoList = []) => {
  const header = [
    "name",
    "language",
    "stars",
    "forks",
    "open_issues",
    "updated_at",
    "html_url",
  ];

  const rows = repoList.map((repo) => [
    repo.name,
    repo.language || "Unknown",
    repo.stargazers_count ?? 0,
    repo.forks_count ?? 0,
    repo.open_issues_count ?? 0,
    repo.updated_at,
    repo.html_url,
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");
};

const buildLanguageData = (repoList = []) => {
  const totals = {};

  repoList.forEach((repo) => {
    if (repo.language) {
      totals[repo.language] = (totals[repo.language] || 0) + 1;
    }
  });

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));
};

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

const getScoreTone = (score) => {
  if (score >= 70) {
    return { label: "Strong", color: "#22c55e", textClass: "text-emerald-300" };
  }

  if (score >= 45) {
    return { label: "Average", color: "#f59e0b", textClass: "text-amber-300" };
  }

  return { label: "Beginner", color: "#ef4444", textClass: "text-rose-300" };
};

const buildAiInsights = (profile, repos, score) => {
  if (!profile || repos.length === 0) return [];

  const totalStars = repos.reduce((acc, repo) => acc + (repo.stargazers_count || 0), 0);
  const recentRepos = repos.filter((repo) => {
    const days = (Date.now() - new Date(repo.updated_at)) / (1000 * 60 * 60 * 24);
    return days < 30;
  }).length;
  const languageMap = {};

  repos.forEach((repo) => {
    if (repo.language) {
      languageMap[repo.language] = (languageMap[repo.language] || 0) + 1;
    }
  });

  const topLanguage = Object.entries(languageMap).sort((a, b) => b[1] - a[1])[0]?.[0];
  const consistency = recentRepos >= 4 ? "high" : recentRepos >= 2 ? "moderate" : "low";

  return [
    topLanguage
      ? `Strong signal in ${topLanguage}. ${Math.round((languageMap[topLanguage] / repos.length) * 100)}% repos use it.`
      : "Mixed language profile with no single dominant stack yet.",
    score >= 65
      ? "Overall profile health is strong with balanced visibility and repo quality."
      : "Profile can improve with pinned projects and clearer README storytelling.",
    consistency === "high"
      ? `Consistency is excellent: ${recentRepos} repos updated in the last 30 days.`
      : `Consistency is ${consistency}. Try weekly commits to improve momentum signals.`,
    totalStars >= 100
      ? `Community traction looks solid with ${totalStars} stars across public repositories.`
      : "Focus on one standout repository to improve discoverability and stars.",
  ];
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
    const parsed = JSON.parse(decodeURIComponent(rawCookie));
    return {
      ...parsed,
      avatarUrl: parsed?.avatarUrl || parsed?.avatar_url || parsed?.picture || "",
    };
  } catch {
    try {
      const parsed = JSON.parse(rawCookie);
      return {
        ...parsed,
        avatarUrl: parsed?.avatarUrl || parsed?.avatar_url || parsed?.picture || "",
      };
    } catch {
      return null;
    }
  }
};

const getInitials = (value) => {
  const safeValue = (value || "User").trim();
  const parts = safeValue.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "U";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const normalizeHistoryItem = (item) => {
  if (typeof item === "string") {
    const query = item.trim();
    return query ? { query, searchedAt: new Date().toISOString() } : null;
  }

  if (!item || typeof item !== "object") return null;

  const query = String(item.query || item.username || item.user || "").trim();
  if (!query) return null;

  return {
    query,
    searchedAt: item.searchedAt || item.updatedAt || item.at || new Date().toISOString(),
  };
};

const normalizeHistoryList = (items = []) =>
  items.map(normalizeHistoryItem).filter(Boolean).slice(0, 6);

const getHistoryStorageKey = (user) => {
  const keyPart = user?.id || user?.login || user?.provider || "guest";
  return `history:${keyPart}`;
};

const readHistoryForUser = (user) => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(getHistoryStorageKey(user))) || [];
    return normalizeHistoryList(parsed);
  } catch {
    return [];
  }
};

const writeHistoryForUser = (user, items) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(getHistoryStorageKey(user), JSON.stringify(normalizeHistoryList(items)));
};

const formatHistoryDate = (value) => {
  if (!value) return "Recently searched";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently searched";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const UserAvatar = ({ user, sizeClass, textSizeClass }) => {
  const [hasError, setHasError] = useState(false);
  const label = user?.name || user?.login || "User";
  const showImage = Boolean(user?.avatarUrl) && !hasError;

  return (
    <span
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-700`}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <span className={`${textSizeClass} font-semibold uppercase text-slate-200`}>
          {getInitials(label)}
        </span>
      )}
    </span>
  );
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
      github_state_mismatch: "GitHub login state mismatch",
      google_state_mismatch: "Google login state mismatch",
      github_callback_failed: "GitHub callback failed",
      google_callback_failed: "Google callback failed",
    };

    return {
      type: "error",
      text: friendlyErrors[error] || `Login failed: ${error}`,
    };
  }

  return null;
};

const RouteInfoPanel = ({ title, description, bullets, accent }) => (
  <section className="hero-panel relative overflow-hidden rounded-4xl px-4 py-10 md:px-8 md:py-12">
    <div className="hero-grid" aria-hidden="true" />
    <div className="hero-orb hero-orb--left" aria-hidden="true" />
    <div className="hero-orb hero-orb--right" aria-hidden="true" />

    <div className="relative z-10 mx-auto max-w-4xl text-center">
      <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
        {accent}
      </div>
      <h2 className="mt-4 text-3xl font-extrabold text-white md:text-5xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-slate-300 md:text-lg">{description}</p>

      <div className="mt-7 grid gap-3 text-left md:grid-cols-3">
        {bullets.map((bullet) => (
          <div
            key={bullet}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
          >
            {bullet}
          </div>
        ))}
      </div>
    </div>
  </section>
);

const pricingPlans = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: "$0",
    yearlyEquivalent: "$0",
    subtitle: "Great for solo developers exploring public profile analytics.",
    features: [
      "Profile score and repository insights",
      "Basic charts and language breakdown",
      "Public repo trend snapshots",
    ],
    cta: "Start Free",
    tone: "base",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: "$12",
    yearlyEquivalent: "$9",
    subtitle: "For developers who want deeper insight, stronger visibility, and faster growth.",
    features: [
      "AI-powered developer insights",
      "Resume export (PDF)",
      "Advanced repo analytics",
      "Recent search history",
      "Priority API performance",
    ],
    cta: "Get Started",
    tone: "highlight",
    badge: "Most Popular",
  },
  {
    id: "team",
    name: "Team",
    monthlyPrice: "$39",
    yearlyEquivalent: "$29",
    subtitle: "For teams that collaborate on engineering intelligence dashboards.",
    features: [
      "Team comparison views",
      "Multi-user dashboards",
      "Collaboration analytics",
      "Role-based access controls",
    ],
    cta: "Contact Sales",
    tone: "base",
  },
];

const PricingPanel = ({ subscription, authUser, onSelectPlan, onCancelRenewal, onResumeRenewal, loading }) => {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const isYearly = billingCycle === "yearly";

  return (
    <section className="hero-panel relative overflow-hidden rounded-4xl px-4 py-10 md:px-8 md:py-12">
    <div className="hero-grid" aria-hidden="true" />
    <div className="hero-orb hero-orb--left" aria-hidden="true" />
    <div className="hero-orb hero-orb--right" aria-hidden="true" />

    <div className="relative z-10 mx-auto max-w-6xl">
      <div className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          Pricing
        </div>
        <h2 className="mt-4 text-3xl font-extrabold text-white md:text-5xl">Simple Plans, Transparent Value</h2>
        <p className="mx-auto mt-4 max-w-2xl text-slate-300 md:text-lg">
          Start free for personal analysis, then scale to team workflows with deeper usage and collaboration.
        </p>
      </div>

      <div className="pricing-cycle-toggle mt-6 flex items-center justify-center">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`pricing-cycle-chip ${!isYearly ? "pricing-cycle-chip--active" : ""}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`pricing-cycle-chip ${isYearly ? "pricing-cycle-chip--active" : ""}`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="pricing-status mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
        <div>
          {authUser ? (
            <>
              Current Plan: <span className="font-semibold uppercase">{subscription.plan || "free"}</span>
            </>
          ) : (
            <>
              You are on <span className="font-semibold uppercase">Free Plan</span>
            </>
          )}
          {authUser && subscription.status && subscription.status !== "inactive" ? (
            <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
              {subscription.status}
            </span>
          ) : null}
        </div>
        {subscription.currentPeriodEnd && (
          <div className="mt-1 text-xs text-slate-400">
            Billing period ends: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </div>
        )}

        {(subscription.plan === "pro" || subscription.plan === "team") && (
          <div className="mt-3 flex flex-wrap gap-2">
            {subscription.cancelAtPeriodEnd ? (
              <button
                type="button"
                onClick={onResumeRenewal}
                disabled={loading}
                className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
              >
                Resume Renewal
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancelRenewal}
                disabled={loading}
                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
              >
                Cancel At Period End
              </button>
            )}
          </div>
        )}
      </div>

      <div className="pricing-grid mt-8 grid gap-4 lg:grid-cols-3">
        {pricingPlans.map((plan) => (
          <article
            key={plan.name}
            className={`pricing-card rounded-3xl border p-5 ${plan.tone === "highlight" ? "pricing-card--highlight" : "pricing-card--base"}`}
          >
            <div className="pricing-card-head flex items-center justify-between gap-3">
              <div className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">{plan.name}</div>
              {plan.badge ? <div className="pricing-popular-badge">🔥 {plan.badge}</div> : null}
            </div>
            <div className="mt-3 space-y-1">
              <div className={`pricing-price-line ${!isYearly ? "pricing-price-line--active" : ""}`}>
                <span className="text-4xl font-extrabold text-white">{plan.monthlyPrice}</span>
                <span className="pb-1 text-sm text-slate-400">/month</span>
              </div>
              {plan.id !== "free" && (
                <div className={`pricing-price-line pricing-price-line--yearly ${isYearly ? "pricing-price-line--active" : ""}`}>
                  <span className="text-2xl font-bold text-emerald-300">{plan.yearlyEquivalent}</span>
                  <span className="text-xs text-emerald-200/90">/month (billed yearly)</span>
                </div>
              )}
            </div>
            <p className="mt-3 text-sm text-slate-300">{plan.subtitle}</p>

            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="pricing-check mt-1 inline-block h-2 w-2 rounded-full" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {!(plan.id === "free" && authUser && subscription.plan === "free") && (
              <button
                type="button"
                onClick={() => onSelectPlan(plan.id)}
                disabled={loading || subscription.plan === plan.id}
                className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${plan.tone === "highlight" ? "pricing-btn--highlight" : "pricing-btn--base"}`}
              >
                {subscription.plan === plan.id ? "Current Plan" : plan.cta}
              </button>
            )}

            {plan.id === "free" && authUser && subscription.plan === "free" && (
              <div className="mt-6 inline-flex items-center rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200">
                Your Plan
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="pricing-trust-line mt-6 text-center text-xs font-medium tracking-[0.08em] text-slate-300">
        No credit card required. Cancel anytime.
      </div>
    </div>
  </section>
  );
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;

    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [authUser, setAuthUser] = useState(getAuthUser);
  const [loginNotice, setLoginNotice] = useState(getLoginNotice);
  const [oauthConfig, setOauthConfig] = useState({ github: false, google: false });
  const [subscription, setSubscription] = useState({
    plan: "free",
    status: "inactive",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
  const [updatingPlan, setUpdatingPlan] = useState(false);
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
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [repoSortBy, setRepoSortBy] = useState("stars_desc");
  const [includeForkRepos, setIncludeForkRepos] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const profileMenuRef = useRef(null);
  const exploreMenuRef = useRef(null);
  const searchPanelRef = useRef(null);
  const resultSectionRef = useRef(null);
  const suggestTimerRef = useRef(null);
  const [history, setHistory] = useState(() => readHistoryForUser(getAuthUser()));

  useEffect(() => {
    const loadSubscription = async () => {
      if (!authUser) {
        setSubscription({ plan: "free", status: "inactive", currentPeriodEnd: null, cancelAtPeriodEnd: false });
        return;
      }

      try {
        const response = await axios.get(`${API_BASE_URL}/api/billing/subscription`, {
          withCredentials: true,
        });
        setSubscription(response.data.subscription);
      } catch {
        setSubscription({ plan: "free", status: "inactive", currentPeriodEnd: null, cancelAtPeriodEnd: false });
      }
    };

    loadSubscription();
  }, [authUser]);

  useEffect(() => {
    if (location.pathname !== "/") {
      setShowLoginPage(false);
      setShowHistory(false);
      setShowExploreMenu(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkoutState = params.get("checkout");

    if (!checkoutState) return;

    if (checkoutState === "success") {
      setLoginNotice({ type: "success", text: "Payment successful. Your plan is being activated." });
    }

    if (checkoutState === "cancel") {
      setLoginNotice({ type: "error", text: "Checkout canceled. No changes were made." });
    }

    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      document.body.setAttribute("data-theme", theme);
    }

    localStorage.setItem("theme", theme);
  }, [theme]);

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
    if (!authUser) {
      setHistory([]);
      return;
    }

    setHistory(readHistoryForUser(authUser));
  }, [authUser]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }

      if (exploreMenuRef.current && !exploreMenuRef.current.contains(event.target)) {
        setShowExploreMenu(false);
      }

      if (searchPanelRef.current && !searchPanelRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!username.trim() || !showDropdown) {
      setSuggestions([]);
      return;
    }

    window.clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = window.setTimeout(() => {
      fetchSuggestions(username.trim());
    }, 280);

    return () => window.clearTimeout(suggestTimerRef.current);
  }, [username, showDropdown]);

  const startOAuthLogin = (provider) => {
    if (!oauthConfig[provider]) return;

    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  };

  const scrollToSection = (sectionId) => {
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleExploreRedirect = (target) => {
    setShowExploreMenu(false);

    if (target === "profile-search") {
      navigate("/");
      setShowLoginPage(false);
      setShowHistory(false);
      scrollToSection("search-panel");
      return;
    }

    if (target === "analytics") {
      navigate("/");
      setShowLoginPage(false);
      setShowHistory(false);
      scrollToSection("dashboard-section");
      return;
    }

    if (target === "login-history") {
      navigate("/");
      if (authUser) {
        setShowLoginPage(false);
        setShowHistory(true);
        scrollToSection("history-section");
        return;
      }

      setShowHistory(false);
      setShowLoginPage(true);
      scrollToSection("login-section");
    }
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
    setHistory([]);
    setLanguageData([]);
    setRepoSearchQuery("");
    setSelectedLanguage("all");
    setRepoSortBy("stars_desc");
    setIncludeForkRepos(true);
    setSubscription({ plan: "free", status: "inactive", currentPeriodEnd: null, cancelAtPeriodEnd: false });
  };

  const handlePlanSelect = async (planId) => {
    if (!authUser) {
      setShowLoginPage(true);
      setLoginNotice({ type: "error", text: "Please sign in first to choose a plan." });
      return;
    }

    if (subscription.plan === planId) return;

    try {
      setUpdatingPlan(true);
      if (planId === "free") {
        const response = await axios.post(
          `${API_BASE_URL}/api/billing/subscription`,
          { plan: "free" },
          { withCredentials: true }
        );
        setSubscription(response.data.subscription);
        setLoginNotice({ type: "success", text: "Switched to FREE plan." });
      } else {
        const response = await axios.post(
          `${API_BASE_URL}/api/billing/checkout-session`,
          { plan: planId },
          { withCredentials: true }
        );

        if (response.data?.url) {
          window.location.href = response.data.url;
          return;
        }

        setLoginNotice({ type: "error", text: "Unable to start checkout right now." });
      }
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to update plan right now.";
      setLoginNotice({ type: "error", text: message });
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleCancelRenewal = async () => {
    try {
      setUpdatingPlan(true);
      const response = await axios.post(`${API_BASE_URL}/api/billing/subscription/cancel`, {}, { withCredentials: true });
      setSubscription(response.data.subscription);
      setLoginNotice({ type: "success", text: "Your subscription will cancel at period end." });
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to cancel renewal right now.";
      setLoginNotice({ type: "error", text: message });
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleResumeRenewal = async () => {
    try {
      setUpdatingPlan(true);
      const response = await axios.post(`${API_BASE_URL}/api/billing/subscription/resume`, {}, { withCredentials: true });
      setSubscription(response.data.subscription);
      setLoginNotice({ type: "success", text: "Subscription renewal resumed." });
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to resume renewal right now.";
      setLoginNotice({ type: "error", text: message });
    } finally {
      setUpdatingPlan(false);
    }
  };

  const fetchSuggestions = async (value) => {
    if (!value) {
      setSuggestions([]);
      return;
    }

    try {
      const res = await axios.get(`${API_BASE_URL}/api/github/search/users?q=${encodeURIComponent(value)}&per_page=8`);
      setSuggestions(res.data.items.slice(0, 5));
      setShowDropdown(true);
    } catch (err) {
      console.log(err);
    }
  };

  const analyzeProfile = async (user = username) => {
    if (!authUser) {
      setShowLoginPage(true);
      setLoginNotice({
        type: "error",
        text: "Please sign in first to search GitHub profiles.",
      });
      return;
    }

    const normalizedUser = user.trim();

    if (!normalizedUser) return;

    setUsername(normalizedUser);

    setLoading(true);
    setError("");
    setProfile(null);
    setRepos([]);
    setSuggestions([]);
    setShowDropdown(false);

    try {
      const [profileRes, repoRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/github/${normalizedUser}`),
        axios.get(`${API_BASE_URL}/api/github/${normalizedUser}/repos?per_page=100`)
      ]);

      const repoPayload = repoRes.data;
      const repoList = Array.isArray(repoPayload)
        ? repoPayload
        : Array.isArray(repoPayload?.data)
          ? repoPayload.data
          : [];

      setProfile(profileRes.data);
      setRepos(repoList);
      setLanguageData(buildLanguageData(repoList));
      setRepoSearchQuery("");
      setSelectedLanguage("all");
      setRepoSortBy("stars_desc");
      setIncludeForkRepos(true);

      setHistory((prevHistory) => {
        const updated = normalizeHistoryList([
          { query: normalizedUser, searchedAt: new Date().toISOString() },
          ...prevHistory.filter((item) => item.query !== normalizedUser),
        ]);
        writeHistoryForUser(authUser, updated);
        return updated;
      });

      window.requestAnimationFrame(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      console.log(err);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setError("User not found. Check the username and try again.");
      } else if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError("GitHub rate limit reached. Please try again in a moment.");
      } else {
        setError("Could not load GitHub data right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const score = calculateScore(profile, repos);
  const level = getLevel(score);
  const scoreTone = getScoreTone(score);
  const availableLanguages = useMemo(
    () =>
      Array.from(new Set(repos.map((repo) => repo.language).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [repos]
  );
  const filteredRepos = useMemo(() => {
    const query = repoSearchQuery.trim().toLowerCase();

    const filtered = repos.filter((repo) => {
      if (!includeForkRepos && repo.fork) return false;
      if (selectedLanguage !== "all" && (repo.language || "Unknown") !== selectedLanguage) {
        return false;
      }
      if (!query) return true;

      return (
        repo.name.toLowerCase().includes(query) ||
        (repo.description || "").toLowerCase().includes(query)
      );
    });

    return [...filtered].sort((a, b) => {
      if (repoSortBy === "stars_desc") return b.stargazers_count - a.stargazers_count;
      if (repoSortBy === "updated_desc") return new Date(b.updated_at) - new Date(a.updated_at);
      if (repoSortBy === "forks_desc") return b.forks_count - a.forks_count;
      return a.name.localeCompare(b.name);
    });
  }, [repos, repoSearchQuery, selectedLanguage, repoSortBy, includeForkRepos]);
  const topRepos = useMemo(
    () => [...filteredRepos].slice(0, 5),
    [filteredRepos]
  );
  const averageStars = useMemo(() => {
    if (filteredRepos.length === 0) return 0;
    return (
      filteredRepos.reduce((acc, repo) => acc + (repo.stargazers_count || 0), 0) /
      filteredRepos.length
    );
  }, [filteredRepos]);
  const forkRatio = useMemo(() => {
    if (filteredRepos.length === 0) return 0;
    return (filteredRepos.filter((repo) => repo.fork).length / filteredRepos.length) * 100;
  }, [filteredRepos]);
  const aiInsights = useMemo(() => buildAiInsights(profile, repos, score), [profile, repos, score]);
  const isUserNotFoundError = error.toLowerCase().includes("user not found");
  const errorTitle = isUserNotFoundError ? "User not found" : "Unable to fetch data";
  const errorHint = isUserNotFoundError
    ? "Try verified usernames like torvalds, gaearon, or vercel."
    : "Check backend token and network, then try again.";
  const isHomeRoute = location.pathname === "/";
  const isResultView = Boolean(profile);
  const isHomeView = isHomeRoute && !isResultView && !showLoginPage && !showHistory;
  const isHistoryView = isHomeRoute && !isResultView && !showLoginPage && authUser && showHistory;
  const hasAnyOauthProvider = oauthConfig.github || oauthConfig.google;
  const authProviderLabel = authUser?.provider
    ? `${authUser.provider.charAt(0).toUpperCase()}${authUser.provider.slice(1)} Profile`
    : "Account";
  const canExportCsv = authUser && ["pro", "team"].includes(subscription.plan);
  const canUseProFeatures = authUser && ["pro", "team"].includes(subscription.plan);
  const canUseTeamDashboards = authUser && subscription.plan === "team";

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
  ];

  const handleExportReposCsv = () => {
    if (filteredRepos.length === 0) return;

    const csv = buildRepoCsv(filteredRepos);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${profile?.login || "github-profile"}-repos.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportResumePdf = () => {
    if (!profile || !canUseProFeatures) return;

    const topSkills = (languageData.length > 0 ? languageData : [])
      .slice(0, 6)
      .map((item) => `${item.name} (${item.value})`)
      .join(" • ");

    const topProjects = topRepos
      .slice(0, 4)
      .map((repo) => `<li><strong>${repo.name}</strong> - ⭐ ${repo.stargazers_count} - ${repo.language || "Unknown"}</li>`)
      .join("");

    const summaryHtml = `
      <html>
        <head>
          <title>${profile.login} Resume Export</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 24px; line-height: 1.5; }
            h1, h2 { margin-bottom: 8px; }
            .muted { color: #475569; }
            .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <h1>${profile.name || profile.login}</h1>
          <div class="muted">@${profile.login}</div>
          <p>${profile.bio || "GitHub developer profile."}</p>

          <div class="card">
            <h2>Profile Summary</h2>
            <p>Followers: ${profile.followers} | Public Repos: ${repos.length} | Total Stars: ${repos.reduce((a, r) => a + r.stargazers_count, 0)}</p>
            <p>Developer Score: ${score} (${getLevel(score)})</p>
          </div>

          <div class="card">
            <h2>Top Skills</h2>
            <p>${topSkills || "No dominant language detected"}</p>
          </div>

          <div class="card">
            <h2>Top Repositories</h2>
            <ul>${topProjects || "<li>No repositories found</li>"}</ul>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setLoginNotice({ type: "error", text: "Please allow popups to export resume as PDF." });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(summaryHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className={`app-shell min-h-screen px-4 py-4 text-white md:px-6 md:py-5 ${theme === "light" ? "theme-light" : "theme-dark"}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12">
        <header className="nav-shell relative z-50 flex flex-col gap-3 rounded-[1.75rem] border border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-start md:px-5">
          <div className="nav-brand-row flex min-w-0 items-center justify-between gap-3 md:w-auto md:justify-start">
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
                RepoInsight
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-400 lg:ml-8 lg:flex">
            <NavLink to="/features" className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
              Features
            </NavLink>
            <NavLink to="/pricing" className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
              Pricing
            </NavLink>
            <NavLink to="/documentation" className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
              Documentation
            </NavLink>
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
                  <button
                    type="button"
                    onClick={() => handleExploreRedirect("profile-search")}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-fuchsia-400/30 hover:bg-white/10"
                  >
                    <div className="text-sm font-semibold text-white">Profile Search</div>
                    <div className="mt-1 text-xs text-slate-400">Search any public GitHub username and load profile data instantly.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExploreRedirect("analytics")}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-fuchsia-400/30 hover:bg-white/10"
                  >
                    <div className="text-sm font-semibold text-white">Analytics Dashboard</div>
                    <div className="mt-1 text-xs text-slate-400">View score, followers, stars, language breakdown, and activity graphs.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExploreRedirect("login-history")}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-fuchsia-400/30 hover:bg-white/10"
                  >
                    <div className="text-sm font-semibold text-white">Login + History</div>
                    <div className="mt-1 text-xs text-slate-400">Sign in to unlock search history and full analytics.</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="nav-actions flex w-full items-center gap-5 md:ml-auto md:w-auto md:justify-end">
            <button
              type="button"
              onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
              className="theme-toggle-btn inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
              <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>

            {isResultView ? (
              <button
                onClick={() => {
                  if (!isHomeRoute) {
                    navigate("/");
                  }
                  setProfile(null);
                  setRepos([]);
                  setLanguageData([]);
                  setError("");
                  setShowHistory(false);
                  setShowProfileMenu(false);
                }}
                className="nav-new-search-btn rounded-full border border-fuchsia-400/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-fuchsia-300/45 hover:bg-white/10"
              >
                New Search
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (!isHomeRoute) {
                      navigate("/");
                    }
                    if (authUser) {
                      setShowHistory((value) => !value);
                      return;
                    }
                    setShowLoginPage(true);
                  }}
                  disabled={!authUser && !hasAnyOauthProvider}
                  className={`nav-history-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    authUser
                      ? "text-slate-200 hover:bg-white/5"
                      : "text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:text-slate-500"
                  }`}
                >
                  <span>↺</span>
                  <span>History</span>
                </button>

                {authUser ? (
                  <div className="nav-profile-wrap relative z-50" ref={profileMenuRef}>
                    <button
                      onClick={() => setShowProfileMenu((value) => !value)}
                      className="nav-profile-btn profile-pill flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-white/10"
                    >
                      <UserAvatar user={authUser} sizeClass="h-8 w-8" textSizeClass="text-[0.62rem]" />
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
                          <UserAvatar user={authUser} sizeClass="h-10 w-10" textSizeClass="text-xs" />
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
                    onClick={() => {
                      if (!isHomeRoute) {
                        navigate("/");
                      }
                      setShowLoginPage(true);
                    }}
                    className="nav-login-btn login-pill rounded-full px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
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

        {!isHomeRoute && (
          <>
            {location.pathname === "/features" && (
              <RouteInfoPanel
                accent="Platform Features"
                title="Built For Deep GitHub Insights"
                description="Track repositories, evaluate momentum, and understand engineering signals in one clean workflow."
                bullets={[
                  "Profile scoring with quality indicators",
                  "Repository filtering, sorting, and CSV export",
                  "Language, activity, and skill visual analytics",
                ]}
              />
            )}

            {location.pathname === "/pricing" && (
              <PricingPanel
                subscription={subscription}
                authUser={authUser}
                onSelectPlan={handlePlanSelect}
                onCancelRenewal={handleCancelRenewal}
                onResumeRenewal={handleResumeRenewal}
                loading={updatingPlan}
              />
            )}

            {location.pathname === "/documentation" && (
              <RouteInfoPanel
                accent="Documentation"
                title="Everything You Need To Get Started"
                description="Set up OAuth, configure backend environment, and learn each dashboard module with clear guides."
                bullets={[
                  "Installation and environment setup",
                  "Authentication and API usage guides",
                  "Troubleshooting and best practices",
                ]}
              />
            )}
          </>
        )}

        {isHomeView && (
          <section className="hero-panel relative overflow-hidden rounded-4xl px-4 py-10 text-center md:px-8 md:py-14">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-orb hero-orb--left" aria-hidden="true" />
            <div className="hero-orb hero-orb--right" aria-hidden="true" />

            <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center">
              <div className="hero-badge mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-violet-200 shadow-lg shadow-violet-500/10">
                <span className="text-lg text-violet-300">✦</span>
                <span>Built for developers who need signal, not noise</span>
                <span className="text-lg text-violet-300">✦</span>
              </div>

              <h1 className="hero-heading max-w-4xl text-balance font-extrabold leading-[0.9] tracking-tight">
                <span className="hero-heading__top block text-white/90">Unlock the Power of</span>
                <span className="hero-heading__bottom block">RepoInsight</span>
              </h1>

              <p className="mt-7 max-w-4xl text-base leading-8 text-slate-300 md:text-[1.3rem] md:leading-8">
                Analyze profiles, repos, and developer momentum in seconds, then turn insights into better career and team decisions.
              </p>

              <div className="hero-trust-chips mt-5 flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-200 md:text-sm">
                <span className="hero-trust-chip">No credit card required</span>
                <span className="hero-trust-chip">Cancel anytime</span>
                <span className="hero-trust-chip">Setup in under 60 seconds</span>
              </div>

              <div id="search-panel" ref={searchPanelRef} className="hero-search-shell mt-9 w-full max-w-5xl rounded-[1.6rem] border border-fuchsia-500/30 bg-[#1a2337]/95 p-2.5 shadow-[0_0_28px_rgba(236,72,153,0.34)] md:p-3">
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
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onKeyDown={(event) => event.key === "Enter" && analyzeProfile()}
                      disabled={!authUser}
                      placeholder="Enter GitHub username (e.g., torvalds)"
                      className="hero-input h-14 w-full rounded-xl border border-white/5 bg-[#24314a] pl-13 pr-4 text-[0.96rem] text-slate-100 placeholder:text-slate-500 outline-none disabled:cursor-not-allowed disabled:opacity-60 md:h-14"
                    />
                  </div>

                  <button
                    onClick={() => analyzeProfile()}
                    disabled={!authUser}
                    className="hero-analyze-btn h-14 rounded-xl px-6 text-[1rem] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:h-14 md:w-40"
                  >
                    <span className="mr-2">⚡</span>
                    Analyze
                  </button>
                </div>

                {!(showDropdown && suggestions.length > 0) && (
                  <>
                    <p className="mt-4 text-sm text-slate-400 md:text-[0.98rem]">
                      Get profile score, AI insights, and repo-level analytics in one clean workflow.
                    </p>

                    <p className="mt-2 text-xs text-slate-500 md:text-sm">
                      {authUser
                        ? "Tip: Try usernames like torvalds, gaearon, or vercel for instant demo-quality results."
                        : "Sign in to unlock search history and full analytics."}
                    </p>
                  </>
                )}

                {loading && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-[#101a2e] p-4 text-left">
                    <div className="flex items-center gap-3 text-sm text-indigo-200">
                      <span className="loading-spinner" />
                      <span>Analyzing profile and repository metadata...</span>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <div className="skeleton-line h-3 w-2/3" />
                      <div className="skeleton-line h-3 w-full" />
                      <div className="skeleton-line h-3 w-4/5" />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="error-panel mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-left">
                    <div className="text-sm font-semibold text-rose-200">{errorTitle}</div>
                    <div className="mt-1 text-sm text-rose-100/90">{error}</div>
                    <div className="mt-2 text-xs text-rose-100/80">{errorHint}</div>
                  </div>
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

                <div className="hero-meta-grid mt-5 grid gap-3 text-left md:grid-cols-2">
                  <div className="hero-meta-card">
                    <div className="hero-meta-card__eyebrow">Recent searches</div>
                    <div className="hero-meta-card__header">Jump back into a previous profile.</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {history.length > 0 ? (
                        history.slice(0, 5).map((item) => (
                          <button
                            key={`recent-${item.query}`}
                            type="button"
                            onClick={() => analyzeProfile(item.query)}
                            className="hero-chip hero-chip--recent"
                          >
                            <UserAvatar
                              user={{
                                login: item.query,
                                name: item.query,
                                avatarUrl: `https://github.com/${item.query}.png?size=40`,
                              }}
                              sizeClass="hero-chip__avatar"
                              textSizeClass="text-[0.55rem]"
                            />
                            <span>{item.query}</span>
                          </button>
                        ))
                      ) : (
                        <span className="hero-meta-empty">No searches yet</span>
                      )}
                    </div>
                  </div>

                  <div className="hero-meta-card hero-meta-card--accent">
                    <div className="hero-meta-card__eyebrow">Trending users</div>
                    <div className="hero-meta-card__header">Start with the community's favorite profiles.</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {TRENDING_USERS.map((item) => (
                        <button
                          key={`trend-${item}`}
                          type="button"
                          onClick={() => analyzeProfile(item)}
                          className="hero-chip hero-chip--trend"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="landing-proof-grid mt-5 grid gap-3 text-left md:grid-cols-3">
                  <div className="landing-proof-card">
                    <div className="landing-proof-card__value"><span className="landing-proof-card__icon">⚡</span>100+</div>
                    <div className="landing-proof-card__label">Public repos processed per profile</div>
                  </div>
                  <div className="landing-proof-card">
                    <div className="landing-proof-card__value"><span className="landing-proof-card__icon">📊</span>3 clicks</div>
                    <div className="landing-proof-card__label">From search to decision-ready insights</div>
                  </div>
                  <div className="landing-proof-card">
                    <div className="landing-proof-card__value"><span className="landing-proof-card__icon">🤖</span>AI + Data</div>
                    <div className="landing-proof-card__label">Balanced output for developers and hiring teams</div>
                  </div>
                </div>

                <div className="landing-flow mt-7 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left md:p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Why use this?</div>
                  <div className="landing-flow-grid mt-3 grid gap-3 md:grid-cols-3">
                    <article className="landing-flow-card" style={{ "--flow-delay": "0ms" }}>
                      <h3 className="landing-flow-card__title">🚀 Get instant GitHub insights</h3>
                      <p className="landing-flow-card__copy">Profile score, trends, and top repos in seconds.</p>
                    </article>
                    <article className="landing-flow-card" style={{ "--flow-delay": "120ms" }}>
                      <h3 className="landing-flow-card__title">📊 Understand developer strengths</h3>
                      <p className="landing-flow-card__copy">See what someone is best at without digging through everything.</p>
                    </article>
                    <article className="landing-flow-card" style={{ "--flow-delay": "240ms" }}>
                      <h3 className="landing-flow-card__title">🧠 AI-powered recommendations</h3>
                      <p className="landing-flow-card__copy">Actionable suggestions you can use right away.</p>
                    </article>
                  </div>
                </div>
              </div>

            </div>
          </section>
        )}

        {!isResultView && showLoginPage && (
          <section id="login-section" className="hero-panel relative overflow-hidden rounded-4xl px-4 py-8 md:px-8 md:py-10">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-orb hero-orb--left" aria-hidden="true" />
            <div className="hero-orb hero-orb--right" aria-hidden="true" />

            <div className="login-shell relative z-10 mx-auto grid w-full max-w-4xl gap-4 lg:grid-cols-[0.95fr_1.4fr]">
              <div className="login-brand rounded-3xl border border-white/10 p-6 md:p-7">
                <div className="login-brand__badge inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-200">
                  Secure OAuth Access
                </div>
                <h2 className="login-brand__title mt-4 text-2xl font-bold text-white md:text-3xl">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-300 md:text-base">
                  Sign in once and get a faster, personalized analysis experience.
                </p>
                <p className="mt-5 text-xs text-slate-400">
                  Your account is used only for authentication and personalized dashboard actions.
                </p>
              </div>

              <div className="login-card rounded-3xl border border-white/10 p-4 md:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Choose a sign-in provider</div>
                  </div>
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
                      <div className="login-provider__head flex items-center gap-3">
                        <div className="flex items-center gap-3">
                          <span className="login-provider__icon" aria-hidden="true">
                            {provider.key === "github" ? (
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.48 0-.24-.01-.88-.02-1.72-2.78.62-3.37-1.38-3.37-1.38-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.15-4.56-5.12 0-1.13.39-2.06 1.03-2.79-.1-.27-.45-1.34.1-2.78 0 0 .84-.27 2.75 1.06A9.3 9.3 0 0 1 12 6.85c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.06 2.75-1.06.55 1.44.2 2.51.1 2.78.64.73 1.03 1.66 1.03 2.79 0 3.98-2.34 4.86-4.57 5.11.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.48A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M21.35 12.24c0-.78-.07-1.53-.2-2.24H12v4.24h5.24a4.48 4.48 0 0 1-1.95 2.94v2.45h3.16c1.85-1.7 2.9-4.2 2.9-7.39Z" fill="#4285F4" />
                                <path d="M12 21.7c2.62 0 4.82-.87 6.42-2.37l-3.16-2.45c-.87.58-1.99.92-3.26.92-2.5 0-4.61-1.68-5.37-3.93H3.36v2.53A9.7 9.7 0 0 0 12 21.7Z" fill="#34A853" />
                                <path d="M6.63 13.87a5.78 5.78 0 0 1 0-3.74V7.6H3.36a9.7 9.7 0 0 0 0 8.8l3.27-2.53Z" fill="#FBBC05" />
                                <path d="M12 6.2c1.43 0 2.7.5 3.7 1.45l2.78-2.78A9.29 9.29 0 0 0 12 2.3a9.7 9.7 0 0 0-8.64 5.3l3.27 2.53C7.39 7.88 9.5 6.2 12 6.2Z" fill="#EA4335" />
                              </svg>
                            )}
                          </span>
                          <div className="text-base font-semibold text-white">{provider.label}</div>
                        </div>
                      </div>
                      <div className="mt-1 pl-5 text-sm text-slate-400">{provider.subtitle}</div>
                    </button>
                  ))}
                </div>

                {!oauthConfig.github && !oauthConfig.google && (
                  <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                    OAuth is not configured on the backend yet. Add your client IDs and secrets in <span className="font-semibold">backend/.env</span>, then restart the backend.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {isHistoryView && history.length > 0 && (
          <div id="history-section" className="history-panel mx-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-gray-200">
                  Recent searches
                </h3>
                <span className="text-xs text-gray-500">Only your account searches are shown here</span>
              </div>

              <button
                onClick={() => setShowHistory(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 md:self-start"
              >
                Back to Home
              </button>
            </div>

            <div className="history-grid grid gap-3 md:grid-cols-2">
              {history.map((item) => (
                <button
                  key={item.query}
                  type="button"
                  onClick={() => {
                    setUsername(item.query);
                    analyzeProfile(item.query);
                  }}
                  className="history-card group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-fuchsia-400/30 hover:bg-white/10"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      user={{
                        login: item.query,
                        name: item.query,
                        avatarUrl: `https://github.com/${item.query}.png?size=48`,
                      }}
                      sizeClass="history-card__avatar h-11 w-11"
                      textSizeClass="text-[0.65rem]"
                    />
                    <div className="min-w-0">
                        <div className="truncate text-base font-bold tracking-tight text-slate-900">
                        {item.query}
                      </div>
                      <div className="text-xs text-slate-500">
                        Searched {formatHistoryDate(item.searchedAt)}
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        From your account history
                      </div>
                    </div>
                  </div>

                  <span className="history-card__action rounded-full border border-white/10 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 transition group-hover:bg-white group-hover:text-slate-900">
                    Search again
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isHistoryView && history.length === 0 && (
          <div id="history-section" className="history-panel mx-auto w-full max-w-5xl rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-gray-400">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-200">No searches saved yet</div>
                <div className="text-xs text-slate-500">Search a profile while signed in and it will appear here.</div>
              </div>
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

      {isHomeRoute && profile && (
        <div id="dashboard-section" ref={resultSectionRef} className="mt-8 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
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
                className="view-github-btn inline-flex w-fit items-center rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                View GitHub Profile
              </a>
            </div>

            <p className="mt-4 text-sm text-slate-300">{profile.bio || "No bio provided."}</p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
              {profile.location && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">📍 {profile.location}</span>
              )}
              {profile.company && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">🏢 {profile.company}</span>
              )}
              {profile.blog && (
                <a
                  href={profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-cyan-200 hover:bg-cyan-500/20"
                >
                  🔗 Portfolio
                </a>
              )}
              {profile.public_gists !== undefined && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Public gists: {profile.public_gists}</span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Joined: {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            <div className="stat-card stat-card--score rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p className="text-sm text-slate-300">Developer Score</p>
              <div
                className="score-ring mt-4"
                style={{
                  "--score-angle": `${Math.min(score, 100) * 3.6}deg`,
                  "--score-color": scoreTone.color,
                }}
              >
                <div className="score-ring__inner">
                  <div className="text-3xl font-bold text-white">{score}</div>
                  <div className={`text-xs font-semibold ${scoreTone.textClass}`}>{scoreTone.label}</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">{level}</p>
            </div>

            <div className="stat-card stat-card--repos rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p className="text-sm text-slate-300">📦 Repositories</p>
              <h2 className="text-3xl">{repos.length}</h2>
              <p className="mt-1 text-xs text-slate-400">{filteredRepos.length} in current view</p>
            </div>

            <div className="stat-card stat-card--followers rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p className="text-sm text-slate-300">👥 Followers</p>
              <h2 className="text-3xl">{profile.followers}</h2>
            </div>

            <div className="stat-card stat-card--stars rounded-2xl border border-white/10 bg-[#0f172a]/60 p-6">
              <p className="text-sm text-slate-300">⭐ Total Stars</p>
              <h2 className="text-3xl">
                {repos.reduce((a, r) => a + r.stargazers_count, 0)}
              </h2>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-4 md:p-5">
            <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_auto_auto]">
              <input
                value={repoSearchQuery}
                onChange={(event) => setRepoSearchQuery(event.target.value)}
                placeholder="Search repos by name or description"
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-400/45"
              />

              <select
                value={selectedLanguage}
                onChange={(event) => setSelectedLanguage(event.target.value)}
                className="repo-filter-select h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none focus:border-fuchsia-400/45"
              >
                <option value="all">All languages</option>
                {availableLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>

              <select
                value={repoSortBy}
                onChange={(event) => setRepoSortBy(event.target.value)}
                className="repo-filter-select h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none focus:border-fuchsia-400/45"
              >
                <option value="stars_desc">Sort: Stars (high to low)</option>
                <option value="updated_desc">Sort: Recently updated</option>
                <option value="forks_desc">Sort: Forks (high to low)</option>
                <option value="name_asc">Sort: Name (A-Z)</option>
              </select>

              <button
                type="button"
                onClick={handleExportReposCsv}
                disabled={filteredRepos.length === 0 || !canExportCsv}
                className="h-11 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {canExportCsv ? "Export CSV" : "Pro/Team only"}
              </button>

              <button
                type="button"
                onClick={handleExportResumePdf}
                disabled={!canUseProFeatures || !profile}
                className="h-11 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {canUseProFeatures ? "Export Resume (PDF)" : "Pro/Team only"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={includeForkRepos}
                  onChange={(event) => setIncludeForkRepos(event.target.checked)}
                />
                Include forked repositories
              </label>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Avg stars: {averageStars.toFixed(1)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Fork ratio: {forkRatio.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-fuchsia-400/20 bg-[#10172a]/90 p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">AI Insights</h2>
              {canUseProFeatures ? (
                <div className="space-y-2">
                  {aiInsights.map((insight) => (
                    <div key={insight} className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-200">
                      {insight}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-4 text-sm text-fuchsia-100">
                  <div className="font-semibold">Locked for Free Plan</div>
                  <p className="mt-1 text-fuchsia-100/85">Upgrade to Pro to unlock AI-powered insights and resume export.</p>
                  <button
                    type="button"
                    onClick={() => navigate("/pricing")}
                    className="mt-3 rounded-lg border border-fuchsia-300/30 bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-fuchsia-500/30"
                  >
                    View Pro Plan
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-[#0d1a2b]/90 p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Top Repositories</h2>
              <div className="space-y-2">
                {topRepos.map((repo) => (
                  <a
                    key={repo.id}
                    href={repo.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="top-repo-row flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:bg-white/10"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">{repo.name}</div>
                      <div className="text-xs text-slate-400">{repo.language || "Unknown"}</div>
                    </div>
                    <div className="ml-3 text-xs text-amber-200">⭐ {repo.stargazers_count}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-[#0d1f1a]/85 p-6">
            <h2 className="mb-3 text-lg font-semibold text-white">Team Dashboards</h2>
            {canUseTeamDashboards ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-emerald-200">Comparison</div>
                  <div className="mt-1 text-2xl font-bold text-white">{Math.max(1, Math.round(score / 20))}/5</div>
                  <p className="mt-1 text-xs text-slate-300">Team percentile bucket</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-emerald-200">Collaboration</div>
                  <div className="mt-1 text-2xl font-bold text-white">{Math.max(1, Math.round((profile.followers || 0) / 25))}</div>
                  <p className="mt-1 text-xs text-slate-300">Cross-profile interaction signal</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-emerald-200">Activity Index</div>
                  <div className="mt-1 text-2xl font-bold text-white">{Math.min(100, Math.round((100 - forkRatio) + averageStars))}</div>
                  <p className="mt-1 text-xs text-slate-300">Shared dashboard momentum score</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                <div className="font-semibold">Team feature locked</div>
                <p className="mt-1 text-emerald-100/85">Upgrade to Team for multi-user dashboards, collaboration analytics, and team comparisons.</p>
                <button
                  type="button"
                  onClick={() => navigate("/pricing")}
                  className="mt-3 rounded-lg border border-emerald-300/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500/30"
                >
                  View Team Plan
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
              <h2 className="mb-4">Languages</h2>
              <LanguageChart repos={repos} languageData={languageData} theme={theme} />
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
              <RadarChartBox repos={repos} theme={theme} />
            </div>

            <div className="col-span-2 rounded-2xl border border-white/10 bg-[#0f172a]/80 p-6">
              <h2 className="mb-4">Activity</h2>
              <ActivityChart theme={theme} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}