import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

// 🔵 PIE CHART
export function LanguageChart({ repos }) {
  const langMap = {};

  repos.forEach((repo) => {
    if (repo.language) {
      langMap[repo.language] =
        (langMap[repo.language] || 0) + 1;
    }
  });

  const data = Object.keys(langMap).map((key) => ({
    name: key,
    value: langMap[key]
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          outerRadius={90}
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

// 🟣 RADAR CHART
export function RadarChartBox({ repos }) {
  const data = [
    { subject: "Code Quality", A: repos.length * 2 },
    { subject: "Collaboration", A: repos.length },
    { subject: "Activity", A: repos.length * 3 },
    { subject: "Popularity", A: repos.length },
    { subject: "Consistency", A: repos.length }
  ];

  return (
    <ResponsiveContainer width="100%" height={250}>
      <RadarChart data={data}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis dataKey="subject" stroke="#94a3b8" />
        <Radar
          dataKey="A"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// 🟢 LINE GRAPH
export function ActivityChart() {
  const data = [
    { name: "Apr", value: 120 },
    { name: "May", value: 150 },
    { name: "Jun", value: 50 },
    { name: "Jul", value: 140 },
    { name: "Aug", value: 120 },
    { name: "Sep", value: 130 },
    { name: "Oct", value: 130 },
    { name: "Nov", value: 60 },
    { name: "Dec", value: 90 },
    { name: "Jan", value: 70 },
    { name: "Feb", value: 60 },
    { name: "Mar", value: 140 }
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="name" stroke="#64748b" />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={3}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}