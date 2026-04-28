import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  AreaChart,
  Area,
  XAxis,
  Tooltip
} from "recharts";

// 🎯 COLORS (Figma style)
const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#22c55e", "#f59e0b"];

// 🔥 LANGUAGE CHART (Donut)
export function LanguageChart({ languageData = [], repos = [], theme = "dark" }) {
  const fallbackMap = {};

  repos.forEach((repo) => {
    if (repo.language) {
      fallbackMap[repo.language] = (fallbackMap[repo.language] || 0) + 1;
    }
  });

  const fallbackData = Object.keys(fallbackMap).map((key) => ({
    name: key,
    value: fallbackMap[key]
  }));

  const data = languageData.length > 0 ? languageData : fallbackData;
  const isLight = theme === "light";
  const tooltipStyle = {
    backgroundColor: isLight ? "#ffffff" : "#0f172a",
    border: isLight ? "1px solid rgba(148,163,184,0.36)" : "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    color: isLight ? "#0f172a" : "#e2e8f0"
  };

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          innerRadius={70}
          outerRadius={100}
          dataKey="value"
          paddingAngle={5}
           style={{ filter: "drop-shadow(0 0 15px #6366f1)" }}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [value, name]}
          contentStyle={tooltipStyle}
          labelStyle={{ color: isLight ? "#334155" : "#cbd5e1" }}
          cursor={{ fill: isLight ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.06)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// 🔥 RADAR CHART (Skills)
export function RadarChartBox({ repos, theme = "dark" }) {
  const totalStars = repos.reduce((acc, r) => acc + r.stargazers_count, 0);
  const isLight = theme === "light";

  const data = [
    { subject: "Code", A: Math.min(100, repos.length * 5) },
    { subject: "Collab", A: Math.min(100, totalStars * 2) },
    { subject: "Activity", A: 80 },
    { subject: "Stars", A: Math.min(100, totalStars * 2) },
    { subject: "Consistency", A: 60 }
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data}>
        <PolarGrid stroke={isLight ? "#94a3b8" : "#334155"} />
        <PolarAngleAxis dataKey="subject" stroke={isLight ? "#64748b" : "#94a3b8"} />
        <Radar
          dataKey="A"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={isLight ? 0.42 : 0.5}
           style={{ filter: "drop-shadow(0 0 15px #6366f1)" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// 🔥 ACTIVITY CHART (Glow)
export function ActivityChart({ theme = "dark", data = [] }) {
  const isLight = theme === "light";
  const fallbackData = [
    { name: "Apr", value: 40 },
    { name: "May", value: 70 },
    { name: "Jun", value: 20 },
    { name: "Jul", value: 60 },
    { name: "Aug", value: 50 },
    { name: "Sep", value: 55 },
    { name: "Oct", value: 52 },
    { name: "Nov", value: 25 },
    { name: "Dec", value: 40 },
    { name: "Jan", value: 35 },
    { name: "Feb", value: 30 },
    { name: "Mar", value: 75 }
  ];

  const chartData = data.length > 0 ? data : fallbackData;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>

        <XAxis dataKey="name" stroke={isLight ? "#64748b" : "#94a3b8"} />
        <Tooltip
          contentStyle={{
            backgroundColor: isLight ? "#ffffff" : "#0f172a",
            border: isLight ? "1px solid rgba(148,163,184,0.36)" : "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px",
            color: isLight ? "#0f172a" : "#e2e8f0"
          }}
          labelStyle={{ color: isLight ? "#334155" : "#cbd5e1" }}
          cursor={{ stroke: isLight ? "rgba(15,23,42,0.16)" : "rgba(255,255,255,0.25)" }}
        />

        <Area
          type="monotone"
          dataKey="value"
          stroke="#6366f1"
          strokeWidth={4}
          fill="url(#colorGradient)"
          style={{ filter: "drop-shadow(0 0 4px #6366f1)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// 🎓 DEVELOPER SCORE CALCULATOR
function calculateDeveloperScore(userData, repos = []) {
  let score = 0;
  const breakdown = {};

  // 1. Followers Score (0-20 points)
  const followers = userData?.followers || 0;
  const followersScore = Math.min(20, Math.floor(followers / 5));
  breakdown.followers = { score: followersScore, label: "Followers", value: followers, max: 20 };
  score += followersScore;

  // 2. Public Repos Score (0-20 points)
  const publicRepos = userData?.public_repos || 0;
  const reposScore = Math.min(20, Math.floor(publicRepos / 2));
  breakdown.repos = { score: reposScore, label: "Public Repos", value: publicRepos, max: 20 };
  score += reposScore;

  // 3. Total Stars Score (0-20 points)
  const totalStars = repos.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
  const starsScore = Math.min(20, Math.floor(totalStars / 10));
  breakdown.stars = { score: starsScore, label: "Total Stars", value: totalStars, max: 20 };
  score += starsScore;

  // 4. Languages Diversity (0-15 points)
  const languages = new Set(repos.map((r) => r.language).filter(Boolean));
  const languageScore = Math.min(15, languages.size * 2);
  breakdown.languages = { score: languageScore, label: "Languages", value: languages.size, max: 15 };
  score += languageScore;

  // 5. Collaboration Score - Total Forks (0-15 points)
  const totalForks = repos.reduce((acc, r) => acc + (r.forks_count || 0), 0);
  const forksScore = Math.min(15, Math.floor(totalForks / 5));
  breakdown.forks = { score: forksScore, label: "Collaboration", value: totalForks, max: 15 };
  score += forksScore;

  // 6. Gists Score (0-10 points)
  const gists = userData?.public_gists || 0;
  const gistsScore = Math.min(10, Math.floor(gists / 2));
  breakdown.gists = { score: gistsScore, label: "Public Gists", value: gists, max: 10 };
  score += gistsScore;

  return { score: Math.round(score), breakdown, maxScore: 100 };
}

// 🎯 DEVELOPER SCORE CARD COMPONENT
export function DeveloperScoreCard({ userData, repos = [], theme = "dark" }) {
  const isLight = theme === "light";
  const { score, breakdown, maxScore } = calculateDeveloperScore(userData, repos);
  const percentage = (score / maxScore) * 100;

  const getScoreColor = (pct) => {
    if (pct >= 80) return "#22c55e"; // green
    if (pct >= 60) return "#3b82f6"; // blue
    if (pct >= 40) return "#f59e0b"; // amber
    return "#ec4899"; // pink
  };

  const scoreColor = getScoreColor(percentage);

  const categories = Object.entries(breakdown).map(([key, data]) => ({
    key,
    ...data,
    percentage: (data.score / data.max) * 100,
  }));

  return (
    <div className={`developer-score-card ${isLight ? 'light' : 'dark'}`}>
      <div className="score-header">
        <h2>Developer Score</h2>
      </div>

      <div className="score-display">
        <div className="score-circle">
          <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={scoreColor} stopOpacity="1" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke={isLight ? "#e2e8f0" : "#1e293b"}
              strokeWidth="8"
            />
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="url(#scoreGradient)"
              strokeWidth="8"
              strokeDasharray={`${(percentage / 100) * 565.48} 565.48`}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 12px ${scoreColor})`,
                transform: "rotate(-90deg)",
                transformOrigin: "100px 100px",
              }}
            />
            <text
              x="100"
              y="100"
              textAnchor="middle"
              dy="0.3em"
              fontSize="48"
              fontWeight="bold"
              fill={scoreColor}
              style={{ pointerEvents: "none" }}
            >
              {score}
            </text>
            <text
              x="100"
              y="140"
              textAnchor="middle"
              fontSize="16"
              fill={isLight ? "#64748b" : "#94a3b8"}
              style={{ pointerEvents: "none" }}
            >
              / {maxScore}
            </text>
          </svg>
        </div>

        <div className="score-breakdown">
          {categories.map((cat) => (
            <div key={cat.key} className="breakdown-item">
              <div className="breakdown-label">
                <span className="label-text">{cat.label}</span>
                <span className="label-value">{cat.score}/{cat.max}</span>
              </div>
              <div className="breakdown-bar">
                <div
                  className="breakdown-fill"
                  style={{
                    width: `${cat.percentage}%`,
                    backgroundColor: scoreColor,
                    boxShadow: `0 0 8px ${scoreColor}`,
                  }}
                />
              </div>
              <div className="breakdown-detail">{cat.value} {cat.label.toLowerCase()}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="score-interpretation">
        <div className="interpretation-item excellent">
          <span>80-100:</span> Excellent Developer
        </div>
        <div className="interpretation-item good">
          <span>60-79:</span> Strong Developer
        </div>
        <div className="interpretation-item fair">
          <span>40-59:</span> Growing Developer
        </div>
        <div className="interpretation-item developing">
          <span>0-39:</span> Emerging Developer
        </div>
      </div>
    </div>
  );
}

// 👤 PROFILE CARD COMPONENT
export function ProfileCard({ userData = {}, theme = "dark" }) {
  const isLight = theme === "light";
  
  return (
    <div className={`profile-card ${isLight ? 'light' : 'dark'}`}>
      <div className="profile-header">
        <img src={userData?.avatar_url} alt={userData?.login} className="profile-avatar" />
        <div className="profile-info">
          <h2>{userData?.name || userData?.login || 'Unknown'}</h2>
          <p className="profile-login">@{userData?.login}</p>
          {userData?.bio && <p className="profile-bio">{userData?.bio}</p>}
        </div>
      </div>

      <div className="profile-stats">
        <div className="stat-item">
          <span className="stat-label">Followers</span>
          <span className="stat-value">{userData?.followers?.toLocaleString() || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Following</span>
          <span className="stat-value">{userData?.following?.toLocaleString() || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Public Repos</span>
          <span className="stat-value">{userData?.public_repos?.toLocaleString() || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Public Gists</span>
          <span className="stat-value">{userData?.public_gists?.toLocaleString() || 0}</span>
        </div>
      </div>

      {userData?.location && (
        <div className="profile-meta">
          <span>📍 {userData.location}</span>
        </div>
      )}
      {userData?.blog && (
        <div className="profile-meta">
          <span>🔗 <a href={userData.blog} target="_blank" rel="noopener noreferrer">{userData.blog}</a></span>
        </div>
      )}
    </div>
  );
}

// 🧠 AI INSIGHTS COMPONENT
export function AIInsights({ userData = {}, repos = [], theme = "dark" }) {
  const isLight = theme === "light";

  const generateInsights = () => {
    const insights = [];
    
    // Language insights
    const languages = new Set(repos.map((r) => r.language).filter(Boolean));
    if (languages.size > 0) {
      const topLangs = Array.from(languages).slice(0, 3).join(", ");
      insights.push(`Proficient in ${topLangs} and ${languages.size > 3 ? `${languages.size - 3} more languages` : 'more'}.`);
    }

    // Activity insights
    const recentRepos = repos.filter((r) => {
      const updated = new Date(r.updated_at);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return updated > thirtyDaysAgo;
    });
    
    if (recentRepos.length > 0) {
      insights.push(`Maintained ${recentRepos.length} repositories in the last month.`);
    }

    // Stars & Community insight
    const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
    if (totalStars > 100) {
      insights.push(`Projects have received ${totalStars.toLocaleString()} stars, showing strong community recognition.`);
    } else if (totalStars > 0) {
      insights.push(`Actively building projects with community engagement.`);
    }

    // Collaboration insight
    const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
    if (totalForks > 50) {
      insights.push(`High collaboration level with ${totalForks} forks across projects.`);
    }

    // Followers insight
    if (userData?.followers > 1000) {
      insights.push(`Established developer with ${userData.followers.toLocaleString()} followers.`);
    } else if (userData?.followers > 100) {
      insights.push(`Growing presence in the developer community.`);
    }

    return insights.slice(0, 4);
  };

  const insights = generateInsights();

  return (
    <div className={`ai-insights ${isLight ? 'light' : 'dark'}`}>
      <h3>🧠 AI Analysis</h3>
      <div className="insights-list">
        {insights.length > 0 ? (
          insights.map((insight, idx) => (
            <div key={idx} className="insight-item">
              <span className="insight-icon">✨</span>
              <p>{insight}</p>
            </div>
          ))
        ) : (
          <p className="no-insights">Not enough data to generate insights yet.</p>
        )}
      </div>
    </div>
  );
}

export default function Charts({ userData, repos = [], theme = "dark" }) {
  const languageData = Array.isArray(userData?.languageBreakdown)
    ? userData.languageBreakdown.map((entry) => ({
        name: entry.language || entry.name,
        value: entry.repoCount || entry.value || 0,
      }))
    : [];

  return (
    <section className="charts-section">
      <ProfileCard userData={userData} theme={theme} />
      <AIInsights userData={userData} repos={repos} theme={theme} />

      <div className="score-container">
        <DeveloperScoreCard userData={userData} repos={repos} theme={theme} />
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Language Breakdown</h3>
          <LanguageChart languageData={languageData} repos={repos} theme={theme} />
        </div>

        <div className="chart-card">
          <h3>Skill Radar</h3>
          <RadarChartBox repos={repos} theme={theme} />
        </div>

        <div className="chart-card">
          <h3>Activity Trend</h3>
          <ActivityChart theme={theme} data={userData?.activityData || []} />
        </div>
      </div>
    </section>
  );
}