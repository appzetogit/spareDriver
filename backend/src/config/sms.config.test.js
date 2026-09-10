import test from 'node:test';
import assert from 'node:assert/strict';

import { isDefaultOtpEnabled } from './sms.config.js';

/**
 * `isTestOtp` gates far more than login: the ride-start and ride-extension
 * checks consult it too, so if the fixed codes ever became live in production
 * any driver could start any customer's trip by typing 1234. The env var is
 * easy to inherit from a copied .env, so production is hard-off regardless.
 */

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('test OTPs are hard-off in production', () => {
  withEnv({ NODE_ENV: 'production', USE_DEFAULT_OTP: 'true' }, () => {
    assert.equal(
      isDefaultOtpEnabled(),
      false,
      'USE_DEFAULT_OTP must not re-enable 1234 in production',
    );
  });
});

test('test OTPs still work outside production when asked for', async (t) => {
  await t.test('development with the flag on', () => {
    withEnv({ NODE_ENV: 'development', USE_DEFAULT_OTP: 'true' }, () => {
      assert.equal(isDefaultOtpEnabled(), true);
    });
  });

  await t.test('development with the flag off', () => {
    withEnv({ NODE_ENV: 'development', USE_DEFAULT_OTP: 'false' }, () => {
      assert.equal(isDefaultOtpEnabled(), false);
    });
  });

  await t.test('no NODE_ENV set, flag on', () => {
    withEnv({ NODE_ENV: undefined, USE_DEFAULT_OTP: 'true' }, () => {
      assert.equal(isDefaultOtpEnabled(), true);
    });
  });

  await t.test('only the exact string "true" counts', () => {
    for (const v of ['1', 'yes', 'TRUE', '']) {
      withEnv({ NODE_ENV: 'development', USE_DEFAULT_OTP: v }, () => {
        assert.equal(isDefaultOtpEnabled(), false, `"${v}" must not enable test OTPs`);
      });
    }
  });
});
