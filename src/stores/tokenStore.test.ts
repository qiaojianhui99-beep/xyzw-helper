import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTokenStore } from '@/stores/tokenStore'

// 模拟模块
vi.mock('@vueuse/core', () => ({
  useLocalStorage: vi.fn((key, defaultValue) => {
    if (key === 'gameTokens') return { value: [] }
    if (key === 'selectedTokenId') return { value: '' }
    return { value: defaultValue }
  }),
}))

vi.mock('@/utils/logger', () => ({
  gameLogger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  wsLogger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@/utils/bonProtocol', () => ({
  g_utils: { createGamePacket: vi.fn() },
}))

vi.mock('@/utils/randomSeed', () => ({
  generateRandomSeed: vi.fn(() => 123456),
}))

vi.mock('@/utils/token', () => ({
  transformToken: vi.fn(() => Promise.resolve('decoded-token')),
  scheduleAuthUserRequest: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/utils/wechatForceLogout', () => ({
  roleIndexFromServerId: vi.fn(() => 1),
  refreshTokenFromCombUser: vi.fn(() => Promise.resolve({ token: 'new-token', role: { serverId: 1, roleId: 1 } })),
}))

vi.mock('@/hooks/useIndexedDB', () => ({
  default: () => ({
    getArrayBuffer: vi.fn(() => Promise.resolve(null)),
    storeArrayBuffer: vi.fn(() => Promise.resolve(true)),
    deleteArrayBuffer: vi.fn(() => Promise.resolve(true)),
    clearAll: vi.fn(() => Promise.resolve(true)),
  }),
}))

describe('tokenStore 核心功能', () => {
  let store: any

  beforeEach(() => {
    store = useTokenStore()
  })

  it('should add token successfully', () => {
    const result = store.addToken({
      id: 'test-1',
      name: 'Test Token',
      token: 'base64:abc123',
      server: 'test-server',
    })

    expect(result).toBeDefined()
    expect(result.id).toBe('test-1')
    expect(store.gameTokens.value.length).toBe(1)
  })

  it('should parse base64 token correctly', () => {
    const result = store.parseBase64Token('dGVzdDp0b2tlbg==') // test:token

    expect(result.success).toBe(true)
    expect(result.data.actualToken).toBe('token')
  })

  it('should select token and create connection', () => {
    const token = { id: 'test-1', token: 'base64:abc123' }
    store.gameTokens.value = [token]

    const result = store.selectToken('test-1')

    expect(result).toBe(token)
    expect(store.wsConnections.value['test-1']).toBeDefined()
  })

  it('should remove token and close connection', () => {
    store.gameTokens.value = [{ id: 'test-1', token: 'base64:abc123' }]

    const result = store.removeToken('test-1')

    expect(result).toBe(true)
    expect(store.gameTokens.value.length).toBe(0)
  })

  it('should handle token refresh for URL import', async () => {
    store.gameTokens.value = [{
      id: 'test-1',
      importMethod: 'url',
      sourceUrl: 'https://test.com/token.json',
      token: 'old-token',
    }]

    const result = await store.attemptTokenRefresh('test-1')

    expect(result).toBe(true)
  })

  it('should get web socket status', () => {
    store.wsConnections.value = {
      'test-1': { status: 'connected' },
    }

    expect(store.getWebSocketStatus('test-1')).toBe('connected')
  })

  it('should send message with promise', async () => {
    const mockClient = { sendWithPromise: vi.fn(() => Promise.resolve({ success: true })) }
    store.wsConnections.value = { 'test-1': { client: mockClient, status: 'connected' } }

    const result = await store.sendMessageWithPromise('test-1', 'role_getroleinfo')

    expect(result).toBeDefined()
  })

  it('should handle invalid token parsing', () => {
    const result = store.parseBase64Token('invalid-token')
    expect(result.success).toBe(false)
  })

  it('should upgrade token to permanent', () => {
    store.gameTokens.value = [{ id: 'test-1', importMethod: 'manual' }]

    const result = store.upgradeTokenToPermanent('test-1')

    expect(result).toBe(true)
    expect(store.gameTokens.value[0].upgradedToPermanent).toBe(true)
  })

  it('should clean expired tokens', async () => {
    store.gameTokens.value = [{
      id: 'test-1',
      lastUsed: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      importMethod: 'manual',
    }]

    const count = await store.cleanExpiredTokens()

    expect(count).toBe(1)
  })
})

// 覆盖率关键路径：Base64 解析边界情况
describe('parseBase64Token 边界测试', () => {
  it('should handle empty string', () => {
    const result = useTokenStore().parseBase64Token('')
    expect(result.success).toBe(false)
  })

  it('should handle non-Base64 string', () => {
    const result = useTokenStore().parseBase64Token('plain text token')
    expect(result.success).toBe(true)
  })

  it('should handle JSON wrapped token', () => {
    const result = useTokenStore().parseBase64Token('{"token":"game-token"}')
    expect(result.success).toBe(true)
  })
})

// 覆盖率关键路径：WebSocket 连接管理
describe('createWebSocketConnection 核心逻辑', () => {
  it('should create connection with lock', async () => {
    const store = useTokenStore()
    store.gameTokens.value = [{ id: 'test-1', token: 'base64:abc123' }]

    store.acquireConnectionLock = vi.fn(() => Promise.resolve(true))

    await store.createWebSocketConnection('test-1', 'base64:abc123')

    expect(store.acquireConnectionLock).toHaveBeenCalled()
  })
})

// 覆盖率关键路径：group token management
describe('token group management', () => {
  it('should create, add, remove token from group', () => {
    const store = useTokenStore()
    const group = store.createTokenGroup('test-group')

    expect(group).toBeDefined()

    store.addTokenToGroup(group.id, 'token-1')
    expect(store.getTokenGroups('token-1').length).toBe(1)

    store.removeTokenFromGroup(group.id, 'token-1')
    expect(store.getTokenGroups('token-1').length).toBe(0)
  })
})
