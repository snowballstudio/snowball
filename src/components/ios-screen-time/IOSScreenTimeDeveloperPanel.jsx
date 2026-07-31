import { useCallback, useEffect, useState } from 'react'
import './IOSScreenTimeDeveloperPanel.css'
import {
  getIOSScreenTimeStatus,
  isIOSScreenTimeAvailable,
  openIOSScreenTimeReport,
  readIOSScreenTimeData,
  requestIOSScreenTimeAuthorization,
  startIOSMonitorMiniTest,
  readIOSMonitorMiniStatus,
  readIOSMonitorMiniCallbacks,
  stopIOSMonitorMiniTest,
} from './iosScreenTimeService.js'
import { normalizeIOSScreenTimePayload } from './screenTimeDataService.js'

const EMPTY_STATUS = {
  available: false,
  status: 'unknown',
  statusLabel: '正在检查',
}

function errorText(error) {
  return String(error?.message || error || '未知错误')
}

function CompactResult({ title, value }) {
  if (!value) return null

  return (
    <div style={{
      marginTop: '10px',
      padding: '10px 12px',
      border: '1px solid rgba(80, 100, 120, 0.18)',
      borderRadius: '10px',
      background: 'rgba(245, 248, 250, 0.96)',
    }}>
      <strong style={{ display: 'block', marginBottom: '6px' }}>{title}</strong>
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        maxHeight: '180px',
        overflowY: 'auto',
        fontSize: '12px',
        lineHeight: 1.45,
      }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export default function IOSScreenTimeDeveloperPanel({ date }) {
  const [status, setStatus] = useState(EMPTY_STATUS)
  const [runningAction, setRunningAction] = useState('')
  const [message, setMessage] = useState('')
  const [reportPreview, setReportPreview] = useState(null)
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
      aria-label="苹果屏幕时间数据"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        overflow: 'visible',
      }}
    >
      <div className="iosScreenTimeDeveloperHead" style={{ marginBottom: '8px' }}>
        <div>
          <h3 style={{ marginBottom: '4px' }}>苹果屏幕时间测试</h3>
          <p style={{ margin: 0 }}>Report 与 Monitor 分开验证。</p>
        </div>
      </div>

      <div className="iosScreenTimeStatusGrid" style={{ marginBottom: '10px' }}>
        <span>日期</span><strong>{date || '—'}</strong>
        <span>授权</span><strong>{status.statusLabel || status.status || '—'}</strong>
        <span>Monitor</span><strong>1 Activity / 1 Event / 1分钟</strong>
      </div>

      {/* 所有关键按钮放在最前面，保证一屏内可见。 */}
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
          disabled={!approved || loading('monitorStart')}
          onClick={() => runAction(
            'monitorStart',
            startIOSMonitorMiniTest,
            result => setMonitorPreview(result),
          )}
        >
          {loading('monitorStart') ? '注册中…' : '① 注册 Monitor'}
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
          {loading('monitorStatus') ? '读取中…' : '② 读取注册状态'}
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
          {loading('monitorCallbacks') ? '读取中…' : '③ 读取回调'}
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
          {loading('monitorStop') ? '停止中…' : '④ 停止测试'}
        </button>

        <button
          type="button"
          style={buttonStyle}
          disabled={!approved || loading('openReport')}
          onClick={() => runAction(
            'openReport',
            () => openIOSScreenTimeReport(date),
          )}
        >
          {loading('openReport') ? '打开中…' : '打开当天系统报告'}
        </button>

        <button
          type="button"
          style={buttonStyle}
          disabled={!approved || loading('readReport')}
          onClick={() => runAction(
            'readReport',
            async () => {
              const result = await readIOSScreenTimeData({
                startDate: date,
                days: 1,
                cutoffHour: 5,
                minimumActivitySeconds: 10,
              })
              return normalizeIOSScreenTimePayload(result)
            },
            result => setReportPreview(result),
          )}
        >
          {loading('readReport') ? '读取中…' : '读取当天正式数据'}
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
        {message || '请先注册，再读取系统状态；使用手机1分钟后读取回调。'}
      </p>

      {/* 结果紧跟按钮，不再藏到页面最下方。 */}
      <CompactResult title="Monitor 结果" value={monitorPreview} />
      <CompactResult title="正式报告结果" value={reportPreview} />

      <p className="iosScreenTimeDeveloperNote" style={{ marginBottom: 0 }}>
        成功标准：systemConfirmed=true；最终 callbacks 中出现
        eventDidReachThreshold。
      </p>
    </section>
  )
}
