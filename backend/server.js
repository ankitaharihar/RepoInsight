const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");

const app = express();
const PORT = process.env.PORT || 5000;

if (process.env.MONGO_URI) {
  if (mongoose.connection.readyState === 0) {
    mongoose
      .connect(process.env.MONGO_URI)
      .then(() => console.log("MongoDB Connected"))
      .catch((err) => console.error("Mongo Error:", err));
  }
} else {
  console.warn("MONGO_URI not set. Skipping MongoDB connection.");
}

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const BASE_URL = "https://api.github.com";
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const GITHUB_CLIENT_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) {
  GITHUB_CLIENT_HEADERS.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
} else {
  console.warn("GITHUB_TOKEN is not configured. GitHub API rate limits may be reached quickly.");
}

const githubClient = axios.create({
  baseURL: BASE_URL,
  headers: GITHUB_CLIENT_HEADERS,
});

const githubCache = new Map();
const inMemorySubscriptions = new Map();

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    plan: { type: String, default: "free" },
    status: { type: String, default: "active" },
    startedAt: { type: String },
    updatedAt: { type: String },
    stripeCustomerId: { type: String, default: null, index: true },
    stripeSubscriptionId: { type: String, default: null },
    currentPeriodEnd: { type: String, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { versionKey: false }
);

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
const AVAILABLE_PLANS = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    features: [
      "Profile score and repository insights",
      "Recent search history",
      "Basic charts and language breakdown",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 12,
    features: [
      "Advanced filters and smart sorting",
      "CSV export and richer analytics views",
      "Priority API performance",
    ],
  },
  {
    id: "team",
    name: "Team",
    priceMonthly: 39,
    features: [
      "Shared dashboards and saved views",
      "Role-based access controls",
      "Team activity summaries",
    ],
  },
];
const STRIPE_PRICE_BY_PLAN = {
  pro: process.env.STRIPE_PRICE_PRO_MONTHLY,
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY,
};
const PLAN_BY_STRIPE_PRICE = Object.entries(STRIPE_PRICE_BY_PLAN).reduce((acc, [planId, priceId]) => {
  if (priceId) acc[priceId] = planId;
  return acc;
}, {});

const canUseMongoSubscriptions = () => Boolean(process.env.MONGO_URI) && mongoose.connection.readyState === 1;

const toSubscriptionPayload = (previous, partialSubscription) => ({
  plan: previous?.plan || "free",
  status: previous?.status || "active",
  startedAt: previous?.startedAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...previous,
  ...partialSubscription,
});

const stripUserId = (record) => {
  if (!record) return null;
  const { userId, ...rest } = record;
  return rest;
};

const upsertSubscription = async (userId, partialSubscription) => {
  if (canUseMongoSubscriptions()) {
    const previous = await Subscription.findOne({ userId }).lean();
    const payload = toSubscriptionPayload(previous, partialSubscription);
    const updated = await Subscription.findOneAndUpdate(
      { userId },
      { userId, ...payload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return stripUserId(updated);
  }

  const previous = inMemorySubscriptions.get(userId) || null;
  const payload = toSubscriptionPayload(previous, partialSubscription);
  inMemorySubscriptions.set(userId, payload);
  return payload;
};

const getSubscriptionByUserId = async (userId) => {
  if (canUseMongoSubscriptions()) {
    const subscription = await Subscription.findOne({ userId }).lean();
    return stripUserId(subscription);
  }

  return inMemorySubscriptions.get(userId) || null;
};

const getUserIdByStripeCustomerId = async (stripeCustomerId) => {
  if (!stripeCustomerId) return null;

  if (canUseMongoSubscriptions()) {
    const subscription = await Subscription.findOne({ stripeCustomerId }).select({ userId: 1, _id: 0 }).lean();
    return subscription?.userId || null;
  }

  return (
    [...inMemorySubscriptions.entries()].find(([, value]) => value?.stripeCustomerId === stripeCustomerId)?.[0] ||
    null
  );
};

const buildStripeSubscriptionSnapshot = (stripeSubscription, fallbackPlan = "free") => {
  const activePriceId = stripeSubscription?.items?.data?.[0]?.price?.id;
  const mappedPlan = PLAN_BY_STRIPE_PRICE[activePriceId] || fallbackPlan;

  return {
    plan: mappedPlan,
    status: stripeSubscription?.status || "active",
    stripeCustomerId: stripeSubscription?.customer ? String(stripeSubscription.customer) : undefined,
    stripeSubscriptionId: stripeSubscription?.id ? String(stripeSubscription.id) : undefined,
    currentPeriodEnd: stripeSubscription?.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: Boolean(stripeSubscription?.cancel_at_period_end),
  };
};

const readAuthUserFromCookie = (req) => {
  const rawCookie = req.cookies?.oauth_user;
  if (!rawCookie) return null;

  try {
    return JSON.parse(rawCookie);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(rawCookie));
    } catch {
      return null;
    }
  }
};

