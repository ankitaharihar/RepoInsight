async function handler(req, res) {
  const { username, page = 1, per_page = 30 } = req.query || {};
  const normalizedUsername = String(username || "").trim();
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedPerPage = Math.min(Math.max(Number(per_page) || 30, 1), 100);

  if (!normalizedUsername) {
    return res.status(400).json({ error: "Username required" });
  }

  try {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(normalizedUsername)}/repos?page=${normalizedPage}&per_page=${normalizedPerPage}&sort=updated`,
      { headers }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || "Failed to fetch repos" });
    }

    return res.status(200).json(Array.isArray(data) ? data : []);
  } catch {
    return res.status(500).json({ error: "Failed to fetch repos" });
  }
}

module.exports = handler;
