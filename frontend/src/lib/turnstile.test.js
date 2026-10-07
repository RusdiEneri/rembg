import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyTurnstileToken } from './turnstile.js'

test('verifyTurnstileToken returns error when token is missing', async () => {
  const result = await verifyTurnstileToken({ token: null })
  assert.strictEqual(result.success, false)
  assert.match(result.error, /token.*tidak ditemukan/i)
})

test('verifyTurnstileToken returns error when token is empty string', async () => {
  const result = await verifyTurnstileToken({ token: '   ' })
  assert.strictEqual(result.success, false)
  assert.match(result.error, /token.*tidak ditemukan/i)
})

test('verifyTurnstileToken succeeds with valid test token and test secret', async () => {
  // Cloudflare's always-pass secret key: 1x0000000000000000000000000000000AA
  // Any token passed to this test secret with dummy test token passes on Cloudflare
  const result = await verifyTurnstileToken({
    token: 'XXXX.DUMMY.TOKEN.XXXX',
    secretKey: '1x0000000000000000000000000000000AA',
  })
  assert.strictEqual(result.success, true)
})

test('verifyTurnstileToken fails when Cloudflare rejects the token (using always-fail secret)', async () => {
  // Cloudflare's always-fail secret key: 2x0000000000000000000000000000000AB
  const result = await verifyTurnstileToken({
    token: 'XXXX.DUMMY.TOKEN.XXXX',
    secretKey: '2x0000000000000000000000000000000AB',
  })
  assert.strictEqual(result.success, false)
  assert.ok(result.error)
})
