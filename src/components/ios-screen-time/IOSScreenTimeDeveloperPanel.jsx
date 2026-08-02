import { useCallback, useEffect, useState } from 'react'
import { registerPlugin } from '@capacitor/core'
import './IOSScreenTimeDeveloperPanel.css'
import {
  getIOSScreenTimeStatus,
  isIOSScreenTimeAvailable,
  requestIOSScreenTimeAuthorization,
  startIOSMonitorMiniTest,
  readIOSMonitorMiniStatus,
  readIOSMonitorMiniCallbacks,
  stopIOSMonitorMiniTest,
} from './iosScreenTimeService.js'

const IOSScreenTimeNative = registerPlugin('IOSScreenTime')

const EMPTY_STATUS = {
  available: false,
  status: 'unknown',
  statusLabel: '正在检查',
}

function errorText(error) {
  return String(error?.message || error || '未知错误')
}

function CompactResult({ title, value, height = '180px' }) {
  if (!value) return null

  return (
    <div style={{
      marginTop: '10px',
      padding: '10px 12px',
      border: '1px solid rgba(80, 100, 120, 0.18)',
      borderRadius: '10px',
      background: 'rgba(245, 248, 250, 0.96)',
      overflow: 'hidden',
    }}>
      <strong style={{ display: 'block', marginBottom: '6px' }}>{title}</strong>
      <textarea
        value={JSON.stringify(value, null, 2)}
        readOnly
        aria-label={title}
        spellCheck={false}
        style={{
          display: 'block',
          boxSizing: 'border-box',
          width: '100%',
          height,
          minHeight: height,
          margin: 0,
          padding: '8px',
          border: '1px solid rgba(80, 100, 120, 0.14)',
          borderRadius: '8px',
          background: '#ffffff',
          color: '#39424c',
          resize: 'none',
          overflowY: 'scroll',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '12px',
          lineHeight: 1.45,
        }}
      />
    </div>
  )
}

export default function IOSScreenTimeDeveloperPanel({ date }) {
  const [status, setStatus] = useState(EMPTY_STATUS)
  const [runningAction, setRunningAction] = useState('')
  const [message, setMessage] = useState('')
  const [monitorPreview, setMonitorPreview] = useState(null)

  const runAction = useCallback(async (name, action, onSuccess) => {
    setRunningAction(name)
    setMessage('正在处理，请稍候……')

    try {
      const result = await action()
      if (typeof onSuccess === 'function') onSuccess(result)
      setMessage(result?.message || '操作完成。')
      return result
    } catch (error) {
      setMessage(errorText(error))
      return null
    } finally {
      setRunningAction('')
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    await runAction('status', async () => {
      const result = await getIOSScreenTimeStatus()
      setStatus({ ...EMPTY_STATUS, ...(result || {}) })
      return result
    })
  }, [runAction])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  if (!isIOSScreenTimeAvailable()) return null

  const approved = status.status === 'approved'
  const loading = name => runningAction === name

  const buttonStyle = {
    width: '100%',
    minHeight: '44px',
    padding: '9px 8px',
    borderRadius: '11px',
    fontSize: '15px',
    lineHeight: 1.25,
    whiteSpace: 'normal',
  }

  return (
    <section
      className="iosScreenTimeDeveloperPanel"
      aria-label="苹果离机 Monitor 调试"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        overflow: 'visible',
      }}
    >
      <div className="iosScreenTimeDeveloperHead" style={{ marginBottom: '8px' }}>
        <div>
          <h3 style={{ marginBottom: '4px' }}>离机 Monitor 调试</h3>
          <p style={{ margin: 0 }}>独立验证 Monitor 注册、状态和回调。</p>
        </div>
      </div>

      <div className="iosScreenTimeStatusGrid" style={{ marginBottom: '10px' }}>
        <span>日期</span><strong>{date || '—'}</strong>
        <span>授权</span><strong>{status.statusLabel || status.status || '—'}</strong>
        <span>Monitor</span><strong>单 App / 2分钟后开始 / 1分钟阈值</strong>
      </div>

      {/* Monitor 调试按钮集中放置。 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '8px',
      }}>
        {!approved ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={loading('authorize')}
            onClick={() => runAction(
              'authorize',
              requestIOSScreenTimeAuthorization,
              result => setStatus({ ...EMPTY_STATUS, ...(result || {}) }),
            )}
          >
            {loading('authorize') ? '授权中…' : '授权屏幕时间'}
          </button>
        ) : (
          <button
            type="button"
            style={buttonStyle}
            disabled={loading('status')}
            onClick={refreshStatus}
          >
            {loading('status') ? '刷新中…' : '刷新授权状态'}
          </button>
        )}

        <button
          type="button"
          style={buttonStyle}
          disabled={!approved || loading('selectMonitorApp')}
          onClick={() => runAction(
            'selectMonitorApp',
            () => IOSScreenTimeNative.presentMonitorAppPicker(),
            result => setMonitorPreview(result),
          )}
        >
          {loading('selectMonitorApp') ? '打开中…' : '① 选择测试 App'}
        </button>

        <button
          type="button"
          style={buttonStyle}
          disabled={!approved || loading('monitorStart')}
          onClick={() => runAction(
            'monitorStart',
            startIOSMonitorMiniTest,
            result => setMonitorPreview(result),
          )}
        >
          {loading('monitorStart') ? '注册中…' : '② 注册 Monitor'}
        </button>

        <button
          type="button"
          style={buttonStyle}
          disabled={!approved || loading('monitorStatus')}
          onClick={() => runAction(
            'monitorStatus',
            readIOSMonitorMiniStatus,
            result => setMonitorPreview(result),
          )}
        >
          {loading('monitorStatus') ? '读取中…' : '③ 读取注册状态'}
        </button>

        <button
          type="button"
          style={buttonStyle}
          disabled={!approved || loading('monitorCallbacks')}
          onClick={() => runAction(
            'monitorCallbacks',
            readIOSMonitorMiniCallbacks,
            result => setMonitorPreview(result),
          )}
        >
          {loading('monitorCallbacks') ? '读取中…' : '④ 读取回调'}
        </button>

        <button
          type="button"
          style={buttonStyle}
          disabled={loading('monitorStop')}
          onClick={() => runAction(
            'monitorStop',
            stopIOSMonitorMiniTest,
            result => setMonitorPreview(result),
          )}
        >
          {loading('monitorStop') ? '停止中…' : '⑤ 停止测试'}
        </button>

      </div>

      <p
        className="iosScreenTimeDeveloperMessage"
        style={{
          margin: '10px 0 0',
          minHeight: '22px',
          overflowWrap: 'anywhere',
        }}
      >
        {message || '先选择微信；再注册。等到新区间开始后，只使用微信至少1分钟，再读取回调。'}
      </p>

      {/* Monitor 结果紧跟按钮显示。 */}
      <CompactResult title="Monitor 结果" value={monitorPreview} height="42vh" />

      <p className="iosScreenTimeDeveloperNote" style={{ marginBottom: 0 }}>
        成功标准：selectedApplicationCount=1、systemConfirmed=true；
        最终 callbacks 中出现 eventDidReachThreshold。
      </p>
    </section>
  )
}
