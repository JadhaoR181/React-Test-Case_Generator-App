import { useEffect, useRef, useState } from "react";
import axios from "axios";
import './App.css';
import ReactMarkdown from "react-markdown";

function App() {
  const [msg, setMsg] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState({});
  const [loadingTestCodeIndex, setLoadingTestCodeIndex] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  const summaryRef = useRef(null);

  useEffect(() => {
    axios.get("https://react-test-case-generator-app.onrender.com/")
      .then(res => setMsg(res.data.message))
      .catch(err => console.error(err));
  }, []);

  const fetchFiles = async () => {
    setHasFetched(true); 
    const [owner, repo] = repoInput.split("/");
    if (!owner || !repo) {
      alert("Enter repo as owner/repo (e.g., facebook/react)");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get("https://react-test-case-generator-app.onrender.com/list-files", {
        params: { owner, repo }
      });

      const fileList = res.data.files || [];
      setFiles(fileList);
      setSelectedFiles([]);
      setSummaries([]);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch files");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (filePath) => {
    setSelectedFiles(prev =>
      prev.includes(filePath)
        ? prev.filter(f => f !== filePath)
        : [...prev, filePath]
    );
  };

  const handleGenerateSummaries = async () => {
    if (selectedFiles.length === 0) {
      alert("Select at least one file.");
      return;
    }

    setSummaryLoading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.floor(Math.random() * 10) + 5;
      });
    }, 200);

    try {
      const res = await axios.post("https://react-test-case-generator-app.onrender.com/generate-test-summaries", {
        repoUrl: `https://github.com/${repoInput}`,
        selectedFiles: selectedFiles
      });

      setSummaries(res.data.summaries || []);

      setTimeout(() => {
        summaryRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    } catch (err) {
      console.error(err);
      alert("Failed to generate summaries");
    } finally {
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        setSummaryLoading(false);
        setProgress(0);
      }, 500);
    }
  };

  const handleGenerateTestCode = async (summary, filePath, index) => {
    setLoadingTestCodeIndex(index);

    try {
      const response = await fetch("https://react-test-case-generator-app.onrender.com/generate-test-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repoUrl: `https://github.com/${repoInput}`,
          filePath,
          summary
        })
      });

      const data = await response.json();
      setGeneratedCodes((prev) => ({ ...prev, [index]: data.testCode || "No code generated." }));
    } catch (error) {
      setGeneratedCodes((prev) => ({ ...prev, [index]: "Failed to generate test code." }));
    }

    setLoadingTestCodeIndex(null);
  };

  const handleCopyCode = async (code, index) => {
  try {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500); // Reset after 1.5s
  } catch (err) {
    console.error("Failed to copy:", err);
  }
};

const handleCreatePR = async (code, fileName) => {
  try {
    const response = await fetch("https://react-test-case-generator-app.onrender.com/create-pr/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code_content: code,
        file_name: fileName,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      alert("✅ PR created! View it here:\n" + data.pr_url);
    } else {
      alert("❌ Failed to create PR: " + data.detail);
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
};

  const ExpandableText = ({ content, maxLines = 6 }) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded(!expanded);

  return (
    <div className={`expandable-text ${expanded ? "expanded" : ""}`}>
      <ReactMarkdown>
        {expanded ? content : content.split("\n").slice(0, maxLines).join("\n")}

      </ReactMarkdown>
      {content.split("\n").length > maxLines && (
        <span className="read-more" onClick={toggle}>
          {expanded ? "Read less" : "Read more"}
        </span>
      )}
    </div>
  );
};


  return (
    <>
      <div className="dark-toggle">
        <label className="switch">
          <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
          <span className="slider"></span>
        </label>
        <span className="toggle-label">{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
      </div>

      <div className="content">
        <h1 className="app-title">
          <span className="icon-wrapper">
            <svg className="code-check-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
              <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <polyline className="checkmark" points="24,34 30,40 44,26" />
                <rect x="8" y="8" width="48" height="48" rx="6" ry="6" className="code-box" />
                <path d="M22 24 L16 32 L22 40" className="code-bracket" />
                <path d="M42 24 L48 32 L42 40" className="code-bracket" />
              </g>
            </svg>
          </span>
          Test Case Generator <span className="status-msg">({msg})</span>
        </h1>

        <div className="repo-input">
          <input
            type="text"
            placeholder="Enter GitHub repo (e.g. facebook/react)"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
          />
          <button onClick={fetchFiles}>Fetch Files</button>
        </div>

        {loading ? (
          <div className="loader"></div>
        ) : (
          <>
            {files.length > 0 && (
              <>
                <div className="file-list">
                  {files.map((file, index) => (
                    <div className="file-card" key={index}>
                      <input
                        type="checkbox"
                        id={`file-${index}`}
                        value={file}
                        checked={selectedFiles.includes(file)}
                        onChange={() => handleCheckboxChange(file)}
                      />
                      <label htmlFor={`file-${index}`}>{file}</label>
                    </div>
                  ))}
                </div>

                <div className="generate-button">
                  {summaryLoading ? (
                    <div className="progress-container">
                      <div className="progress-bar" style={{ width: `${progress}%` }}>{progress}%</div>
                    </div>
                  ) : (
                    <button
                      onClick={handleGenerateSummaries}
                      disabled={selectedFiles.length === 0}
                    >
                      Generate Summaries
                    </button>
                  )}
                </div>
              </>
            )}

            {summaries.length > 0 && (
              <div className="summary-section" ref={summaryRef}>
                <h2>Test Case Summaries</h2>
                <div className="summary-cards">
                  {summaries.map((summary, index) => {
                    const [filePart, ...summaryParts] = summary.split(":");
                    const fileName = filePart.replace(/\*\*/g, "").trim();
                    const testSummary = summaryParts.join(":").trim();
                    const generatedCode = generatedCodes[index];

                    return (
                      <div key={index} className="summary-card">
                        <h3>{fileName}</h3>
<ExpandableText content={testSummary} maxLines={6} />


                        <div className="generate-code-button">
                          {loadingTestCodeIndex === index ? (
                            <div className="loading-bar-container">
                              <div className="loading-bar"></div>
                            </div>
                          ) : (
                            <button onClick={() => handleGenerateTestCode(summary, fileName, index)}>
                              Generate Test Code
                            </button>
                          )}
                        </div>

                    {generatedCode && (
  <div className="generated-code-block">
    <div className="generated-code-header">
      <h4>Generated Code:</h4>
      <button
  className="create-pr-button"
  onClick={() => handleCreatePR(generatedCode, fileName)}
>
  🛠️ Create Pull Request
</button>

      <button
        className="copy-button"
        onClick={() => handleCopyCode(generatedCode, index)}
      >
        {copiedIndex === index ? "✅ Copied" : "📋 Copy"}
      </button>
    </div>
    
    <div className="scrollable-code">
      <pre><code>{generatedCode}</code></pre>
    </div>
  </div>
)}

                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default App;
