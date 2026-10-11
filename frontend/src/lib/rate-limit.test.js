import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit } from './rate-limit.js'

test('rate limiter allows requests within threshold', () => {
  const ip = 'test-ip-1'
  const result1 = checkRateLimit(ip, 3, 1000)
  assert.equal(result1.allowed, true)
  assert.equal(result1.remaining, 2)

  const result2 = checkRateLimit(ip, 3, 1000)
  assert.equal(result2.allowed, true)
  assert.equal(result2.remaining, 1)

  const result3 = checkRateLimit(ip, 3, 1000)
  assert.equal(result3.allowed, true)
  assert.equal(result3.remaining, 0)
})

test('rate limiter blocks requests exceeding threshold', () => {
  const ip = 'test-ip-blocked'
  checkRateLimit(ip, 2, 5000)
  checkRateLimit(ip, 2, 5000)

  const blocked = checkRateLimit(ip, 2, 5000)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.remaining, 0)
  assert.ok(blocked.resetMs > 0)
})
