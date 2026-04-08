import ReactMarkdown from "react-markdown";
import FileExplorer from "./FileExplorer";

export default function RepoModal({
  repo,
  readme,
  files,
  openTabs,
  activeTab,
  setActiveTab,
  closeTab,
  onFileClick,
  onClose
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">

      <div className="w-[90%] max-w-6xl bg-[#0d1117] rounded-xl overflow-hidden">

        {/* Top bar */}
        <div className="flex justify-between p-3 bg-[#161b22] border-b border-gray-700">
          <span className="text-sm">{repo.name}</span>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="flex h-130">

          {/* Sidebar */}
          <div className="w-1/3 border-r border-gray-800 p-2 overflow-y-auto">
            <FileExplorer files={files} onFileClick={onFileClick} />
          </div>

          {/* Right Side */}
          <div className="flex-1 flex flex-col">

            {/* 🔥 TABS BAR */}
            <div className="flex bg-[#161b22] border-b border-gray-700 overflow-x-auto">

              {openTabs.map((tab) => (
                <div
                  key={tab.name}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm 
                  ${activeTab === tab.name ? "bg-[#0d1117]" : ""}`}
                  onClick={() => setActiveTab(tab.name)}
                >
                  {tab.name}

                  {/* Close button */}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.name);
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </span>
                </div>
              ))}
            </div>

            {/* 🔥 CONTENT AREA */}
            <div className="flex-1 p-4 overflow-y-auto">

              {activeTab ? (
                <pre className="text-xs whitespace-pre-wrap text-gray-300">
                  {
                    openTabs.find((t) => t.name === activeTab)?.content
                  }
                </pre>
              ) : (
                <div className="prose prose-invert text-sm max-w-none">
                  <ReactMarkdown>{readme}</ReactMarkdown>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* GitHub button */}
        <div className="absolute bottom-4 right-6">
          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer"
            className="bg-indigo-600 px-4 py-2 rounded text-sm"
          >
            Open on GitHub
          </a>
        </div>

      </div>
    </div>
  );
}