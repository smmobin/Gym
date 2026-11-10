import { describe, expect, it } from 'vitest'

import {
  buildReadParams,
  extractRequestIds,
  isTailPage,
  lineLevel,
  olderOffset,
  preciseDetail,
  precisePayloadMarkup,
  viewerMessage,
  viewerStateFromStatus,
} from '../assets/js/dev-logs-logic.js'

describe('dev log viewer state', () => {
  it('404 means the viewer is off', () => {
    expect(viewerStateFromStatus(404)).toBe('off')
    expect(viewerMessage('off')).toContain('خاموش')
    expect(viewerMessage('off')).toContain('DEV_LOG_VIEWER')
  })

  it('401/403 means the token was rejected', () => {
    expect(viewerStateFromStatus(401)).toBe('unauthorized')
    expect(viewerStateFromStatus(403)).toBe('unauthorized')
    expect(viewerMessage('unauthorized')).toContain('توکن')
  })

  it('builds tail query without offset and keeps filters', () => {
    expect(
      buildReadParams({ file: 'error', q: ' boom ', level: 'ERROR', rid: 'abc' }),
    ).toEqual({
      file: 'error',
      limit: '400',
      q: 'boom',
      level: 'ERROR',
      rid: 'abc',
    })
    expect(buildReadParams({ file: 'access', offset: 0 }).offset).toBe('0')
  })

  it('pages older lines and detects a tail window', () => {
    expect(olderOffset(400, 400)).toBe(0)
    expect(olderOffset(50, 400)).toBe(0)
    expect(olderOffset(900, 400)).toBe(500)
    expect(isTailPage({ offset: 10, lines: [{ line: 1 }, { line: 2 }], total_matched: 12 })).toBe(true)
    expect(isTailPage({ offset: 0, lines: [{ line: 1 }], total_matched: 12 })).toBe(false)
  })

  it('renders a detail pre even when the stored payload is empty', () => {
    const item = {
      action: 'auth.login.failure',
      source: 'audit',
      category: 'auth',
      outcome: 'fail',
      payload: null,
      request_id: 'abc12345',
      summary: 'ورود ناموفق',
    }
    const detail = preciseDetail(item)
    expect(detail.action).toBe('auth.login.failure')
    expect(detail.request_id).toBe('abc12345')
    const html = precisePayloadMarkup(item)
    expect(html).toContain('dev-precise-payload')
    expect(html).toContain('auth.login.failure')
    expect(precisePayloadMarkup({ ...item, payload: {} })).toContain('request_id')
  })

  it('reads level and request id from a log line', () => {
    const line = '2026-11-10 INFO gym.access [rid=abc12345-def] method=GET'
    expect(lineLevel(line)).toBe('INFO')
    expect(extractRequestIds(line)).toEqual(['abc12345-def'])
  })
})
