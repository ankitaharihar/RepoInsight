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

  

  // 🔥 Fetch Data
  const analyzeProfile = async () => {
  if (!username) return;

  setLoading(true);
  try {
    const [profileRes, repoRes] = await Promise.all([
      axios.get(`http://localhost:5000/api/github/${username}`),
      axios.get(`https://api.github.com/users/${username}/repos?per_page=100`)
    ]);

    setProfile(profileRes.data);
    setRepos(repoRes.data); 
  } catch (err) {
    console.log(err);
  }
  setLoading(false);
  
};
  return (
   <div className="min-h-screen bg-[#020617] text-white">

      {/* 🔥 TITLE */}
      <h1 className="text-4xl text-center font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent mb-6">
        GitHub Intelligence Pro
      </h1>

      {/* 🔥 INPUT */}
      <div className="flex justify-center gap-3 mb-10">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyzeProfile()}
          placeholder="Enter GitHub username"
          className="w-96 px-4 py-2 rounded-lg bg-[#1e293b] outline-none"
        />
        <button
          onClick={analyzeProfile}
          className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg"
        >
          Analyze Profile
        </button>
      </div>

      {/* 🔥 LOADER */}
      {loading && (
        <div className="flex justify-center mt-20">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

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
              {/* SCORE + STATS */}
              <div className="grid md:grid-cols-4 gap-6 mb-8">
                
              <div className="col-span-2 p-6 rounded-2xl 
bg-gradient-to-r from-indigo-600 to-purple-600 
shadow-xl shadow-indigo-500/30">

  <p className="text-sm opacity-80">Developer Score</p>

  <h1 className="text-4xl font-bold mt-2">{score}</h1>

  <p className="text-sm mt-1 opacity-80">
    {level} • out of 100
  </p>
</div>

                <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
                  <p>Repositories</p>
                  <h2 className="text-3xl font-bold">{repos.length}</h2>
                </div>

                <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
                  <p>Followers</p>
                  <h2 className="text-3xl font-bold">{profile.followers}</h2>
                </div>

                <div className="p-6 rounded-2xl bg-[#0f172a]/60 border border-white/10">
                  <p>Total Stars</p>
                  <h2 className="text-3xl font-bold">
                    {repos.reduce((acc, r) => acc + r.stargazers_count, 0)}
                  </h2>
                </div>
              </div>

              {/* CHARTS */}
              <div className="grid md:grid-cols-2 gap-6">
                
                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0f172a]/90 to-[#1e293b]/70 
shadow-[0_0_40px_rgba(99,102,241,0.15)] border border-white/10">
                  <h2 className="mb-4">Languages</h2>
                  <LanguageChart repos={repos} />
                </div>

                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0f172a]/90 to-[#1e293b]/70 
shadow-[0_0_40px_rgba(99,102,241,0.15)] border border-white/10">
                  <h2 className="mb-4">Skills</h2>
                  <RadarChartBox repos={repos} />
                </div>

                <div className="col-span-2 p-6 rounded-2xl bg-gradient-to-br from-[#0f172a]/90 to-[#1e293b]/70 
shadow-[0_0_40px_rgba(99,102,241,0.15)] border border-white/10">
                  <h2 className="mb-4">Activity</h2>
                  <ActivityChart />
                </div>

              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}