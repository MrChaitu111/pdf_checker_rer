import React, { useState } from "react";
import "./style.css";

export default function App() {
  const [file, setFile] = useState(null);

  // Rule inputs
  const [rule1, setRule1] = useState("");
  const [rule2, setRule2] = useState("");
  const [rule3, setRule3] = useState("");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Dropdown rule options
  const easyRules = [
    "The document must have a purpose section.",
    "The document must mention at least one date.",
    "The document must define at least one term.",
    "The document must mention who is responsible.",
    "The document must list any requirements."
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!file) return setError("Please select a PDF file");

    setLoading(true);

    const form = new FormData();
    form.append("pdf", file);
    form.append("rule1", rule1);
    form.append("rule2", rule2);
    form.append("rule3", rule3);

    try {
      const res = await fetch("http://localhost:8000/api/check", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Server error");
      } else {
        setResults(data.result || data.raw || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <h1 className="app-title">📄 PDF Rule Checker</h1>

      <form onSubmit={handleSubmit}>
        {/* PDF Upload */}
        <label>Upload PDF:</label>
        <input
          type="file"
          className="file-input"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
        />

        {/* Rule Select 1 */}
        <label>Select Rule 1</label>
        <select
          className="text-input"
          onChange={(e) => setRule1(e.target.value)}
        >
          <option value="">-- Select a Rule --</option>
          {easyRules.map((r, i) => (
            <option key={i} value={r}>{r}</option>
          ))}
        </select>

        {/* Rule Select 2 */}
        <label>Select Rule 2</label>
        <select
          className="text-input"
          onChange={(e) => setRule2(e.target.value)}
        >
          <option value="">-- Select a Rule --</option>
          {easyRules.map((r, i) => (
            <option key={i} value={r}>{r}</option>
          ))}
        </select>

        {/* Rule Select 3 */}
        <label>Select Rule 3</label>
        <select
          className="text-input"
          onChange={(e) => setRule3(e.target.value)}
        >
          <option value="">-- Select a Rule --</option>
          {easyRules.map((r, i) => (
            <option key={i} value={r}>{r}</option>
          ))}
        </select>

        <button className="submit-btn" disabled={loading}>
          {loading ? "Checking..." : "Check Document"}
        </button>
      </form>

      {/* Error */}
      {error && <div className="error-box">{error}</div>}

      {/* Results */}
      {results && (
        <>
          <h2 className="results-title">Results</h2>
          <table className="results-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Status</th>
                <th>Evidence</th>
                <th>Reasoning</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.rule}</td>
                  <td className={r.status === "pass" ? "status-pass" : "status-fail"}>
                    {r.status}
                  </td>
                  <td>{r.evidence}</td>
                  <td>{r.reasoning}</td>
                  <td className="center">{r.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
