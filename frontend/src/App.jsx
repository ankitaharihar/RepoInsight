import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import './App.css'
import Charts from './components/Charts'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const AUTH_TOKEN_KEY = 'repoinsight_auth_token'
const AXIOS_INTERCEPTOR_FLAG = '__repoinsight_auth_interceptor__'

// Attach token globally once.
if (!globalThis[AXIOS_INTERCEPTOR_FLAG]) {
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (token) {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      }
    }
    return config
  })
  globalThis[AXIOS_INTERCEPTOR_FLAG] = true
}

export default function App() {
  const [authUser, setAuthUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState([])
  const [userData, setUserData] = useState(null)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [debounceTimer, setDebounceTimer] = useState(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [languageFilter, setLanguageFilter] = useState('all')
  const [sortBy, setSortBy] = useState('stars')
  const [includeForks, setIncludeForks] = useState(true)

  const location = useLocation()

  // Handle OAuth callback token once, then hard reload for clean app bootstrap.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get('token')

    if (!token) return

    localStorage.setItem(AUTH_TOKEN_KEY, token)
    window.history.replaceState({}, document.title, location.pathname)
    window.location.reload()
  }, [location.search, location.pathname])

  // Resolve signed-in user from token on initial load.
  useEffect(() => {
    let cancelled = false

    const syncAuth = async () => {
      try {
        const token = localStorage.getItem(AUTH_TOKEN_KEY)

        if (!token) {
          if (!cancelled) {
            setAuthUser(null)
            setLoading(false)
          }
          return
        }

        const res = await axios.get(`${API_BASE_URL}/auth/me`)

        if (!cancelled) {
          setAuthUser(res.data?.user || null)
        }
      } catch {
        if (!cancelled) {
          setAuthUser(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    syncAuth()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [debounceTimer])

  const handleSuggestionSearch = (query) => {
    if (!authUser) {
      setSuggestions([])
      setShowSuggestions(false)
      setActiveIndex(-1)
      return
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setSuggestions([])
        setActiveIndex(-1)
        setSuggestionsLoading(false)
        return
      }

      try {
        setSuggestionsLoading(true)
        const res = await axios.get(
          `${API_BASE_URL}/api/github/search/users?q=${encodeURIComponent(query)}&per_page=5`
        )
        setSuggestions(res.data.items || [])
        setActiveIndex(-1)
      } catch {
        try {
          const fallbackRes = await axios.get(
            `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=5`
          )
          setSuggestions(fallbackRes.data.items || [])
          setActiveIndex(-1)
        } catch {
          setSuggestions([])
          setActiveIndex(-1)
        }
      } finally {
        setSuggestionsLoading(false)
      }
    }, 400)

    setDebounceTimer(timer)
  }

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE_URL}/auth/logout`, {})
    } catch {
      // no-op: local token removal is enough for client logout
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      setAuthUser(null)
      setUsername('')
      setRepos([])
      setUserData(null)
      setError('')
      setSuggestions([])
      setShowSuggestions(false)
      setActiveIndex(-1)
    }
  }

  const handleSearch = async (candidate = username) => {
    const trimmed = candidate.trim()

    if (!trimmed) {
      setError('Please enter a username')
      return
    }

    if (!authUser) {
      setError('Please login first')
      return
    }

    try {
      setLoading(true)
      setError('')
      setUsername(trimmed)
      setShowSuggestions(false)
      setSuggestions([])
      setActiveIndex(-1)
      setSuggestionsLoading(false)

      const fetchProfile = async () => {
        try {
          return await axios.get(`${API_BASE_URL}/api/github/${trimmed}`)
        } catch {
          return axios.get(`${API_BASE_URL}/api/github?username=${encodeURIComponent(trimmed)}`)
        }
      }

      const fetchRepos = async () => {
        try {
          return await axios.get(`${API_BASE_URL}/api/github/${trimmed}/repos?page=1&per_page=100`)
        } catch {
          return axios.get(`${API_BASE_URL}/api/repos?username=${encodeURIComponent(trimmed)}&page=1&per_page=100`)
        }
      }

      const [profileRes, repoRes] = await Promise.all([fetchProfile(), fetchRepos()])
      const normalizedRepos = Array.isArray(repoRes.data)
        ? repoRes.data
        : (repoRes.data?.data || [])

      setUserData(profileRes.data)
      setRepos(normalizedRepos)
    } catch {
      setUserData(null)
      setRepos([])
      setError('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyzeAction = (candidate = username) => {
    if (!authUser) {
      setError('Please login first')
      return
    }

    handleSearch(candidate)
  }

  const selectSuggestion = (login) => {
    setUsername(login)
    setShowSuggestions(false)
    handleSearch(login)
  }

  const filteredRepos = useMemo(() => {
    let next = [...repos]

    if (languageFilter !== 'all') {
      next = next.filter((repo) => repo.language === languageFilter)
    }

    if (!includeForks) {
      next = next.filter((repo) => !repo.fork)
    }

    if (sortBy === 'stars') {
      next.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    } else if (sortBy === 'forks') {
      next.sort((a, b) => (b.forks_count || 0) - (a.forks_count || 0))
    } else if (sortBy === 'updated') {
      next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    }

    return next
  }, [repos, languageFilter, includeForks, sortBy])

  // Get top 3 repos by stars for highlighting
  const topRepos = useMemo(() => {
    return [...repos]
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
      .slice(0, 3)
      .map((r) => r.id)
  }, [repos])

  // Format date helper
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now - date)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Updated today'
    if (diffDays === 1) return 'Updated yesterday'
    if (diffDays < 7) return `Updated ${diffDays} days ago`
    if (diffDays < 30) return `Updated ${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `Updated ${Math.floor(diffDays / 30)} months ago`
    return `Updated ${Math.floor(diffDays / 365)} years ago`
  }

  if (loading && !authUser) {
    return (
      <div className="app-container">
        <nav className="navbar">
          <div className="nav-left">
            <div className="logo">RepoInsight</div>
          </div>
        </nav>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="nav-left">
          <div className="logo">RepoInsight</div>
          {authUser && <a href="#" className="nav-link">Light</a>}
          {authUser && <a href="#" className="nav-link">History</a>}
        </div>
        <div className="nav-right">
          {authUser ? (
            <>
              <span className="user-name">{authUser.login}</span>
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </>
          ) : (
            <a href={`${API_BASE_URL}/auth/github`} className="login-btn">Login</a>
          )}
        </div>
      </nav>

      {!authUser ? (
        <div className="landing-section">
          <div className="landing-content">
            <h1>Unlock the Power of RepoInsight</h1>
            <p>Analyze profiles, repos, and developer momentum in seconds, then turn insights into better career and team decisions.</p>
            <div className="landing-buttons">
              <button className="btn-secondary">No credit card required</button>
              <button className="btn-secondary">Cancel anytime</button>
              <button className="btn-secondary">Setup in under 60 seconds</button>
            </div>

              <div className="search-box-landing">
              <div className="search-input-wrap">
                <input
                  type="text"
                  placeholder="Login first to search usernames"
                  value={username}
                  disabled
                  onChange={(e) => {
                    const nextValue = e.target.value
                    setUsername(nextValue)
                    handleSuggestionSearch(nextValue)
                    setShowSuggestions(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
                    } else if (e.key === 'ArrowUp') {
                      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      if (activeIndex >= 0) {
                        handleAnalyzeAction(suggestions[activeIndex].login)
                        setShowSuggestions(false)
                      } else {
                        setError('Please login first')
                      }
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {showSuggestions && (suggestionsLoading || suggestions.length > 0) && (
                  <div className="suggestions-list">
                    {suggestionsLoading ? (
                      <div className="suggestion-item suggestion-state">Loading suggestions...</div>
                    ) : suggestions.length > 0 ? (
                      suggestions.map((user, index) => (
                        <div
                          key={user.id}
                          className={`suggestion-item ${index === activeIndex ? 'active' : ''}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            selectSuggestion(user.login)
                          }}
                        >
                          <img src={user.avatar_url} alt="" className="avatar" />
                          <span>{user.login}</span>
                        </div>
                      ))
                    ) : (
                      <div className="suggestion-item suggestion-state">No suggestions found</div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (activeIndex >= 0 && suggestions[activeIndex]) {
                    handleAnalyzeAction(suggestions[activeIndex].login)
                    setShowSuggestions(false)
                  } else {
                    handleAnalyzeAction()
                  }
                }}
                className="btn-primary"
              >
                Analyze
              </button>
            </div>
            <p className="landing-hint">Get profile score, AI insights, and repo-level analytics in one clean workflow.</p>
            <p className="landing-login-hint">Sign in to unlock search history and full analytics.</p>
          </div>
        </div>
      ) : (
        <div className="dashboard">
          <div className="hero-section">
            <h1>Analyze GitHub Profiles Instantly</h1>
            <p>Get insights, skills & activity in seconds</p>
          </div>

          <div className="search-section">
            <div className="search-wrapper">
            <div className="search-box">
              <div className="search-input-wrap">
                <input
                  type="text"
                  placeholder="Enter GitHub username"
                  value={username}
                  onChange={(e) => {
                    const nextValue = e.target.value
                    setUsername(nextValue)
                    handleSuggestionSearch(nextValue)
                    setShowSuggestions(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
                    } else if (e.key === 'ArrowUp') {
                      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      if (activeIndex >= 0) {
                        handleAnalyzeAction(suggestions[activeIndex].login)
                        setShowSuggestions(false)
                      } else {
                        handleAnalyzeAction()
                      }
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {showSuggestions && (suggestionsLoading || suggestions.length > 0) && (
                  <div className="suggestions-list">
                    {suggestionsLoading ? (
                      <div className="suggestion-item suggestion-state">Loading suggestions...</div>
                    ) : suggestions.length > 0 ? (
                      suggestions.map((user, index) => (
                        <div
                          key={user.id}
                          className={`suggestion-item ${index === activeIndex ? 'active' : ''}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            selectSuggestion(user.login)
                          }}
                        >
                          <img src={user.avatar_url} alt="" className="avatar" />
                          <span>{user.login}</span>
                        </div>
                      ))
                    ) : (
                      <div className="suggestion-item suggestion-state">No suggestions found</div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (activeIndex >= 0 && suggestions[activeIndex]) {
                    handleAnalyzeAction(suggestions[activeIndex].login)
                    setShowSuggestions(false)
                  } else {
                    handleAnalyzeAction()
                  }
                }}
                className="btn-primary"
              >
                Analyze
              </button>
            </div>
            {error && <p className="error-message">{error}</p>}
            </div>
          </div>

          {userData && (
            <>
              <Charts userData={userData} repos={filteredRepos} />

              <div className="repo-section">
                <div className="repo-controls">
                  <label>
                    Language:
                    <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
                      <option value="all">All</option>
                      {Array.from(new Set(repos.map((r) => r.language).filter(Boolean))).map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sort by:
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                      <option value="stars">Stars</option>
                      <option value="forks">Forks</option>
                      <option value="updated">Updated</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeForks}
                      onChange={(e) => setIncludeForks(e.target.checked)}
                    />
                    Include Forks
                  </label>
                </div>

                <div className="repo-list">
                  {filteredRepos.map((repo) => (
                    <div key={repo.id} className={`repo-card ${topRepos.includes(repo.id) ? 'top-repo' : ''}`}>
                      {topRepos.includes(repo.id) && <div className="top-badge">⭐ Top Repo</div>}
                      <h3>{repo.name}</h3>
                      <p>{repo.description || 'No description'}</p>
                      <div className="repo-stats">
                        <span title="Stars">⭐ {repo.stargazers_count}</span>
                        <span title="Forks">🍴 {repo.forks_count}</span>
                        <span title="Language">{repo.language || '—'}</span>
                      </div>
                      <div className="repo-meta">
                        <span>{formatDate(repo.updated_at)}</span>
                        {repo.fork && <span className="fork-badge">forked</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
