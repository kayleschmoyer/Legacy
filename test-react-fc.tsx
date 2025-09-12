import React from 'react';

interface TestProps {
  name: string;
}

export const TestComponent: React.FC<TestProps> = ({ name }) => {
  return <div>Hello {name}</div>;
};
