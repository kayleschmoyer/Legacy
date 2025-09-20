import React from 'react';

export interface TableProps {
  headers: string[];
  data: (string | number | boolean | null)[][];
  title?: string;
  style?: React.CSSProperties;
}

// Lazy-loaded table component for web
export const LazyTable: React.FC<TableProps> = ({
  headers,
  data,
  title,
  style,
}) => {
  return (
    <div style={{ ...style }}>
      {title && <h3>{title}</h3>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                style={{ border: '1px solid #ccc', padding: '8px' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{ border: '1px solid #ccc', padding: '8px' }}
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
