import './ScreenTimeDataPanel.css'
import {
  isScreenSystemTotalRow,
  screenAppSubtotalMinutesForDate,
  screenDurationText,
  screenHoursInputValue,
  screenMinutesForDetailRow,
  screenRowsForDate,
  screenSystemTotalMinutesForDate,
} from './screenTimeDataService.js'

function screenDateKey(value) {
  const text = String(value || '').trim()
  const match = text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/)
  if (!match) return text
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
}

function screenDateLabel(value) {
  const key = screenDateKey(value)
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return String(value || '—')
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`
}

function compactDuration(minutes) {
  const value = Math.max(0, Number(minutes || 0))
  if (!value) return '—'
  return `${(value / 60).toFixed(1)}h`
}

function displayAppName(row) {
  return String(
    row?.app
      || row?.realAppName
      || '未识别',
  ).trim() || '未识别'
}

function buildDailySummary(screenRecords = []) {
  const dates = [...new Set(
    (screenRecords || [])
      .map(row => screenDateKey(row?.date))
      .filter(Boolean),
  )].sort((a, b) => b.localeCompare(a))

  return dates.map(date => {
    const datedRows = screenRowsForDate(screenRecords, date)
      .map(({ row }) => row)
    const appRows = datedRows.filter(row => !isScreenSystemTotalRow(row))

    const appsByName = new Map()
    appRows.forEach(row => {
      const name = displayAppName(row)
      const current = appsByName.get(name) || {
        app: name,
        minutes: 0,
        pickups: 0,
      }
      current.minutes += Math.max(0, Number(screenMinutesForDetailRow(row) || 0))
      current.pickups += Math.max(0, Number(row?.pickups || 0))
      appsByName.set(name, current)
    })

    const ranked = [...appsByName.values()]
      .filter(item => item.minutes > 0 || item.pickups > 0)
      .sort((a, b) =>
        b.minutes - a.minutes
        || b.pickups - a.pickups
        || a.app.localeCompare(b.app, 'zh-CN'),
      )

    const top10 = ranked.slice(0, 10)
    const remaining = ranked.slice(10)
    const other = remaining.reduce(
      (sum, item) => ({
        app: '其他',
        minutes: sum.minutes + item.minutes,
        pickups: sum.pickups + item.pickups,
      }),
      { app: '其他', minutes: 0, pickups: 0 },
    )

    const systemTotal = screenSystemTotalMinutesForDate(screenRecords, date)
    const appSubtotal = screenAppSubtotalMinutesForDate(screenRecords, date)

    return {
      date,
      totalMinutes: systemTotal > 0 ? systemTotal : appSubtotal,
      top10,
      other,
    }
  })
}

function SummaryCell({ item, emptyLabel = '—' }) {
  if (!item || (!item.minutes && !item.pickups)) {
    return <span className="screenSummaryEmpty">{emptyLabel}</span>
  }

  return (
    <span className="screenSummaryAppCell" title={`${item.app} · ${screenDurationText(item.minutes)} · ${item.pickups || 0}次`}>
      <strong>{item.app}</strong>
      <small>{compactDuration(item.minutes)} · {item.pickups || 0}次</small>
    </span>
  )
}

export default function ScreenTimeDataPanel({
  mode = 'summary',
  selectedDate,
  screenRecords = [],
  appOptions = [],
  onUpdateRecord,
  onDeleteRecord,
  onAddRecord,
  onSaveAndReturn,
  onBackHome,
  onOpenTrain,
  onOpenDetailDate,
  showTrainLink = true,
  developerMode = false,
  developerPanel = null,
}) {
  const summaryRows = buildDailySummary(screenRecords)

  if (mode === 'summary') {
    return (
      <div className="screenSummaryPage">
        <div className="screenSummaryTopBar">
          <button
            type="button"
            className="screenSummaryBack"
            onClick={onBackHome}
            aria-label="返回主页"
          >
            ‹
          </button>
          <h1>屏幕时间</h1>
          {showTrainLink ? (
            <button
              type="button"
              className="screenSummaryTrainLink"
              onClick={onOpenTrain}
              aria-label="查看信息列车"
            >
              <span aria-hidden="true">🚆</span>
              <em>查看列车</em>
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="screenSummaryCard">
          <div className="screenSummaryScroller">
            <div className="screenSummaryTable">
              <div className="screenSummaryHeader screenSummaryGrid">
                <span className="screenSummaryStickyDate">日期</span>
                <span className="screenSummaryStickyTotal">总时长</span>
                {Array.from({ length: 10 }, (_, index) => (
                  <span key={index}>TOP {index + 1}</span>
                ))}
                <span>其他</span>
              </div>

              <div className="screenSummaryBody">
                {summaryRows.map(row => (
                  <div className="screenSummaryRow screenSummaryGrid" key={row.date}>
                    <span className="screenSummaryStickyDate">
                      {screenDateLabel(row.date)}
                    </span>

                    {developerMode ? (
                      <button
                        type="button"
                        className="screenSummaryStickyTotal screenSummaryTotalButton"
                        onClick={() => onOpenDetailDate?.(row.date)}
                        title="打开当天屏幕时间详情"
                      >
                        {compactDuration(row.totalMinutes)}
                      </button>
                    ) : (
                      <span className="screenSummaryStickyTotal screenSummaryTotal">
                        {compactDuration(row.totalMinutes)}
                      </span>
                    )}

                    {Array.from({ length: 10 }, (_, index) => (
                      <SummaryCell item={row.top10[index]} key={index} />
                    ))}
                    <SummaryCell item={row.other} />
                  </div>
                ))}

                {!summaryRows.length && (
                  <div className="screenSummaryEmptyState">
                    目前还没有可汇总的 APP 屏幕时间记录。
                  </div>
                )}
              </div>
            </div>
          </div>

          <p className="screenSummaryHint">
            每日按使用时长排列 TOP 10，其余应用合并为“其他”。
          </p>
        </div>
      </div>
    )
  }

  const rows = screenRowsForDate(screenRecords, selectedDate)
  const appSubtotalMinutes = screenAppSubtotalMinutesForDate(
    screenRecords,
    selectedDate,
  )
  const systemTotalMinutes = screenSystemTotalMinutesForDate(
    screenRecords,
    selectedDate,
  )

  return (
    <div className="dailyPage dailySubPage dailyScreenPage dailyScreenRawPage">
      <div
        className="dailyTableCard dailyScreenDetailCard dailyScreenPlainCard"
        style={{ overflowX: 'auto' }}
      >
        <label className="dailyScreenDateLabel">
          日期
          <input value={selectedDate} disabled />
        </label>

        <div className="screenDetailScroll">
          <div className="screenDetailHeader screenDetailHeaderEdit">
            <span>日期</span>
            <span>雪粒APP</span>
            <span>真实APP</span>
            <span>Package</span>
            <span>屏时</span>
            <span>次数</span>
            <span />
          </div>

          <div className="screenDetailBody">
            {rows.map(({ row, index }) => (
              isScreenSystemTotalRow(row) ? null : (
                <div
                  className="screenDetailRow screenDetailEditRow"
                  key={row.id || index}
                >
                  <input value={row.date || selectedDate} disabled />

                  <select
                    value={row.app || ''}
                    onChange={event => onUpdateRecord?.(index, 'app', event.target.value)}
                    title={row.app ? '雪粒已识别名称' : '未匹配时可手动选择'}
                  >
                    <option value="">未匹配</option>
                    {appOptions.map(app => (
                      <option key={app} value={app}>{app}</option>
                    ))}
                  </select>

                  <input
                    value={row.realAppName || ''}
                    onChange={event => onUpdateRecord?.(index, 'realAppName', event.target.value)}
                    placeholder="手机返回名称"
                    title="输入真实名称后自动匹配雪粒 APP 名"
                  />

                  <input
                    value={row.packageName || ''}
                    onChange={event => onUpdateRecord?.(index, 'packageName', event.target.value)}
                    placeholder="Package Name"
                  />

                  <input
                    value={screenHoursInputValue(screenMinutesForDetailRow(row))}
                    type="number"
                    min="0"
                    step="0.1"
                    onChange={event => onUpdateRecord?.(index, 'minutes', event.target.value)}
                    placeholder="小时"
                  />

                  <input
                    value={row.pickups || ''}
                    type="number"
                    min="0"
                    onChange={event => onUpdateRecord?.(index, 'pickups', event.target.value)}
                    placeholder="次数"
                  />

                  <button
                    type="button"
                    className="dailyRowDeleteBtn screenRowDeleteBtn"
                    aria-label="删除这条 APP 详情"
                    title="删除"
                    onClick={() => onDeleteRecord?.(index)}
                  >
                    ×
                  </button>
                </div>
              )
            ))}

            {!rows.length && (
              <p className="screenEmptyTip">这个日期还没有屏幕详情记录。</p>
            )}
          </div>
        </div>

        <div className="screenDetailSummary">
          <span>
            APP小计 <strong>{screenDurationText(appSubtotalMinutes)}</strong>
          </span>
          <span>
            屏幕时间小计 <strong>{screenDurationText(systemTotalMinutes)}</strong>
          </span>
        </div>

        <div className="screenDetailActions screenDetailActionsTwo">
          <button
            type="button"
            className="dailyAddDateBtn"
            onClick={onAddRecord}
          >
            新增
          </button>
          <button
            type="button"
            className="dailyAddDateBtn"
            onClick={onSaveAndReturn}
          >
            保存返回
          </button>
        </div>

        {developerPanel}
      </div>
    </div>
  )
}
