import React from 'react';

export interface TableProps {
  headers: string[];
  data: Array<Array<string | number>>;
  title?: string;
  style?: React.CSSProperties;
}

// Web-specific table implementation using HTML
const WebTable: React.FC<TableProps> = ({ headers, data, title, style }) => {
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
                  borderBottom: '2px solid #ddd',
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
            <tr key={rowIndex} style={{ borderBottom: '1px solid #eee' }}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{
                    padding: '10px 8px',
                    borderRight:
                      cellIndex < row.length - 1 ? '1px solid #eee' : 'none',
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

export default WebTable;
