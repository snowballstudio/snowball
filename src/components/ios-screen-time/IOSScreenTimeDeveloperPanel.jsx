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

function JsonPreview({ value }) {
  if (!value) return null
  return (
    <pre
      className="iosScreenTimeDeveloperMessage"
      style={{ whiteSpace: 'pre-wrap', maxHeight: '360px', overflow: 'auto' }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function IOSScreenTimeDeveloperPanel({ date }) {
  const [status, setStatus] = useState(EMPTY_STATUS)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(null)
  const [monitorPreview, setMonitorPreview] = useState(null)

  const refreshStatus = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      const result = await getIOSScreenTimeStatus()
      setStatus({ ...EMPTY_STATUS, ...(result || {}) })
    } catch (error) {
      setStatus({
        available: isIOSScreenTimeAvailable(),
        status: 'error',
        statusLabel: '检查失败',
      })
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  async function run(action, successText = '') {
    setBusy(true)
    setMessage('')
    try {
      const result = await action()
      setMonitorPreview(result)
      setMessage(successText || result?.message || '操作完成。')
      return result
    } catch (error) {
      setMessage(errorText(error))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function authorize() {
    setBusy(true)
    setMessage('')
    try {
      const result = await requestIOSScreenTimeAuthorization()
      setStatus({ ...EMPTY_STATUS, ...(result || {}) })
      setMessage(result?.status === 'approved' ? '授权成功。' : '系统没有批准授权。')
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  async function openReport() {
    setBusy(true)
    setMessage('')
    try {
      await openIOSScreenTimeReport(date)
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  async function readData() {
    setBusy(true)
    setMessage('')
    setPreview(null)
    try {
      const result = await readIOSScreenTimeData({
        startDate: date,
        days: 1,
        cutoffHour: 5,
        minimumActivitySeconds: 10,
      })
      const normalized = normalizeIOSScreenTimePayload(result)
      setPreview(normalized)
      setMessage(normalized?.days?.length ? '当天正式数据读取成功。' : '当天没有返回数据。')
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  if (!isIOSScreenTimeAvailable()) return null

  const approved = status.status === 'approved'

  return (
    <section className="iosScreenTimeDeveloperPanel" aria-label="苹果屏幕时间数据">
      <div className="iosScreenTimeDeveloperHead">
        <div>
          <h3>苹果屏幕时间数据</h3>
          <p>Report与Monitor分开验证；Monitor状态直接从苹果系统反查。</p>
        </div>
        <button type="button" onClick={refreshStatus} disabled={busy}>刷新授权</button>
      </div>

      <div className="iosScreenTimeStatusGrid">
        <span>日期</span><strong>{date || '—'}</strong>
        <span>授权状态</span><strong>{status.statusLabel || status.status || '—'}</strong>
        <span>Monitor测试</span><strong>1 Activity / 1 Event / 1分钟</strong>
      </div>

      <div className="iosScreenTimeDeveloperActions">
        {!approved && (
          <button type="button" onClick={authorize} disabled={busy}>
            {busy ? '处理中…' : '授权苹果屏幕时间'}
          </button>
        )}
        <button type="button" onClick={openReport} disabled={busy || !approved}>
          打开当天系统报告
        </button>
        <button type="button" onClick={readData} disabled={busy || !approved}>
          读取当天正式数据
        </button>
      </div>

      <div className="iosScreenTimeDeveloperHead" style={{ marginTop: '18px' }}>
        <div>
          <h3>Monitor最小测试</h3>
          <p>不再依赖Xcode Console。注册后立即读取系统Activities、Schedule和Events。</p>
        </div>
      </div>

      <div className="iosScreenTimeDeveloperActions">
        <button
          type="button"
          disabled={busy || !approved}
          onClick={() => run(
            startIOSMonitorMiniTest,
            '已执行最小注册，并完成苹果系统反查。',
          )}
        >
          ① 注册1分钟Monitor
        </button>

        <button
          type="button"
          disabled={busy || !approved}
          onClick={() => run(
            readIOSMonitorMiniStatus,
            '已读取苹果系统真实注册状态。',
          )}
        >
          ② 读取系统注册状态
        </button>

        <button
          type="button"
          disabled={busy || !approved}
          onClick={() => run(readIOSMonitorMiniCallbacks)}
        >
          ③ 读取Monitor回调
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => run(
            stopIOSMonitorMiniTest,
            '已停止最小Monitor测试。',
          )}
        >
          ④ 停止最小测试
        </button>
      </div>

      {message && <p className="iosScreenTimeDeveloperMessage">{message}</p>}
      <JsonPreview value={monitorPreview} />
      <JsonPreview value={preview} />

      <p className="iosScreenTimeDeveloperNote">
        判定标准：systemConfirmed=true 表示苹果系统确实保存了Activity、Schedule和Event；
        callbacks出现 eventDidReachThreshold 表示Monitor Extension整条链已打通。
      </p>
    </section>
  )
}
