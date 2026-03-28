import { useState } from "react";
import axios from "axios";

export default function App() {
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");

  // 🔥 FETCH DATA
  const analyzeProfile = async () => {
    if (!username) return;

    setLoading(true);

    try {
      const [profileRes, repoRes] = await Promise.all([
        axios.get(`http://localhost:5000/api/github/${username}`),
        axios.get(`http://localhost:5000/api/github/${username}/repos`)
      ]);

      setProfile(profileRes.data);
      setRepos(repoRes.data.data || []);
    } catch (err) {
      console.log(err);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] text-white px-6 py-10">

      {/* 🔥 HEADER */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-pink-400 bg-clip-text text-transparent">
          GitHub Intelligence Pro
        </h1>
        <p className="text-gray-400 mt-3">
          Advanced Developer Analytics & Portfolio Intelligence Platform
        </p>
      </div>

      {/* 🔥 SEARCH */}
      <div className="flex justify-center mb-10">
        <div className="flex items-center bg-[#0f172a] border border-gray-700 rounded-xl px-4 py-2 w-[700px]">

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter GitHub username..."
            className="flex-1 bg-transparent outline-none text-sm"
            onKeyDown={(e) => e.key === "Enter" && analyzeProfile()}
          />

          <button
            onClick={analyzeProfile}
            className="bg-gradient-to-r from-blue-500 to-purple-600 px-5 py-2 rounded-lg text-sm"
          >
            {loading ? "Analyzing..." : "Analyze Profile"}
          </button>
        </div>
      </div>

      {/* 🔥 LOADER */}
      {loading && (
        <div className="flex justify-center mt-10">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* 🔥 PROFILE */}
      {profile && !loading && (
        <>
          <div className="bg-[#0f172a] border border-gray-700 rounded-xl p-6 mb-8 flex justify-between items-center">

            <div className="flex gap-4">
              <img
                src={profile.avatar_url}
                className="w-20 h-20 rounded-full border-2 border-blue-500"
              />

              <div>
                <h2 className="text-2xl font-semibold">
                  {profile.name || profile.login}
                </h2>

                <p className="text-blue-400">@{profile.login}</p>

                <p className="text-sm text-gray-400 mt-1">
                  {profile.bio}
                </p>

                <div className="flex gap-6 text-sm text-gray-400 mt-2">
                  <span>📦 {profile.public_repos} repos</span>
                  <span>👥 {profile.followers} followers</span>
                  <span>
                    ⭐{" "}
                    {repos.reduce(
                      (a, r) => a + r.stargazers_count,
                      0
                    )}{" "}
                    stars
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button className="bg-green-600 px-4 py-2 rounded-lg text-sm">
                Generate Resume
              </button>

              <a
                href={profile.html_url}
                target="_blank"
                rel="noreferrer"
                className="bg-gray-600 px-4 py-2 rounded-lg text-sm text-center"
              >
                View Profile
              </a>
            </div>
          </div>

          {/* 🔥 STATS */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">

            <div className="bg-blue-600/20 p-4 rounded-xl">
              <p className="text-sm text-gray-400">Quality Score</p>
              <h2 className="text-3xl font-bold">38</h2>
            </div>

            <div className="bg-purple-600/20 p-4 rounded-xl">
              <p className="text-sm text-gray-400">Collaboration</p>
              <h2 className="text-3xl font-bold">13</h2>
            </div>

            <div className="bg-green-600/20 p-4 rounded-xl">
              <p className="text-sm text-gray-400">Career Readiness</p>
              <h2 className="text-3xl font-bold">21%</h2>
            </div>

            <div className="bg-orange-600/20 p-4 rounded-xl">
              <p className="text-sm text-gray-400">Active Projects</p>
              <h2 className="text-3xl font-bold">{repos.length}</h2>
            </div>

          </div>

          {/* 🔥 TABS */}
          <div className="flex gap-4 mb-6 border-b border-gray-700">
            {["Overview", "Skills", "Projects", "AI Insights"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-t-lg ${
                  activeTab === tab
                    ? "bg-blue-600"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 🔥 CONTENT */}
          {activeTab === "Overview" && (
            <div className="text-gray-400">
              Overview content (charts next step 🔥)
            </div>
          )}

          {activeTab === "Projects" && (
            <div className="grid md:grid-cols-2 gap-4">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="bg-[#1e293b] p-4 rounded-xl"
                >
                  <p className="text-blue-400 font-semibold">
                    {repo.name}
                  </p>

                  <div className="text-xs text-gray-400 mt-2 flex gap-3">
                    <span>⭐ {repo.stargazers_count}</span>
                    <span>🍴 {repo.forks_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}