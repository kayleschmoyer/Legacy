import React from 'react';

/**
 * GlobalAnnouncer
 * A single, app-wide aria-live region for screen reader announcements.
 * Use the `announcePolite` helper to dispatch messages.
 */
export function GlobalAnnouncer() {
  const [message, setMessage] = React.useState<string>('');
  const [seq, setSeq] = React.useState(0);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const detail = custom.detail ?? '';
      // Toggle key to ensure SR reads repeated messages
      setSeq((s) => s + 1);
      setMessage(String(detail));
    };
    window.addEventListener('app-announce-polite', handler as EventListener);
    return () => window.removeEventListener('app-announce-polite', handler as EventListener);
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      // Use sr-only class from global CSS
      className="sr-only"
      data-announcer-seq={seq}
    >
      {message}
    </div>
  );
}

export default GlobalAnnouncer;
