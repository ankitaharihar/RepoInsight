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
        setSuggestions([])
        setActiveIndex(-1)
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

      const [profileRes, repoRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/github/${trimmed}`),
        axios.get(`${API_BASE_URL}/api/github/${trimmed}/repos?page=1&per_page=100`),
      ])

      setUserData(profileRes.data)
      setRepos(repoRes.data?.data || [])
    } catch {
      setUserData(null)
      setRepos([])
      setError('Failed to fetch data')
    } finally {
      setLoading(false)
    }
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
                  placeholder="Enter GitHub username (e.g., torvalds)"
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
                      if (activeIndex >= 0) {
                        handleSearch(suggestions[activeIndex].login)
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
                          onClick={() => {
                            setUsername(user.login)
                            setShowSuggestions(false)
                            handleSearch(user.login)
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
              <button onClick={() => setError('Please login first')} className="btn-primary">Analyze</button>
            </div>
            <p className="landing-hint">Get profile score, AI insights, and repo-level analytics in one clean workflow.</p>
            <p className="landing-login-hint">Sign in to unlock search history and full analytics.</p>
          </div>
        </div>
      ) : (
        <div className="dashboard">
          <div className="search-section">
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
                      if (activeIndex >= 0) {
                        handleSearch(suggestions[activeIndex].login)
                        setShowSuggestions(false)
                      } else {
                        handleSearch()
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
                          onClick={() => {
                            setUsername(user.login)
                            setShowSuggestions(false)
                            handleSearch(user.login)
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
              <button onClick={() => handleSearch()} className="btn-primary">Analyze</button>
            </div>
            {error && <p className="error-message">{error}</p>}
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
                    <div key={repo.id} className="repo-card">
                      <h3>{repo.name}</h3>
                      <p>{repo.description || 'No description'}</p>
                      <div className="repo-stats">
                        <span>Stars {repo.stargazers_count}</span>
                        <span>Forks {repo.forks_count}</span>
                        <span>{repo.language || 'N/A'}</span>
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
