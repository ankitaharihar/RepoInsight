import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import './App.css'
import Charts from './components/Charts'
import FileExplorer from './components/FileExplorer'
import RepoModal from './components/RepoModal'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const AUTH_TOKEN_KEY = 'repoinsight_auth_token'

const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

const buildAuthHeaders = () => {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function App() {
  const [authUser, setAuthUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState([])
  const [filteredRepos, setFilteredRepos] = useState([])
  const [userData, setUserData] = useState(null)
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [showRepoModal, setShowRepoModal] = useState(false)
  const [error, setError] = useState('')
  const [searchHistory, setSearchHistory] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [languageFilter, setLanguageFilter] = useState('all')
  const [sortBy, setSortBy] = useState('stars')
  const [includeForks, setIncludeForks] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const location = useLocation()

  // Sync auth state on mount and OAuth redirect
  useEffect(() => {
    syncAuthState()
  }, [])

  // Handle OAuth callback params and sync auth state.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tokenFromCallback = params.get('token')

    if (tokenFromCallback) {
      localStorage.setItem(AUTH_TOKEN_KEY, tokenFromCallback)
    }

    if (params.has('code') || params.has('login_success') || tokenFromCallback) {
      console.log('🔐 OAuth callback detected, syncing auth state...')
      window.history.replaceState({}, document.title, location.pathname)
      syncAuthState()
    }
  }, [location.search])

  const syncAuthState = async () => {
    try {
      setLoading(true)
      console.log('📡 Calling /auth/me with credentials:', { 
        url: `${API_BASE_URL}/auth/me`,
        credentialsIncluded: true 
      })
      
      const response = await axios.get(`${API_BASE_URL}/auth/me`, {
        withCredentials: true,
        headers: buildAuthHeaders(),
      })
      
      console.log('✅ /auth/me response:', response.data)
      
      if (response.data?.user) {
        console.log('🎉 User logged in:', response.data.user.login)
        setAuthUser(response.data.user)
        loadSearchHistory(response.data.user.id)
      } else {
        console.log('❌ /auth/me returned empty user')
        setAuthUser(null)
      }
    } catch (err) {
      console.error('🚨 Auth sync error:', err.message, err.response?.data)
      setAuthUser(null)
    } finally {
      setLoading(false)
    }
  }

  const loadSearchHistory = async (userId) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/search-history/${userId}`,
        {
          withCredentials: true,
          headers: buildAuthHeaders(),
        }
      )
      setSearchHistory(response.data?.history || [])
    } catch (err) {
      console.warn('Could not load search history')
    }
  }

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE_URL}/auth/logout`, {}, {
        withCredentials: true,
        headers: buildAuthHeaders(),
      })
      localStorage.removeItem(AUTH_TOKEN_KEY)
      setAuthUser(null)
      setUsername('')
      setRepos([])
      setUserData(null)
      setSearchHistory([])
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const handleSearch = async (searchUsername) => {
    if (!searchUsername.trim()) {
      setError('Please enter a username')
      return
    }

    if (!authUser) {
      setError('Please login to search')
      return
    }

    try {
      setLoading(true)
      setError('')
      setUsername(searchUsername)
      
      const [profileRes, reposRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/github/${searchUsername}`),
        axios.get(`${API_BASE_URL}/api/github/${searchUsername}/repos?page=1&per_page=100`),
      ])

      setUserData(profileRes.data)
      setRepos(reposRes.data.data || [])
      setPage(1)
      setTotalPages(reposRes.data.pagination?.total_pages || 1)

      // Save to history if logged in
      if (authUser?.id) {
        await axios.post(
          `${API_BASE_URL}/api/search-history`,
          { username: searchUsername },
          {
            withCredentials: true,
            headers: buildAuthHeaders(),
          }
        ).catch(() => {})
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data')
      setRepos([])
      setUserData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSuggestionSearch = async (query) => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/github/search/users?q=${encodeURIComponent(query)}&per_page=8`
      )
      setSuggestions(response.data?.data || [])
    } catch (err) {
      setSuggestions([])
    }
  }

  const handleAnalyzeClick = async () => {
    if (!authUser) {
      setError('Please login to analyze')
      return
    }
    await handleSearch(username)
  }

  const handleRepoClick = (repo) => {
    setSelectedRepo(repo)
    setShowRepoModal(true)
  }

  const applyFilters = () => {
    let filtered = repos

    if (languageFilter !== 'all') {
      filtered = filtered.filter(repo => repo.language === languageFilter)
    }

    if (!includeForks) {
      filtered = filtered.filter(repo => !repo.fork)
    }

    if (sortBy === 'stars') {
      filtered.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    } else if (sortBy === 'forks') {
      filtered.sort((a, b) => (b.forks_count || 0) - (a.forks_count || 0))
    } else if (sortBy === 'updated') {
      filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    }

    setFilteredRepos(filtered)
  }

  useEffect(() => {
    applyFilters()
  }, [repos, languageFilter, sortBy, includeForks])

  if (loading && !authUser) {
    return (
      <div className="app-container">
        <nav className="navbar">
          <div className="nav-left">
            <div className="logo">RepoInsight</div>
          </div>
        </nav>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="nav-left">
          <div className="logo">RepoInsight</div>
          {authUser && <a href="#" className="nav-link">★ Light</a>}
          {authUser && <a href="#" className="nav-link">🕐 History</a>}
        </div>
        <div className="nav-right">
          {authUser ? (
            <>
              <span className="user-name">{authUser.login}</span>
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </>
          ) : (
            <a href={`${API_BASE_URL}/auth/github`} className="login-btn">
              🔐 Login
            </a>
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
              <input
                type="text"
                placeholder="Enter GitHub username (e.g., torvalds)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && setError('Please login to search')}
              />
              <button onClick={() => setError('Please login to search')} className="btn-primary">
                ✨ Analyze
              </button>
            </div>
            <p className="landing-hint">Get profile score, AI insights, and repo-level analytics in one clean workflow.</p>
            <p className="landing-login-hint">Sign in to unlock search history and full analytics.</p>

            <div className="recent-section">
              <h3>RECENT SEARCHES</h3>
              <p>Jump back into a previous profile.</p>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>No searches yet</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dashboard">
          <div className="search-section">
            <div className="search-box">
              <input
                type="text"
                placeholder="Enter GitHub username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  handleSuggestionSearch(e.target.value)
                  setShowSuggestions(true)
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-list">
                  {suggestions.map(user => (
                    <div
                      key={user.id}
                      className="suggestion-item"
                      onClick={() => {
                        setUsername(user.login)
                        setShowSuggestions(false)
                        handleSearch(user.login)
                      }}
                    >
                      {user.login}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleAnalyzeClick} className="btn-primary">
                ✨ Analyze
              </button>
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
                      {Array.from(new Set(repos.map(r => r.language).filter(Boolean))).map(lang => (
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
                  {filteredRepos.map(repo => (
                    <div
                      key={repo.id}
                      className="repo-card"
                      onClick={() => handleRepoClick(repo)}
                    >
                      <h3>{repo.name}</h3>
                      <p>{repo.description || 'No description'}</p>
                      <div className="repo-stats">
                        <span>⭐ {repo.stargazers_count}</span>
                        <span>🔀 {repo.forks_count}</span>
                        <span>{repo.language}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {showRepoModal && selectedRepo && (
                <RepoModal
                  repo={selectedRepo}
                  onClose={() => setShowRepoModal(false)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
