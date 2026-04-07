#!/usr/bin/env node
// download-runner-lambdas.js
//
// Downloads the three Lambda zip files required by the github-aws-runners
// Terraform module. The module version is read from terraform/runners/github-runners.tf
// so this script always downloads the version that matches what is deployed.
//
// Usage:
//   node scripts/download-runner-lambdas.js          # auto-detect version
//   node scripts/download-runner-lambdas.js 7.6.0    # override version
//
// Called by `make runner-lambdas-sync`. Run this after bumping the module
// version in terraform/runners/github-runners.tf before running terraform init/apply.

'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const REPO = 'github-aws-runners/terraform-aws-github-runner';
const ZIPS = ['webhook.zip', 'runners.zip', 'runner-binaries-syncer.zip'];
const OUT_DIR = path.join(__dirname, '..', 'terraform', 'runners', 'lambdas');

// ── Version detection ────────────────────────────────────────────────────────

function detectVersion() {
  const tfPath = path.join(
    __dirname,
    '..',
    'terraform',
    'runners',
    'github-runners.tf',
  );
  const content = fs.readFileSync(tfPath, 'utf8');
  // Match the version = "x.y.z" line that follows the github-aws-runners source.
  // The source and version lines appear consecutively in the module block.
  const match = content.match(
    /source\s*=\s*"github-aws-runners\/github-runner\/aws"[\s\S]*?version\s*=\s*"([\d]+\.[\d]+\.[\d]+(?:-[a-zA-Z0-9.]+)?)"/,
  );
  if (!match) {
    throw new Error(
      'Could not find github-aws-runners module version in terraform/runners/github-runners.tf.\n' +
        'Pass the version explicitly: node scripts/download-runner-lambdas.js <version>',
    );
  }
  return match[1];
}

// ── Download helpers ─────────────────────────────────────────────────────────

const MAX_REDIRECTS = 10;

/**
 * Resolve the final URL after following up to MAX_REDIRECTS HTTP redirects,
 * then stream the response body to `dest`. The write stream is created only
 * after the final non-redirect URL is reached so that a redirect never leaves
 * a half-written file or a dangling open handle.
 */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, redirectCount) {
      const req = https
        .get(currentUrl, (res) => {
          // Follow redirects before touching the file system.
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            res.resume(); // drain response so the socket can be reused
            if (redirectCount >= MAX_REDIRECTS) {
              reject(
                new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`),
              );
              return;
            }
            // Resolve relative Location headers against the current URL.
            if (!res.headers.location) {
              reject(
                new Error(
                  `Redirect ${res.statusCode} with no Location header for ${currentUrl}`,
                ),
              );
              return;
            }
            const location = new URL(
              res.headers.location,
              currentUrl,
            ).toString();
            get(location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
            return;
          }

          // Final URL reached — write to a temp file then rename atomically
          // so a failed download never leaves a partial file at `dest`.
          const tmp = dest + '.tmp';
          const file = fs.createWriteStream(tmp);

          const cleanup = () => {
            file.destroy();
            try {
              fs.rmSync(tmp, { force: true });
            } catch {
              // best-effort cleanup
            }
          };

          res.pipe(file);
          file.on('finish', () =>
            file.close((err) => {
              if (err) {
                cleanup();
                reject(err);
                return;
              }
              try {
                fs.renameSync(tmp, dest);
              } catch (renameErr) {
                cleanup();
                reject(renameErr);
                return;
              }
              resolve();
            }),
          );
          file.on('error', (err) => {
            cleanup();
            reject(err);
          });
          res.on('error', (err) => {
            cleanup();
            reject(err);
          });
        })
        .on('error', (err) => {
          reject(err);
        });
      req.setTimeout(30000, () => {
        req.destroy(new Error(`Request timeout for ${currentUrl}`));
      });
    }

    get(url, 0);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const version = process.argv[2] || detectVersion();
  console.log(`Downloading runner Lambda zips for v${version}...`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const base = `https://github.com/${REPO}/releases/download/v${version}`;

  for (const zip of ZIPS) {
    const url = `${base}/${zip}`;
    const dest = path.join(OUT_DIR, zip);
    process.stdout.write(`  ${zip}... `);
    await download(url, dest);
    const size = Math.round(fs.statSync(dest).size / 1024);
    console.log(`${size} KB`);
  }

  console.log(
    `\nRunner Lambda zips ready in terraform/runners/lambdas/ (v${version})`,
  );
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
