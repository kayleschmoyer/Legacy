/**
 * Self-contained HTML for the password-reset surfaces served by the oauth-proxy
 * (LS-6678 / LGN-023). The web app has no email/password login form (web auth
 * is OAuth-only), so these pages are served directly by the lambda — mirroring
 * the existing device-verification page in `handlers/DeviceFlow.ts`.
 *
 * The forms submit JSON via `fetch` to the matching POST endpoints so the
 * handlers can keep a single JSON body contract.
 */

const SHARED_STYLES = `
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
    margin-bottom: 8px;
  }
  .logo span { color: #F8FAFC; }
  h2 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18px;
    font-weight: 700;
    color: #F8FAFC;
    margin-bottom: 16px;
  }
  .instructions { color: #9CAAC5; font-size: 14px; line-height: 1.6; margin: 12px 0; }
  /* Accessible labels kept off-screen — placeholders carry the visual cue. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .message {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
    display: none;
  }
  .message.error {
    background: rgba(196, 30, 58, 0.12);
    border: 1px solid rgba(196, 30, 58, 0.3);
    color: #E63950;
    display: block;
  }
  .message.success {
    background: rgba(197, 165, 90, 0.12);
    border: 1px solid rgba(197, 165, 90, 0.3);
    color: #C5A55A;
    display: block;
  }
  input {
    padding: 12px 14px;
    font-size: 15px;
    background: #0D1526;
    border: 2px solid #1F2D48;
    border-radius: 8px;
    color: #F8FAFC;
    width: 100%;
    margin: 6px 0;
    outline: none;
    transition: border-color 0.2s;
  }
  input:focus { border-color: #C5A55A; }
  input::placeholder { color: #4A5568; }
  button {
    display: inline-block;
    width: 100%;
    padding: 12px 32px;
    font-size: 15px;
    font-weight: 600;
    background: linear-gradient(135deg, #1B3A5C, #2C4A7C);
    color: #F8FAFC;
    border: 1px solid rgba(197, 165, 90, 0.3);
    border-radius: 8px;
    cursor: pointer;
    margin-top: 12px;
    transition: all 0.2s;
  }
  button:hover {
    background: linear-gradient(135deg, #2C4A7C, #3B5A9C);
    border-color: rgba(197, 165, 90, 0.5);
  }
`;

function page(title: string, bodyInner: string, script: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Legacy Sports - ${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="logo">Legacy <span>Sports</span></div>
    ${bodyInner}
  </div>
  <script>${script}</script>
</body>
</html>`;
}

/** Page for requesting a reset link (GET /oauth/forgot-password). */
export function forgotPasswordPageHtml(): string {
  const body = `
    <h2>Forgot your password?</h2>
    <div class="instructions">
      Enter your account email and we'll send you a link to reset your password.
    </div>
    <div class="message" id="msg"></div>
    <form id="form">
      <label class="visually-hidden" for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="Email" autocomplete="email" required />
      <button type="submit">Send reset link</button>
    </form>`;

  const script = `
    const form = document.getElementById('form');
    const msg = document.getElementById('msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'message';
      const email = form.email.value.trim();
      try {
        const res = await fetch('/oauth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (res.ok) {
          form.style.display = 'none';
          msg.className = 'message success';
          msg.textContent = 'If an account exists for that email, a reset link is on its way.';
        } else {
          const data = await res.json().catch(() => ({}));
          msg.className = 'message error';
          msg.textContent = data.error || 'Something went wrong. Please try again.';
        }
      } catch (err) {
        msg.className = 'message error';
        msg.textContent = 'Network error. Please try again.';
      }
    });`;

  return page('Forgot Password', body, script);
}

/**
 * Page for choosing a new password from a reset link
 * (GET /oauth/reset-password?token=...). When the token is missing the form is
 * replaced with an error message.
 */
export function resetPasswordPageHtml(
  hasToken: boolean,
  minLength: number,
): string {
  if (!hasToken) {
    const body = `
      <h2>Reset link invalid</h2>
      <div class="message error" style="display:block;">
        This password-reset link is missing its token. Please request a new link.
      </div>
      <div class="instructions">
        <a href="/oauth/forgot-password" style="color:#C5A55A;">Request a new reset link</a>
      </div>`;
    return page('Reset Password', body, '');
  }

  const body = `
    <h2>Choose a new password</h2>
    <div class="instructions">Your new password must be at least ${minLength} characters.</div>
    <div class="message" id="msg"></div>
    <form id="form">
      <label class="visually-hidden" for="password">New password</label>
      <input type="password" id="password" name="password" placeholder="New password" autocomplete="new-password" minlength="${minLength}" required />
      <label class="visually-hidden" for="confirmPassword">Confirm new password</label>
      <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Confirm new password" autocomplete="new-password" minlength="${minLength}" required />
      <button type="submit">Reset password</button>
    </form>`;

  // The token is read from the query string in the browser so it never has to
  // be templated into the markup server-side.
  const script = `
    const form = document.getElementById('form');
    const msg = document.getElementById('msg');
    const token = new URLSearchParams(window.location.search).get('token') || '';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'message';
      try {
        const res = await fetch('/oauth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            password: form.password.value,
            confirmPassword: form.confirmPassword.value,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          form.style.display = 'none';
          msg.className = 'message success';
          msg.textContent = 'Your password has been reset. You can now log in with your new password.';
        } else {
          msg.className = 'message error';
          msg.textContent = data.error || 'Something went wrong. Please try again.';
        }
      } catch (err) {
        msg.className = 'message error';
        msg.textContent = 'Network error. Please try again.';
      }
    });`;

  return page('Reset Password', body, script);
}
