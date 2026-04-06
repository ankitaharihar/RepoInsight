import { useState } from "react";
import axios from "axios";

import {
  LanguageChart,
  RadarChartBox,
  ActivityChart
} from "./components/Charts";

// 🔥 Developer Score
const calculateScore = (profile, repos) => {
  if (!profile || !repos) return 0;

  const repoCount = repos.length;
  const stars = repos.reduce((acc, r) => acc + r.stargazers_count, 0);
  const followers = profile.followers || 0;

  const recentRepos = repos.filter(repo => {
    const lastUpdate = new Date(repo.updated_at);
    const diffDays = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
    return diffDays < 30;
  }).length;

  const readmeScore = repos.filter(r =>
    r.name.toLowerCase().includes("readme")
  ).length;

  let score =
    Math.min(repoCount * 1.5, 25) +
    Math.min(stars * 2, 25) +
    Math.min(followers * 3, 15) +
    Math.min(recentRepos * 2, 20) +
    Math.min(readmeScore * 2, 15);

  return Math.round(score);
};

const getLevel = (score) => {
  if (score > 80) return "🚀 Pro Developer";
  if (score > 60) return "🔥 Strong";
  if (score > 40) return "⚡ Intermediate";
  return "🌱 Beginner";
};

export default function App() {
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");

  const score = calculateScore(profile, repos);
  const level = getLevel(score);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);


  const fetchSuggestions = async (value) => {
  if (!value) {
    setSuggestions([]);
    return;
  }

  try {
    const res = await axios.get(
      `https://api.github.com/search/users?q=${value}`
    );

    setSuggestions(res.data.items.slice(0, 5)); // top 5 users
    setShowDropdown(true);
  } catch (err) {
    console.log(err);
  }
};

<input
  value={username}
  onChange={(e) => {
    setUsername(e.target.value);
    fetchSuggestions(e.target.value);
  }}
  onFocus={() => setShowDropdown(true)}
  className="..."
/>
{showDropdown && suggestions.length > 0 && (
  <div className="absolute mt-2 w-full bg-[#0f172a] border border-white/10 rounded-xl shadow-lg z-50">
    {suggestions.map((user) => (
      <div
        key={user.id}
        onClick={() => {
          setUsername(user.login);
          setShowDropdown(false);
        }}
        className="flex items-center gap-3 p-3 hover:bg-indigo-500/20 cursor-pointer"
      >
        <img
          src={user.avatar_url}
          className="w-8 h-8 rounded-full"
        />
        <p className="text-sm text-gray-300">{user.login}</p>
      </div>
    ))}
  </div>
)}
<div className="flex gap-2 mt-3 flex-wrap">
  {[
    "Frontend Dev",
    "Backend Dev",
    "React Dev",
    "ML Engineer",
    "Open Source"
  ].map((role) => (
    <button
      key={role}
      className="px-3 py-1 text-xs rounded-full 
      bg-white/5 border border-white/10 
      text-gray-300 hover:bg-indigo-500/20 hover:text-indigo-300"
    >
      {role}
    </button>
  ))}
</div>
  // 🔥 Fetch Data
  const analyzeProfile = async () => {
    if (!username) return;

    setLoading(true);
    try {
      const [profileRes, repoRes] = await Promise.all([
  axios.get(`/.netlify/functions/github?username=${username}`),
  axios.get(`https://api.github.com/users/${username}/repos?per_page=100`)
]);

      setProfile(profileRes.data);
      setRepos(repoRes.data || []);
    } catch (err) {
      console.log(err);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white px-6 py-10">

      {/* 🔥 TITLE */}
      <h1 className="text-4xl text-center font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent mb-6">
        GitHub Intelligence Pro
      </h1>

      {/* 🔍 INPUT */}
      <div className="flex justify-center gap-3 mb-10">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyzeProfile()}
          placeholder="Enter GitHub username"
          className="w-96 px-4 py-2 rounded-lg bg-[#1e293b] outline-none border border-white/10"
        />
        <button
          onClick={analyzeProfile}
          className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg"
        >
          {loading ? "Loading..." : "Analyze Profile"}
        </button>
      </div>

      {/* 🔥 PROFILE */}
      {profile && (
        <>
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0f172a]/80 to-[#1e293b]/60 border border-white/10 backdrop-blur-xl mb-8">
            <h2 className="text-2xl font-semibold">
              {profile.name || profile.login}
            </h2>
            <p className="text-gray-400">@{profile.login}</p>
            <p className="text-sm mt-2">{profile.bio}</p>
          </div>

          {/* 🔥 TABS */}
          <div className="flex gap-6 border-b border-white/10 mb-6">
            {["Overview", "Skills", "Projects", "AI Insights"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 ${
                  activeTab === tab
                    ? "text-blue-400 border-b-2 border-blue-400"
                    : "text-gray-400"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 🔥 OVERVIEW */}
          {activeTab === "Overview" && (
            <>
              {/* 🔥 SCORE + STATS */}
              <div className="grid md:grid-cols-4 gap-6 mb-6">

                {/* ⭐ DEV SCORE */}
                <div className="p-5 rounded-2xl bg-[#0f172a]/80 backdrop-blur-xl border border-white/10">

  {/* Glow Background */}
  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-2xl opacity-40"></div>

  {/* Content */}
  <div className="relative z-10 flex justify-between items-center">

    {/* LEFT */}
    <div>
      <p className="text-sm text-gray-400">Developer Score</p>

      <h1 className="text-5xl font-bold mt-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
        {score}
      </h1>

      <p className="text-sm mt-2 text-indigo-400 font-medium">
        {level}
      </p>

      <p className="text-xs text-gray-500">out of 100</p>
    </div>

    {/* RIGHT (Progress Circle) */}
    <div className="relative w-20 h-20">
      <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>

      <div
        className="absolute inset-0 rounded-full border-4 border-indigo-500 
        animate-pulse"
        style={{
          clipPath: `inset(${100 - score}% 0 0 0)`
        }}
      ></div>
    </div>

  </div>
</div>

                {/* 📦 REPOS */}
                <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
                  <p>Repositories</p>
                  <h2 className="text-3xl font-bold">{repos.length}</h2>
                </div>

                {/* 👥 FOLLOWERS */}
                <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
                  <p>Followers</p>
                  <h2 className="text-3xl font-bold">{profile.followers}</h2>
                </div>

                {/* ⭐ STARS */}
                <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
                  <p>Total Stars</p>
                  <h2 className="text-3xl font-bold">
                    {repos.reduce((acc, r) => acc + r.stargazers_count, 0)}
                  </h2>
                </div>
              </div>

              {/* 📊 CHARTS */}
              <div className="grid md:grid-cols-2 gap-6">

                {/* LANGUAGES */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0f172a]/90 to-[#1e293b]/70 
                shadow-[0_0_40px_rgba(99,102,241,0.15)] border border-white/10">
                  <h2 className="mb-4">Languages</h2>
                  <LanguageChart repos={repos} />
                </div>

                {/* SKILLS */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0f172a]/90 to-[#1e293b]/70 
                shadow-[0_0_40px_rgba(99,102,241,0.15)] border border-white/10">
                  <h2 className="mb-4">Skills</h2>
                  <RadarChartBox repos={repos} />
                </div>

                {/* ACTIVITY */}
                <div className="col-span-2 p-6 rounded-2xl bg-gradient-to-br from-[#0f172a]/90 to-[#1e293b]/70 
                shadow-[0_0_40px_rgba(99,102,241,0.15)] border border-white/10">
                  <h2 className="mb-4">Activity</h2>
                  <ActivityChart repos={repos} />
                </div>

              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}