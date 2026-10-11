import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getRandomPublicIp,
  isPrivateOrLocalIp,
  resolveForwardedIp,
  getHfToken,
  buildHfHeaders,
  cleanGradioErrorMessage,
} from './hf-inference.js'

test('getRandomPublicIp produces a valid non-private IPv4 address', () => {
  for (let i = 0; i < 20; i++) {
    const ip = getRandomPublicIp()
    assert.match(ip, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
    assert.equal(isPrivateOrLocalIp(ip), false, `Generated IP ${ip} should not be private`)
  }
})

test('isPrivateOrLocalIp accurately classifies IP addresses', () => {
  assert.equal(isPrivateOrLocalIp('127.0.0.1'), true)
  assert.equal(isPrivateOrLocalIp('::1'), true)
  assert.equal(isPrivateOrLocalIp('localhost'), true)
  assert.equal(isPrivateOrLocalIp('192.168.1.50'), true)
  assert.equal(isPrivateOrLocalIp('10.0.0.1'), true)
  assert.equal(isPrivateOrLocalIp('172.20.10.2'), true)

  assert.equal(isPrivateOrLocalIp('36.68.10.20'), false)
  assert.equal(isPrivateOrLocalIp('114.120.5.1'), false)
  assert.equal(isPrivateOrLocalIp('180.240.1.1'), false)
})

test('resolveForwardedIp returns public IP for private local requests', () => {
  const reqLocal = {
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  }
  const resolved = resolveForwardedIp(reqLocal)
  assert.equal(isPrivateOrLocalIp(resolved), false)

  const reqPublic = {
    headers: new Headers({
      'cf-connecting-ip': '114.120.5.1',
    }),
  }
  assert.equal(resolveForwardedIp(reqPublic), '114.120.5.1')
})

test('getHfToken supports single and multiple rotated tokens', () => {
  const originalTokens = process.env.HF_TOKENS
  const originalToken = process.env.HF_TOKEN

  try {
    process.env.HF_TOKENS = 'token_a, token_b, token_c'
    delete process.env.HF_TOKEN

    const tokensSeen = new Set()
    for (let i = 0; i < 30; i++) {
      tokensSeen.add(getHfToken())
    }
    assert.ok(tokensSeen.has('token_a'))
    assert.ok(tokensSeen.has('token_b'))
    assert.ok(tokensSeen.has('token_c'))
  } finally {
    if (originalTokens) process.env.HF_TOKENS = originalTokens
    else delete process.env.HF_TOKENS

    if (originalToken) process.env.HF_TOKEN = originalToken
    else delete process.env.HF_TOKEN
  }
})

test('buildHfHeaders includes authorization and IP forwarding headers', () => {
  const headersWithToken = buildHfHeaders({ token: 'hf_test_123', clientIp: '114.120.5.1' })
  assert.equal(headersWithToken.Authorization, 'Bearer hf_test_123')
  assert.equal(headersWithToken['X-Forwarded-For'], '114.120.5.1')
  assert.equal(headersWithToken['CF-Connecting-IP'], '114.120.5.1')

  const headersNoToken = buildHfHeaders({ token: '', clientIp: '180.240.1.1' })
  assert.equal(headersNoToken.Authorization, undefined)
  assert.equal(headersNoToken['X-Forwarded-For'], '180.240.1.1')
})

test('cleanGradioErrorMessage formats raw JSON errors into user-friendly text', () => {
  const rawZeroGpuError = JSON.stringify({
    error: 'You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging Face token for more quota',
    title: 'ZeroGPU quota exceeded',
  })
  const cleaned = cleanGradioErrorMessage(rawZeroGpuError)
  assert.ok(cleaned.includes('Batas kuota gratis ZeroGPU Hugging Face sedang tercapai'))

  const regularJsonError = JSON.stringify({ error: 'Image file corrupted' })
  assert.equal(cleanGradioErrorMessage(regularJsonError), 'Image file corrupted')

  const plainError = 'Network timeout occurred'
  assert.equal(cleanGradioErrorMessage(plainError), 'Network timeout occurred')
})
