/**
 * HTML helpers for OAuth proxy user-facing pages.
 *
 * Auth surfaces use system fonts only — no third-party font CDNs.
 */

export function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Generate the branded "Authentication Successful" page shown after a user
 * completes an OAuth flow in the browser and is told to return to their CLI.
 */
export function getAuthSuccessHtml(email: string): string {
  const safeEmail = htmlEscape(email);
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Legacy Sports - Authentication Successful</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- System fonts only — no third-party font CDN on auth surfaces -->
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background-color: #0A0F1A;
            background-image:
                radial-gradient(ellipse at 50% 0%, rgba(27, 58, 92, 0.4) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 100%, rgba(196, 30, 58, 0.08) 0%, transparent 50%);
            color: #F8FAFC;
        }
        .container {
            background: #16223A;
            padding: 40px 36px;
            border-radius: 12px;
            border: 1px solid #1F2D48;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            max-width: 420px;
            width: 100%;
            text-align: center;
        }
        .logo {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 22px;
            font-weight: 700;
            color: #C5A55A;
            letter-spacing: 0.5px;
            margin-bottom: 28px;
        }
        .logo span { color: #F8FAFC; }
        .success-icon {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: rgba(34, 197, 94, 0.15);
            border: 2px solid #22C55E;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            font-size: 28px;
        }
        .success-title {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 20px;
            font-weight: 700;
            color: #22C55E;
            margin-bottom: 16px;
        }
        p {
            color: #9CAAC5;
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 8px;
        }
        p strong { color: #F8FAFC; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Legacy <span>Sports</span></div>
        <div class="success-icon">&#x2714;</div>
        <div class="success-title">Authentication Successful</div>
        <p>You can now close this browser window and return to your CLI.</p>
        <p>Authenticated as: <strong>${safeEmail}</strong></p>
    </div>
</body>
</html>
  `;
}
