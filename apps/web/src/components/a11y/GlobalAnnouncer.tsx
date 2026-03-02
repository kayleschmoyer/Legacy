import React from 'react';

/**
 * GlobalAnnouncer
 * App-wide aria-live regions for screen reader announcements.
 * Use `announcePolite` for non-urgent updates and `announceAssertive` for urgent ones.
 */
export function GlobalAnnouncer() {
  const [politeMessage, setPoliteMessage] = React.useState<string>('');
  const [politeSeq, setPoliteSeq] = React.useState(0);
  const [assertiveMessage, setAssertiveMessage] = React.useState<string>('');
  const [assertiveSeq, setAssertiveSeq] = React.useState(0);

  React.useEffect(() => {
    const politeHandler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const detail = custom.detail ?? '';
      setPoliteSeq((s) => s + 1);
      setPoliteMessage(String(detail));
    };
    const assertiveHandler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const detail = custom.detail ?? '';
      setAssertiveSeq((s) => s + 1);
      setAssertiveMessage(String(detail));
    };
    window.addEventListener(
      'app-announce-polite',
      politeHandler as EventListener,
    );
    window.addEventListener(
      'app-announce-assertive',
      assertiveHandler as EventListener,
    );
    return () => {
      window.removeEventListener(
        'app-announce-polite',
        politeHandler as EventListener,
      );
      window.removeEventListener(
        'app-announce-assertive',
        assertiveHandler as EventListener,
      );
    };
  }, []);

  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-announcer-seq={politeSeq}
      >
        {politeMessage}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-announcer-seq={assertiveSeq}
      >
        {assertiveMessage}
      </div>
    </>
  );
}

export default GlobalAnnouncer;
