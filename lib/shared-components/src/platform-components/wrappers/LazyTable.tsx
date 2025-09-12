// Lazy-loaded table wrapper for web platform
import React from 'react';

export interface TableProps {
  headers: string[];
  data: Array<Array<string | number>>;
  title?: string;
  style?: React.CSSProperties;
}

// Simple HTML table implementation for web
function LazyTable({
  headers,
  data,
  title,
  style,
}: TableProps) {
  return (
    <div style={{ ...style, marginBottom: 24 }}>
      {title && <h3 style={{ marginBottom: 16, color: '#333' }}>{title}</h3>}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #ddd',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            {headers.map((header, index) => (
              <th
                key={index}
                style={{
                  padding: '12px 8px',
                  textAlign: 'left',
                  borderBottom: '1px solid #ddd',
                  fontWeight: 'bold',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor: rowIndex % 2 === 0 ? '#fff' : '#fafafa',
              }}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{
                    padding: '12px 8px',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export { LazyTable };
