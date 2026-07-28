import { useCallback, useEffect, useState } from 'react'
import './IOSScreenTimeDeveloperPanel.css'
import {
  getIOSScreenTimeStatus,
  isIOSScreenTimeAvailable,
  openIOSScreenTimeReport,
  readIOSScreenTimeData,
  requestIOSScreenTimeAuthorization,
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

export default function IOSScreenTimeDeveloperPanel({ date }) {
  const [status, setStatus] = useState(EMPTY_STATUS)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(null)

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

  async function authorize() {
    setBusy(true)
    setMessage('')
    try {
      const result = await requestIOSScreenTimeAuthorization()
      setStatus({ ...EMPTY_STATUS, ...(result || {}) })
      setMessage(result?.status === 'approved' ? '授权成功，可以打开系统报告。' : '系统没有批准授权。')
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
          <p>独立测试区，只在 iPhone 开发者模式显示。</p>
        </div>
        <button type="button" onClick={refreshStatus} disabled={busy}>刷新状态</button>
      </div>

      <div className="iosScreenTimeStatusGrid">
        <span>日期</span><strong>{date || '—'}</strong>
        <span>授权状态</span><strong>{status.statusLabel || status.status || '—'}</strong>
        <span>数据方式</span><strong>Apple DeviceActivity Report</strong>
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

      {message && <p className="iosScreenTimeDeveloperMessage">{message}</p>}
      {preview && (
        <pre className="iosScreenTimeDeveloperMessage" style={{ whiteSpace: 'pre-wrap', maxHeight: '240px', overflow: 'auto' }}>
          {JSON.stringify(preview, null, 2)}
        </pre>
      )}
      <p className="iosScreenTimeDeveloperNote">
        正式读取需要原生插件返回 APP 明细、小时活动、拿起时间和活动段数据。
      </p>
    </section>
  )
}
