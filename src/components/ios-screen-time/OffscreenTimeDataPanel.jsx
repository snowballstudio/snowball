import './OffscreenTimeDataPanel.css'


export default function OffscreenTimeDataPanel({
  records = [],
  onBack,
  showMonitorDeveloperLink = false,
  onOpenMonitorDeveloper,
}) {
  // 仅原生 iOS App 需要额外补偿顶部安全区。
  // Safari 网页版和 Android 不加此 class，避免破坏目前正常的布局。
  const isNativeIOS =
    typeof window !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.() === true &&
    window.Capacitor?.getPlatform?.() === 'ios'

  function normalizedDateParts(value) {
    const match = String(value || '').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
    if (!match) return null

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])

    if (
      !Number.isInteger(year) ||
      month < 1 || month > 12 ||
      day < 1 || day > 31
    ) {
      return null
    }

    return { year, month, day }
  }

  function dateSortValue(value) {
    const parts = normalizedDateParts(value)
    if (!parts) return 0
    return parts.year * 10000 + parts.month * 100 + parts.day
  }

  function displayDate(value) {
    const parts = normalizedDateParts(value)
    if (!parts) return value || '—'

    return `${String(parts.year).padStart(4, '0')}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`
  }

  const sortedRecords = [...records].sort(
    (a, b) => dateSortValue(b?.date) - dateSortValue(a?.date)
  )

  return (
    <div className={`dailyPage dailySubPage offscreenTimeDataPage${isNativeIOS ? ' offscreenTimeDataPageIOSNative' : ''}`}>
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


        <div className="offscreenTimeScroll">
          <div className="offscreenTimeHeader">
            <span>日期</span>
            <span>计算离机时间</span>
            <span>数据来源</span>
            <span>安卓手机离机时间</span>
            <span>通话识别的休息时间</span>
            <span>用户道晚安时间</span>
          </div>

          <div className="offscreenTimeBody">
            {sortedRecords.map((row, index) => (
              <div
                className="offscreenTimeRow"
                key={row.id || `${row.date}-${index}`}
              >
                <span>{displayDate(row.date)}</span>
                <span>{row.calculatedOffscreenTime || '—'}</span>
                <span>{row.dataSource || '—'}</span>
                <span>{row.androidOffscreenTime || '—'}</span>
                <span>{row.spokenRestTime || '—'}</span>
                <span>{row.goodNightTime || '—'}</span>
              </div>
            ))}

            {!sortedRecords.length && (
              <p className="offscreenTimeEmpty">
                离机时间表目前为空。系统同步、道晚安或通话记录后会在这里显示。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
