export default async function handler(req, res) {
  const { username } = req.query || {};
  const normalizedUsername = String(username || "").trim();

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

    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(normalizedUsername)}`, {
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || "Failed to fetch user" });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
}
