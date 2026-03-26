import { useState } from "react";
import axios from "axios";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function App() {

  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [languages, setLanguages] = useState({});
  const [repos, setRepos] = useState([]);

  const analyzeProfile = async () => {
    try {

      const profileRes = await axios.get(
        `http://localhost:5000/api/github/${username}`
      );

      const langRes = await axios.get(
        `http://localhost:5000/api/github/${username}/languages`
      );

      const repoRes = await axios.get(
        `http://localhost:5000/api/github/${username}/repos`
      );

      setProfile(profileRes.data);
      setLanguages(langRes.data);
      setRepos(repoRes.data);

    } catch (error) {
      alert("User not found");
    }
  };

  const chartData = {
    labels: Object.keys(languages),
    datasets: [
      {
        label: "Languages",
        data: Object.values(languages),
        backgroundColor: [
          "#4CAF50",
          "#2196F3",
          "#FF9800",
          "#9C27B0",
          "#F44336",
          "#00BCD4"
        ]
      }
    ]
  };

  return (
    <div
style={{
width:"100%",
minHeight:"100vh",
display:"flex",
justifyContent:"center",
alignItems:"flex-start",
padding:"40px"
}}
>
      <div style={{ width: "100%", maxWidth: "1000px" }}>

        <h1
          style={{
            textAlign: "center",
            fontSize: "40px",
            background: "linear-gradient(90deg,#60a5fa,#a78bfa,#ec4899)",
            WebkitBackgroundClip: "text",
            color: "transparent"
          }}
        >
          GitHub Intelligence Pro
        </h1>

        <p style={{ textAlign: "center", color: "#94a3b8" }}>
          Advanced Developer Analytics Platform
        </p>

        {/* Search */}

        <div
          style={{
            marginTop: "30px",
            display: "flex",
            justifyContent: "center",
            gap: "10px"
          }}
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter GitHub username"
            style={{
              padding: "12px",
              width: "350px",
              borderRadius: "8px",
              border: "none"
            }}
          />

          <button
            onClick={analyzeProfile}
            style={{
              padding: "12px 20px",
              borderRadius: "8px",
              border: "none",
              background: "linear-gradient(90deg,#6366f1,#9333ea)",
              color: "white",
              cursor: "pointer"
            }}
          >
            Analyze Profile
          </button>
        </div>

        {profile && (

          <div
            style={{
              marginTop: "40px",
              background: "#1e293b",
              padding: "30px",
              borderRadius: "12px"
            }}
          >

            {/* Profile */}

            <div style={{ textAlign: "center" }}>
              <img
                src={profile.avatar_url}
                alt="avatar"
                width="120"
                style={{ borderRadius: "50%" }}
              />

              <h2>{profile.name}</h2>
              <p>@{profile.login}</p>

              <p>
                Followers: {profile.followers} | Repositories: {profile.public_repos}
              </p>
            </div>

            {/* Charts + Repos */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "30px",
                marginTop: "40px"
              }}
            >

              {/* Language Chart */}

              <div>
                <h3>Languages Used</h3>
                <Pie data={chartData} />
              </div>

              {/* Top Repositories */}

              <div>
                <h3>Top Repositories</h3>

                {repos
                  .sort((a, b) => b.stargazers_count - a.stargazers_count)
                  .slice(0, 5)
                  .map((repo) => (

                    <div
                      key={repo.id}
                      style={{
                        background: "#0f172a",
                        padding: "12px",
                        marginTop: "10px",
                        borderRadius: "8px"
                      }}
                    >
                      <h4>{repo.name}</h4>
                      <p>⭐ {repo.stargazers_count} stars</p>
                      <p>{repo.language}</p>
                    </div>

                  ))}
              </div>

            </div>

          </div>

        )}

      </div>

    </div>
  );
}