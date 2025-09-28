import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './main.css';

interface GraphQLResponse {
  data?: any;
  errors?: Array<{ message: string; locations?: any; path?: any }>;
}

const App: React.FC = () => {
  const [query, setQuery] = useState(
    `
query {
  # Enter your GraphQL query here
  __schema {
    types {
      name
      kind
    }
  }
}
  `.trim(),
  );

  const [variables, setVariables] = useState('{}');
  const [response, setResponse] = useState<GraphQLResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const GRAPHQL_HOST =
    process.env['GRAPHQL_HOST'] || 'http://localhost:5000/graphql';

  const executeQuery = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      let parsedVariables = {};
      if (variables.trim()) {
        parsedVariables = JSON.parse(variables);
      }

      const response = await fetch(GRAPHQL_HOST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: parsedVariables,
        }),
      });

      const result: GraphQLResponse = await response.json();
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      executeQuery();
    }
  };

  return (
    <div className="graphql-explorer">
      <header className="header">
        <h1>GraphQL Explorer</h1>
        <p>
          Connected to: <code>{GRAPHQL_HOST}</code>
        </p>
      </header>

      <div className="main-content">
        <div className="input-section">
          <div className="query-section">
            <label htmlFor="query">GraphQL Query:</label>
            <textarea
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your GraphQL query here..."
              rows={15}
            />
          </div>

          <div className="variables-section">
            <label htmlFor="variables">Variables (JSON):</label>
            <textarea
              id="variables"
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='{"key": "value"}'
              rows={5}
            />
          </div>

          <div className="controls">
            <button
              onClick={executeQuery}
              disabled={loading}
              className="execute-btn"
            >
              {loading ? 'Executing...' : 'Execute Query (Ctrl+Enter)'}
            </button>
          </div>
        </div>

        <div className="output-section">
          <h3>Response:</h3>
          {error && (
            <div className="error">
              <strong>Error:</strong> {error}
            </div>
          )}
          {response && (
            <div className="response">
              {response.errors && response.errors.length > 0 && (
                <div className="graphql-errors">
                  <strong>GraphQL Errors:</strong>
                  <pre>{formatJson(response.errors)}</pre>
                </div>
              )}
              {response.data && (
                <div className="graphql-data">
                  <strong>Data:</strong>
                  <pre>{formatJson(response.data)}</pre>
                </div>
              )}
            </div>
          )}
          {!response && !error && !loading && (
            <div className="placeholder">
              Execute a query to see the response here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Could not find root element');
}

const root = createRoot(rootEl);
root.render(<App />);
