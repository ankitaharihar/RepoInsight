import { useState } from "react";
import axios from "axios";

export default function FileExplorer({ files, onFileClick }) {
  return (
    <div>
      {files.map((file) => (
        <Node key={file.path} file={file} onFileClick={onFileClick} />
      ))}
    </div>
  );
}

function Node({ file, onFileClick }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState([]);

  const getIcon = (name, type) => {
    if (type === "dir") return open ? "📂" : "📁";

    if (name.endsWith(".js")) return "🟨";
    if (name.endsWith(".html")) return "🟧";
    if (name.endsWith(".css")) return "🟦";
    if (name.endsWith(".json")) return "🟫";
    if (name.endsWith(".md")) return "📘";

    return "📄";
  };

  const handleClick = async () => {
    if (file.type === "file") {
      onFileClick(file);
      return;
    }

    setOpen(!open);

    if (!open && children.length === 0) {
      const res = await axios.get(file.url);
      setChildren(res.data);
    }
  };

  return (
    <div className="ml-2">
      <div
        onClick={handleClick}
        className="cursor-pointer px-2 py-1 rounded hover:bg-gray-800 text-sm flex items-center gap-2"
      >
        <span>{getIcon(file.name, file.type)}</span>
        <span>{file.name}</span>
      </div>

      {open && children.length > 0 && (
        <div className="ml-4 border-l border-gray-700 pl-2">
          {children.map((child) => (
            <Node
              key={child.path}
              file={child}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}