const requireAuthUser = (req, res, next) => {
  const user = readAuthUserFromCookie(req);

  if (!user?.id) {
    return res.status(401).json({ message: "Authentication required" });
  }

  req.authUser = user;
  return next();
};

const getCachedValue = (key) => {
  const entry = githubCache.get(key);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    githubCache.delete(key);
    return null;
  }

  return entry.value;
};

const setCachedValue = (key, value, ttlMs) => {
  githubCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
};

const parseBoundedNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

const getGitHubCallbackUrl = (req) => {
  const configuredCallbackUrl = normalizeBaseUrl(process.env.GITHUB_CALLBACK_URL);

  if (configuredCallbackUrl) {
    return configuredCallbackUrl;
  }

  return `${getBackendBaseUrl(req)}/auth/github/callback`;
};

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use((req, res, next) => {
  if (req.originalUrl === "/api/billing/stripe/webhook") {
    return next();
  }

  return express.json()(req, res, next);
});
app.use(cookieParser());

const getMailer = () => {
  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user,
      pass,
    },
  });
};

const getPrimaryEmail = (emails = []) => {
  const primary = emails.find((entry) => entry.primary && entry.verified);
  return primary?.email || emails.find((entry) => entry.verified)?.email || "";
};

const sendLoginEmail = async (user) => {
  if (!user.email) return false;

  const mailer = getMailer();
  if (!mailer) {
    console.warn("Email credentials are not configured. Skipping login email.");
    return false;
  }

  await mailer.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: user.email,
    subject: "You signed in to GitHub Intelligence Pro",
    text: `Hi ${user.name || user.login || "there"},\n\nA successful ${user.provider} login was detected for your GitHub Intelligence Pro session.\n\nIf this was not you, please review your account activity.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin:0 0 12px">Login successful</h2>
        <p>Hi ${user.name || user.login || "there"},</p>
        <p>A successful <strong>${user.provider}</strong> login was detected for your GitHub Intelligence Pro session.</p>
        <p>If this was not you, please review your account activity.</p>
      </div>
    `,
  });

  return true;
};

