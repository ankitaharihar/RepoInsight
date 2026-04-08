import { useState, useEffect } from "react";
import axios from "axios";

import {
  LanguageChart,
  RadarChartBox,
  ActivityChart
} from "./components/Charts";

// 🔥 SCORE
const calculateScore = (profile, repos) => {
  if (!profile || !repos) return 0;

  const repoCount = repos.length;
  const stars = repos.reduce((a, r) => a + r.stargazers_count, 0);
  const followers = profile.followers || 0;

  const recentRepos = repos.filter(r => {
    const diff =
      (Date.now() - new Date(r.updated_at)) / (1000 * 60 * 60 * 24);
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

export default function App() {
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [history, setHistory] = useState([]);

  // 🔥 LOAD HISTORY
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("history")) || [];
    setHistory(stored);
  }, []);

  // 🔍 SUGGESTIONS
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

  // 🔥 FETCH
  const analyzeProfile = async (user = username) => {
    if (!user) return;

    setLoading(true);
    setProfile(null); // 👉 old profile hide

    try {
      const [profileRes, repoRes] = await Promise.all([
        axios.get(`https://api.github.com/users/${user}`),
        axios.get(`https://api.github.com/users/${user}/repos?per_page=100`)
      ]);

      setProfile(profileRes.data);
      setRepos(repoRes.data || []);

      // 🔥 SAVE HISTORY
      let updated = [user, ...history.filter(u => u !== user)];
      updated = updated.slice(0, 5);
      setHistory(updated);
      localStorage.setItem("history", JSON.stringify(updated));

    } catch (err) {
      console.log(err);
    }

    setLoading(false);
  };

  const score = calculateScore(profile, repos);
  const level = getLevel(score);

  return (
    <div className="min-h-screen bg-[#020617] text-white px-6 py-10">

      {/* TITLE */}
      <h1 className="text-4xl text-center font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent mb-6">
        GitHub Intelligence Pro
      </h1>

      {/* SEARCH */}
      <div className="flex flex-col items-center gap-3 mb-10 relative">

        <div className="flex gap-3">
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              fetchSuggestions(e.target.value);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => e.key === "Enter" && analyzeProfile()}
            placeholder="Enter GitHub username"
            className="w-96 px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10"
          />

          <button
            onClick={() => analyzeProfile()}
            className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg"
          >
            {loading ? "Loading..." : "Analyze"}
          </button>
        </div>

        {/* HISTORY */}
        {history.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {history.map((item, i) => (
              <button
                key={i}
                onClick={() => {
                  setUsername(item);
                  analyzeProfile(item);
                }}
                className="px-3 py-1 text-sm bg-white/5 border border-white/10 rounded-full hover:bg-indigo-500/20"
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {/* SUGGESTIONS */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute top-20 w-96 bg-[#0f172a] border border-white/10 rounded-xl shadow-lg z-50">
            {suggestions.map((user) => (
              <div
                key={user.id}
                onClick={() => {
                  setUsername(user.login);
                  setShowDropdown(false);
                }}
                className="flex items-center gap-3 p-3 hover:bg-indigo-500/20 cursor-pointer"
              >
                <img src={user.avatar_url} className="w-8 h-8 rounded-full" />
                <p className="text-sm text-gray-300">{user.login}</p>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* PROFILE */}
      {profile && (
        <>
          {/* HEADER */}
          <div className="p-6 rounded-2xl bg-[#0f172a]/80 border border-white/10 mb-6">
            <h2 className="text-2xl font-semibold">
              {profile.name || profile.login}
            </h2>
            <p className="text-gray-400">@{profile.login}</p>
            <p className="text-sm mt-2">{profile.bio}</p>
          </div>

          {/* STATS */}
          <div className="grid md:grid-cols-4 gap-6 mb-6">

            <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
              <p>Developer Score</p>
              <h1 className="text-4xl font-bold">{score}</h1>
              <p className="text-indigo-400 text-sm">{level}</p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
              <p>Repositories</p>
              <h2 className="text-3xl">{repos.length}</h2>
            </div>

            <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
              <p>Followers</p>
              <h2 className="text-3xl">{profile.followers}</h2>
            </div>

            <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
              <p>Total Stars</p>
              <h2 className="text-3xl">
                {repos.reduce((a, r) => a + r.stargazers_count, 0)}
              </h2>
            </div>

          </div>

          {/* CHARTS */}
          <div className="grid md:grid-cols-2 gap-6">

            <div className="p-6 rounded-2xl bg-[#0f172a]/80 border border-white/10">
              <h2 className="mb-4">Languages</h2>
              <LanguageChart repos={repos} />
            </div>

            <div className="p-6 rounded-2xl bg-[#0f172a]/80 border border-white/10">
              <h2 className="mb-4">Skills</h2>
              <RadarChartBox repos={repos} />
            </div>

            <div className="col-span-2 p-6 rounded-2xl bg-[#0f172a]/80 border border-white/10">
              <h2 className="mb-4">Activity</h2>
              <ActivityChart repos={repos} />
            </div>

          </div>
        </>
      )}
    </div>
  );
}