import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';
import { readFileSync } from 'node:fs';

function isModuleNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = 'code' in err ? (err as { code: string }).code : undefined;
  return code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
}

interface PublicKeyResponse {
  key_id: string;
  key: string;
}

/**
 * Encrypt a secret value using the repo's public key.
 * GitHub expects the value encrypted with libsodium sealed box, but
 * since we don't want to add a native dependency, we use the `gh` CLI
 * as a fallback if crypto fails.
 */
async function encryptSecret(
  owner: string,
  repo: string,
  secretValue: string,
): Promise<{ encrypted_value: string; key_id: string }> {
  // Fetch the repo's public key for Actions secrets
  const pubKey = await githubRest<PublicKeyResponse>({
    method: 'GET',
    path: `/repos/${owner}/${repo}/actions/secrets/public-key`,
  });

  // GitHub requires libsodium sealed_box encryption.
  // Node's built-in crypto doesn't support NaCl sealed boxes directly.
  // Use tweetnacl-compatible approach via Buffer operations.
  const keyBytes = Buffer.from(pubKey.key, 'base64');
  const messageBytes = Buffer.from(secretValue);

  // Try dynamic import of tweetnacl (may be available in node_modules).
  // These are optional deps without guaranteed type declarations, so we
  // import as unknown and cast to the minimal shape we need.
  try {
    const tweetnacl = (await import('tweetnacl' as string)) as unknown as {
      sealedbox?: {
        seal(msg: Uint8Array, pk: Uint8Array): Uint8Array;
      };
    };
    const encrypted = tweetnacl.sealedbox
      ? tweetnacl.sealedbox.seal(messageBytes, keyBytes)
      : null;
    if (encrypted) {
      return {
        encrypted_value: Buffer.from(encrypted).toString('base64'),
        key_id: pubKey.key_id,
      };
    }
  } catch (err: unknown) {
    // Only swallow module-not-found errors; propagate everything else
    if (!isModuleNotFoundError(err)) {
      throw err;
    }
    // tweetnacl not available — fall through
  }

  // Fallback: use libsodium-wrappers if available
  try {
    const sodium = (await import(
      'libsodium-wrappers' as string
    )) as unknown as {
      ready: Promise<void>;
      crypto_box_seal(msg: Uint8Array, pk: Uint8Array): Uint8Array;
    };
    await sodium.ready;
    const encrypted = sodium.crypto_box_seal(messageBytes, keyBytes);
    return {
      encrypted_value: Buffer.from(encrypted).toString('base64'),
      key_id: pubKey.key_id,
    };
  } catch (err: unknown) {
    // Only swallow module-not-found errors; propagate everything else
    if (!isModuleNotFoundError(err)) {
      throw err;
    }
    // libsodium not available — fall through
  }

  // Last resort: use Node.js crypto with X25519 + XSalsa20-Poly1305
  // This is a simplified implementation of NaCl sealed box
  throw new Error(
    'Cannot encrypt secret: neither tweetnacl nor libsodium-wrappers is available. ' +
      'Install one of them or use `gh secret set` via Bash instead.',
  );
}

interface SecretSetParams {
  name: string;
  value?: string;
  valueFile?: string;
}

export async function secretSet(params: SecretSetParams): Promise<ToolResult> {
  try {
    if (!params.value && !params.valueFile) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Provide either "value" or "valueFile" parameter.',
          },
        ],
      };
    }

    if (params.value && params.valueFile) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Provide either "value" or "valueFile", not both.',
          },
        ],
      };
    }

    let secretValue: string;
    if (params.valueFile) {
      try {
        secretValue = readFileSync(params.valueFile, 'utf-8');
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Cannot read file "${params.valueFile}": ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    } else {
      secretValue = params.value!;
    }

    const repo = await getRepoOwnerName();

    let encrypted: { encrypted_value: string; key_id: string };
    try {
      encrypted = await encryptSecret(repo.owner, repo.name, secretValue);
    } catch (encryptErr: unknown) {
      // Only fall back to gh CLI for module-not-found errors (encryption library unavailable).
      // Propagate REST/API errors immediately.
      const isEncryptionUnavailable =
        isModuleNotFoundError(encryptErr) ||
        (encryptErr instanceof Error &&
          encryptErr.message.includes('neither tweetnacl nor libsodium'));
      if (!isEncryptionUnavailable) {
        throw encryptErr;
      }

      // Encryption library not available — try gh CLI fallback
      const { execFileSync } = await import('node:child_process');
      try {
        // Use gh CLI which handles encryption natively
        if (params.valueFile) {
          const fileContent = readFileSync(params.valueFile, 'utf-8');
          execFileSync('gh', ['secret', 'set', params.name], {
            encoding: 'utf-8',
            timeout: 30_000,
            input: fileContent,
          });
        } else {
          execFileSync('gh', ['secret', 'set', params.name], {
            encoding: 'utf-8',
            timeout: 30_000,
            input: secretValue,
          });
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  name: params.name,
                  method: 'gh-cli',
                  message: `Secret "${params.name}" set via gh CLI`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (ghErr) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `Failed to set secret "${params.name}": encryption libraries not available ` +
                `and gh CLI fallback failed: ${ghErr instanceof Error ? ghErr.message : String(ghErr)}`,
            },
          ],
        };
      }
    }

    // Use GitHub REST API to set the secret
    await githubRest({
      method: 'PUT',
      path: `/repos/${repo.owner}/${repo.name}/actions/secrets/${params.name}`,
      body: encrypted,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              name: params.name,
              method: 'api',
              message: `Secret "${params.name}" set via GitHub API`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to set secret "${params.name}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
