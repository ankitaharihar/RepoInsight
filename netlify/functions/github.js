export async function handler(event) {
  const username = event.queryStringParameters.username;

  try {
    const res = await fetch(`https://api.github.com/users/${username}`);
    const data = await res.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch" }),
    };
  }
}