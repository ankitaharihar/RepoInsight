export default async function handler(req, res) {
  const { q, per_page = 8 } = req.query || {};
  const query = String(q || "").trim();
  const normalizedPerPage = Math.min(Math.max(Number(per_page) || 8, 1), 20);

  if (!query) {
    return res.status(400).json({ message: "Query required", items: [] });
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
      `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=${normalizedPerPage}`,
      { headers }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        message: data?.message || "Failed to search users",
        items: [],
      });
    }

    return res.status(200).json({
      ...data,
      items: Array.isArray(data?.items) ? data.items : [],
    });
  } catch {
    return res.status(500).json({ message: "Failed to search users", items: [] });
  }
}