const storeAuthUser = (res, user) => {
  res.cookie("oauth_user", JSON.stringify(user), {
    ...COOKIE_OPTIONS,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
};

const makeStateCookie = (provider) => `${provider}_oauth_state`;

const buildState = () => crypto.randomBytes(16).toString("hex");

const requireOAuthConfig = (provider, res) => {
  const requiredKeys = {
    github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  };

  const missing = (requiredKeys[provider] || []).filter((key) => !process.env[key]);

  if (missing.length > 0) {
    redirectToFrontend(res, { login_error: `${provider}_config_missing` });
    return false;
  }

  return true;
};

const getOAuthConfigStatus = () => ({
  github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
});

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const getBackendBaseUrl = (req) => {
  const configuredBaseUrl = normalizeBaseUrl(process.env.BACKEND_URL);
  if (configuredBaseUrl) return configuredBaseUrl;

  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProtoHeader === "string"
      ? forwardedProtoHeader.split(",")[0].trim()
      : req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host");

  if (host) {
    return `${proto}://${host}`;
  }

  return `http://localhost:${PORT}`;
};

const redirectToFrontend = (res, query = {}) => {
  const url = new URL(FRONTEND_URL);
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return res.redirect(url.toString());
};

const forwardGitHubError = (res, error, fallbackMessage) => {
  const status = error.response?.status || 500;
  const message = error.response?.data?.message || fallbackMessage;

  return res.status(status).json({ message });
};

app.get("/auth/github", (req, res) => {
  if (!requireOAuthConfig("github", res)) return;

  const state = buildState();
  res.cookie(makeStateCookie("github"), state, {
    ...COOKIE_OPTIONS,
    httpOnly: true,
    maxAge: 1000 * 60 * 10,
  });

  const redirectUri = getGitHubCallbackUrl(req);
  const scope = encodeURIComponent("read:user user:email");

  const url =
    `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&state=${state}`;

  res.redirect(url);
});

app.get("/auth/google", (req, res) => {
  if (!requireOAuthConfig("google", res)) return;

  const state = buildState();
  res.cookie(makeStateCookie("google"), state, {
    ...COOKIE_OPTIONS,
    httpOnly: true,
    maxAge: 1000 * 60 * 10,
  });

  const redirectUri = `${getBackendBaseUrl(req)}/auth/google/callback`;
  const scope = encodeURIComponent("openid email profile");

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;

  res.redirect(url);
});

app.get("/auth/config", (req, res) => {
  res.json(getOAuthConfigStatus());
});

app.get("/api", (req, res) => {
  return res.json({ ok: true, message: "API running" });
});

app.get("/auth/github/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const storedState = req.cookies[makeStateCookie("github")];

    res.clearCookie(makeStateCookie("github"), COOKIE_OPTIONS);

    if (error) {
      return redirectToFrontend(res, { login_error: String(error) });
    }

    if (!code || !state || !storedState || state !== storedState) {
      return redirectToFrontend(res, { login_error: "github_state_mismatch" });
    }

    const redirectUri = getGitHubCallbackUrl(req);
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        state,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      return redirectToFrontend(res, { login_error: "github_token_missing" });
    }

    const profileResponse = await axios.get(`${BASE_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    const emailResponse = await axios.get(`${BASE_URL}/user/emails`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    const profile = profileResponse.data;
    const user = {
      provider: "github",
      id: String(profile.id),
      login: profile.login,
      name: profile.name || profile.login,
      email: getPrimaryEmail(emailResponse.data),
      avatarUrl: profile.avatar_url,
    };

    await upsertSubscription(user.id, {
      plan: (await getSubscriptionByUserId(user.id))?.plan || "free",
      status: "active",
    });
    await sendLoginEmail(user);
    storeAuthUser(res, user);

    return redirectToFrontend(res, { login_success: "github" });
  } catch (err) {
    console.error("GitHub auth callback error:", err);
    return redirectToFrontend(res, { login_error: "github_callback_failed" });
  }
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const storedState = req.cookies[makeStateCookie("google")];

    res.clearCookie(makeStateCookie("google"), COOKIE_OPTIONS);

    if (error) {
      return redirectToFrontend(res, { login_error: String(error) });
    }

    if (!code || !state || !storedState || state !== storedState) {
      return redirectToFrontend(res, { login_error: "google_state_mismatch" });
    }

    const redirectUri = `${getBackendBaseUrl(req)}/auth/google/callback`;
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      return redirectToFrontend(res, { login_error: "google_token_missing" });
    }

    const profileResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const profile = profileResponse.data;
    const user = {
      provider: "google",
      id: String(profile.id),
      login: profile.email?.split("@")[0] || profile.name || "google-user",
      name: profile.name || profile.email,
      email: profile.email,
      avatarUrl: profile.picture,
    };

    await upsertSubscription(user.id, {
      plan: (await getSubscriptionByUserId(user.id))?.plan || "free",
      status: "active",
    });
    await sendLoginEmail(user);
    storeAuthUser(res, user);

    return redirectToFrontend(res, { login_success: "google" });
  } catch (err) {
    console.error("Google auth callback error:", err);
    return redirectToFrontend(res, { login_error: "google_callback_failed" });
  }
});

app.get("/api/github/search/users", async (req, res) => {
  try {
    const { q, per_page = 8 } = req.query;
    const normalizedQuery = String(q || "").trim();
    const cacheKey = `search:${normalizedQuery}:${per_page}`;

    const cached = getCachedValue(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    if (!normalizedQuery) {
      return res.status(400).json({ message: "Query required" });
    }

    const response = await githubClient.get("/search/users", {
      params: {
        q: normalizedQuery,
        per_page,
      },
    });

    setCachedValue(cacheKey, response.data, 2 * 60 * 1000);

    return res.json(response.data);
  } catch (error) {
    return forwardGitHubError(res, error, "Failed to search users");
  }
});

app.get("/api/user", async (req, res) => {
  try {
    const { q, per_page = 8 } = req.query;
    const normalizedQuery = String(q || "").trim();
    const cacheKey = `search:${normalizedQuery}:${per_page}`;

    const cached = getCachedValue(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    if (!normalizedQuery) {
      return res.status(400).json({ message: "Query required", items: [] });
    }

    const response = await githubClient.get("/search/users", {
      params: {
        q: normalizedQuery,
        per_page,
      },
    });

    setCachedValue(cacheKey, response.data, 2 * 60 * 1000);

    return res.json(response.data);
  } catch (error) {
    return forwardGitHubError(res, error, "Failed to search users");
  }
});

app.get("/api/github", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const cacheKey = `profile:${username}`;

    if (!username) {
      return res.status(400).json({ message: "Username required" });
    }

    const cached = getCachedValue(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const response = await githubClient.get(`/users/${username}`);

    setCachedValue(cacheKey, response.data, 5 * 60 * 1000);

    return res.json(response.data);
  } catch (error) {
    return forwardGitHubError(res, error, "User not found");
  }
});

app.get("/api/repos", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const page = Number(req.query.page || 1);
    const per_page = Number(req.query.per_page || 10);
    const cacheKey = `repos:${username}:${page}:${per_page}`;

    if (!username) {
      return res.status(400).json({ message: "Username required" });
    }

    const cached = getCachedValue(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const response = await githubClient.get(`/users/${username}/repos`, {
      params: {
        page,
        per_page,
        sort: "updated",
      },
    });

    const payload = {
      data: response.data,
      pagination: {
        has_prev: page > 1,
        has_next: response.data.length === Number(per_page),
        total_pages: page + 1,
      },
    };

    setCachedValue(cacheKey, payload, 5 * 60 * 1000);

    return res.json(payload);
  } catch (error) {
    return forwardGitHubError(res, error, "Failed to fetch repos");
  }
});

app.get("/api/github/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `profile:${username}`;
    const cached = getCachedValue(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const response = await githubClient.get(`/users/${username}`);

    setCachedValue(cacheKey, response.data, 5 * 60 * 1000);

    return res.json(response.data);
  } catch (error) {
    return forwardGitHubError(res, error, "User not found");
  }
});

app.get("/api/github/:username/repos", async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, per_page = 10 } = req.query;
    const cacheKey = `repos:${username}:${page}:${per_page}`;
    const cached = getCachedValue(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const response = await githubClient.get(`/users/${username}/repos`, {
      params: {
        page,
        per_page,
        sort: "updated",
      },
    });

    const payload = {
      data: response.data,
      pagination: {
        has_prev: page > 1,
        has_next: response.data.length === Number(per_page),
        total_pages: page + 1,
      },
    };

    setCachedValue(cacheKey, payload, 5 * 60 * 1000);

    return res.json(payload);
  } catch (error) {
    return forwardGitHubError(res, error, "Failed to fetch repos");
  }
});

app.get("/api/github/:username/activity", async (req, res) => {
  try {
    const { username } = req.params;
    const days = Math.min(Math.max(Number(req.query.days || 30), 7), 90);
    const cacheKey = `activity:${username}:${days}`;
    const cached = getCachedValue(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const response = await githubClient.get(`/users/${username}/events/public`, {
      params: { per_page: 100 },
    });

    const start = Date.now() - days * 24 * 60 * 60 * 1000;
    const events = response.data.filter((event) => new Date(event.created_at).getTime() >= start);

    const labels = Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - index));
      return date.toISOString().slice(0, 10);
    });

    const seriesMap = Object.fromEntries(labels.map((label) => [label, 0]));

    events.forEach((event) => {
      const key = new Date(event.created_at).toISOString().slice(0, 10);
      if (seriesMap[key] === undefined) return;

      if (event.type === "PushEvent") {
        const commits = Array.isArray(event.payload?.commits) ? event.payload.commits.length : 1;
        seriesMap[key] += commits;
      } else {
        seriesMap[key] += 1;
      }
    });

    const payload = {
      days,
      totalCommits: events.reduce(
        (acc, event) => acc + (event.type === "PushEvent" ? (event.payload?.commits?.length || 1) : 0),
        0
      ),
      events,
      series: labels.map((label) => ({
        day: label.slice(5),
        commits: seriesMap[label],
      })),
    };

    setCachedValue(cacheKey, payload, 2 * 60 * 1000);

    return res.json(payload);
  } catch (error) {
    return forwardGitHubError(res, error, "Failed to fetch activity");
  }
});

app.get("/api/github/:username/languages", async (req, res) => {
  try {
    const { username } = req.params;
    const cacheKey = `languages:${username}`;
    const cached = getCachedValue(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const repos = await githubClient.get(`/users/${username}/repos`);
    const langStats = {};

    for (let repo of repos.data) {
      if (repo.language) {
        langStats[repo.language] =
          (langStats[repo.language] || 0) + 1;
      }
    }

    setCachedValue(cacheKey, langStats, 10 * 60 * 1000);

    return res.json(langStats);
  } catch (error) {
    return forwardGitHubError(res, error, "Failed to fetch languages");
  }
});

app.get("/api/github/:username/insights", async (req, res) => {
  try {
    const { username } = req.params;
    const windowDays = parseBoundedNumber(req.query.window_days, 30, 7, 365);
    const top = parseBoundedNumber(req.query.top, 5, 1, 20);
    const cacheKey = `insights:${username}:${windowDays}:${top}`;
    const cached = getCachedValue(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const response = await githubClient.get(`/users/${username}/repos`, {
      params: {
        per_page: 100,
        sort: "updated",
      },
    });

    const repos = Array.isArray(response.data) ? response.data : [];
    const now = Date.now();
    const windowStart = now - windowDays * 24 * 60 * 60 * 1000;

    const totals = repos.reduce(
      (acc, repo) => {
        acc.stars += repo.stargazers_count || 0;
        acc.forks += repo.forks_count || 0;
        acc.watchers += repo.watchers_count || 0;
        acc.openIssues += repo.open_issues_count || 0;
        return acc;
      },
      {
        repositories: repos.length,
        stars: 0,
        forks: 0,
        watchers: 0,
        openIssues: 0,
      }
    );

    const recent = repos.reduce(
      (acc, repo) => {
        const pushedAt = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
        const updatedAt = repo.updated_at ? new Date(repo.updated_at).getTime() : 0;

        if (pushedAt >= windowStart) acc.pushedInWindow += 1;
        if (updatedAt >= windowStart) acc.updatedInWindow += 1;

        return acc;
      },
      {
        windowDays,
        pushedInWindow: 0,
        updatedInWindow: 0,
      }
    );

    const languageMap = repos.reduce((acc, repo) => {
      if (!repo.language) return acc;

      if (!acc[repo.language]) {
        acc[repo.language] = {
          repos: 0,
          stars: 0,
        };
      }

      acc[repo.language].repos += 1;
      acc[repo.language].stars += repo.stargazers_count || 0;
      return acc;
    }, {});

    const languageBreakdown = Object.entries(languageMap)
      .map(([language, stats]) => ({
        language,
        repos: stats.repos,
        stars: stats.stars,
      }))
      .sort((a, b) => (b.repos - a.repos) || (b.stars - a.stars));

    const topStarredRepos = [...repos]
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
      .slice(0, top)
      .map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        updatedAt: repo.updated_at,
        url: repo.html_url,
      }));

    const payload = {
      username,
      totals,
      recent,
      languageBreakdown,
      topStarredRepos,
    };

    setCachedValue(cacheKey, payload, 5 * 60 * 1000);
    return res.json(payload);
  } catch (error) {
    return forwardGitHubError(res, error, "Failed to fetch user insights");
  }
});

app.get("/api/billing/plans", (req, res) => {
  return res.json({ plans: AVAILABLE_PLANS });
});

app.get("/api/billing/subscription", requireAuthUser, async (req, res) => {
  const existing = await getSubscriptionByUserId(req.authUser.id);
  const subscription = existing || (await upsertSubscription(req.authUser.id, { plan: "free", status: "active" }));

  return res.json({
    subscription,
    plan: AVAILABLE_PLANS.find((item) => item.id === subscription.plan) || AVAILABLE_PLANS[0],
  });
});

app.post("/api/billing/subscription", requireAuthUser, async (req, res) => {
  const nextPlan = String(req.body?.plan || "").toLowerCase();
  const isValidPlan = AVAILABLE_PLANS.some((plan) => plan.id === nextPlan);

  if (!isValidPlan) {
    return res.status(400).json({ message: "Invalid plan selected" });
  }

  if (nextPlan !== "free") {
    return res.status(402).json({ message: "Paid plans require Stripe checkout" });
  }

  const subscription = await upsertSubscription(req.authUser.id, {
    plan: nextPlan,
    status: "active",
    startedAt: new Date().toISOString(),
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });

  return res.json({
    message: `Plan updated to ${nextPlan}`,
    subscription,
    plan: AVAILABLE_PLANS.find((item) => item.id === nextPlan),
  });
});

app.post("/api/billing/checkout-session", requireAuthUser, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ message: "Stripe is not configured on the backend" });
  }

  const selectedPlan = String(req.body?.plan || "").toLowerCase();

  if (!["pro", "team"].includes(selectedPlan)) {
    return res.status(400).json({ message: "Checkout is supported for pro/team plans only" });
  }

  const priceId = STRIPE_PRICE_BY_PLAN[selectedPlan];
  if (!priceId) {
    return res.status(500).json({ message: `Missing Stripe price ID for ${selectedPlan}` });
  }

  const existingSubscription = await getSubscriptionByUserId(req.authUser.id);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: existingSubscription?.stripeCustomerId || undefined,
    customer_email: existingSubscription?.stripeCustomerId ? undefined : req.authUser.email || undefined,
    success_url: `${FRONTEND_URL}/pricing?checkout=success`,
    cancel_url: `${FRONTEND_URL}/pricing?checkout=cancel`,
    metadata: {
      userId: req.authUser.id,
      plan: selectedPlan,
    },
    subscription_data: {
      metadata: {
        userId: req.authUser.id,
        plan: selectedPlan,
      },
    },
  });

  await upsertSubscription(req.authUser.id, {
    checkoutSessionId: session.id,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : existingSubscription?.stripeCustomerId,
    updatedAt: new Date().toISOString(),
  });

  return res.json({ id: session.id, url: session.url });
});

app.post("/api/billing/subscription/cancel", requireAuthUser, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ message: "Stripe is not configured on the backend" });
  }

  const existing = await getSubscriptionByUserId(req.authUser.id);
  if (!existing?.stripeSubscriptionId) {
    return res.status(400).json({ message: "No active paid subscription found" });
  }

  const stripeSubscription = await stripe.subscriptions.update(existing.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  const subscription = await upsertSubscription(
    req.authUser.id,
    buildStripeSubscriptionSnapshot(stripeSubscription, existing.plan || "pro")
  );

  return res.json({ message: "Subscription will cancel at period end", subscription });
});

app.post("/api/billing/subscription/resume", requireAuthUser, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ message: "Stripe is not configured on the backend" });
  }

  const existing = await getSubscriptionByUserId(req.authUser.id);
  if (!existing?.stripeSubscriptionId) {
    return res.status(400).json({ message: "No active paid subscription found" });
  }

  const stripeSubscription = await stripe.subscriptions.update(existing.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  const subscription = await upsertSubscription(
    req.authUser.id,
    buildStripeSubscriptionSnapshot(stripeSubscription, existing.plan || "pro")
  );

  return res.json({ message: "Subscription renewal resumed", subscription });
});

app.post("/api/billing/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ message: "Stripe webhook is not configured" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ message: "Missing stripe signature" });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).json({ message: `Webhook signature verification failed: ${error.message}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;

      if (userId) {
        const partial = {
          stripeCustomerId: session.customer ? String(session.customer) : undefined,
          stripeSubscriptionId: session.subscription ? String(session.subscription) : undefined,
          status: "active",
        };

        if (session.subscription) {
          const stripeSubscription = await stripe.subscriptions.retrieve(String(session.subscription));
          Object.assign(partial, buildStripeSubscriptionSnapshot(stripeSubscription, session.metadata?.plan || "pro"));
        }

        await upsertSubscription(userId, partial);
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const stripeSubscription = event.data.object;
      const userId = stripeSubscription.metadata?.userId || (await getUserIdByStripeCustomerId(String(stripeSubscription.customer)));

      if (userId) {
        await upsertSubscription(userId, buildStripeSubscriptionSnapshot(stripeSubscription, "pro"));
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const stripeSubscription = event.data.object;
      const userId = stripeSubscription.metadata?.userId || (await getUserIdByStripeCustomerId(String(stripeSubscription.customer)));

      if (userId) {
        await upsertSubscription(userId, {
          ...buildStripeSubscriptionSnapshot(stripeSubscription, "free"),
          plan: "free",
          status: "canceled",
          stripeSubscriptionId: null,
          cancelAtPeriodEnd: false,
        });
      }
    }

    return res.json({ received: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to process webhook event" });
  }
});

if (require.main === module && process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;