import { useEffect, useMemo, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import './OffscreenTimeDataPanel.css'

const IOSScreenTime = registerPlugin('IOSScreenTime')

export default function OffscreenTimeDataPanel({
  records = [],
  onBack,
  showMonitorDeveloperLink = false,
  onOpenMonitorDeveloper,
}) {
  const [iosMonitorRecords, setIosMonitorRecords] = useState([])
  const [monitorMessage, setMonitorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadIOSMonitorTest() {
      if (Capacitor.getPlatform() !== 'ios') return

      try {
        // 每次进入离机时间表时尝试注册。原生端会先停止旧监控再重建，
        // 便于本轮真机测试，不需要另做测试按钮。
        const startResult = await IOSScreenTime.startOffscreenMonitoring()
        const readResult =
          await IOSScreenTime.readOffscreenMonitoringData()

        if (cancelled) return

        setIosMonitorRecords(
          Array.isArray(readResult?.records)
            ? readResult.records
            : []
        )
        setMonitorMessage(
          readResult?.message ||
          startResult?.message ||
          ''
        )
      } catch (error) {
        if (cancelled) return
        setMonitorMessage(
          error?.message ||
          String(error) ||
          '苹果离机时间 Monitor 测试失败。'
        )
      }
    }

    loadIOSMonitorTest()

    return () => {
      cancelled = true
    }
  }, [])

  const mergedRecords = useMemo(() => {
    const rowsByDate = new Map()

    records.forEach((row) => {
      if (row?.date) rowsByDate.set(row.date, row)
    })

    iosMonitorRecords.forEach((row) => {
      if (!row?.date) return
      const oldRow = rowsByDate.get(row.date) || {}
      rowsByDate.set(row.date, {
        ...oldRow,
        ...row,
      })
    })

    return Array.from(rowsByDate.values()).sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    )
  }, [records, iosMonitorRecords])

  return (
    <div className="dailyPage dailySubPage offscreenTimeDataPage">
      <div className="dailyTableCard offscreenTimeDataCard">
        <div className="offscreenTimeTitleLine">
          <h2>离机时间表</h2>
          <div className="offscreenTimeTitleActions">
            {showMonitorDeveloperLink && (
              <button
                type="button"
                className="offscreenMonitorDeveloperLink"
                onClick={onOpenMonitorDeveloper}
              >
                Monitor 调试
              </button>
            )}
            <button
              type="button"
              className="dailyAddDateBtn"
              onClick={onBack}
            >
              返回
            </button>
          </div>
        </div>

        {!!monitorMessage && (
          <p className="offscreenTimeEmpty">
            苹果测试：{monitorMessage}
          </p>
        )}

        <div className="offscreenTimeScroll">
          <div className="offscreenTimeHeader">
            <span>日期</span>
            <span>计算离机时间</span>
            <span>数据来源</span>
            <span>安卓手机离机时间</span>
            <span>通话识别的休息时间</span>
            <span>苹果最后活动小时内第一次拿起手机时间（删）</span>
            <span>苹果最后一小时活动时长（删）</span>
            <span>用户道晚安时间</span>
            <span>计算离机时间（删）</span>
          </div>

          <div className="offscreenTimeBody">
            {mergedRecords.map((row, index) => (
              <div
                className="offscreenTimeRow"
                key={row.id || `${row.date}-${index}`}
              >
                <span>{row.date || '—'}</span>
                <span>{row.calculatedOffscreenTime || '—'}</span>
                <span>{row.dataSource || '—'}</span>
                <span>{row.androidOffscreenTime || '—'}</span>
                <span>{row.iosLastLongActivityEnd || '—'}</span>
                <span>{row.iosLastHourFirstPickupTime || row.iosLastPickupTime || '—'}</span>
                <span>
                  {Number(row.iosLastHourActivityMinutes || 0)
                    ? `${Number(row.iosLastHourActivityMinutes)}分`
                    : '—'}
                </span>
                <span>{row.iosGoodNightTime || '—'}</span>
                <span>{row.iosCalculatedOffscreenTime || '—'}</span>
              </div>
            ))}

            {!mergedRecords.length && (
              <p className="offscreenTimeEmpty">
                离机时间表目前为空。今晚达到第一档阈值后，再进入本页查看。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
