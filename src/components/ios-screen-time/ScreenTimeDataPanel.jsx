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

export default function ScreenTimeDataPanel({
  selectedDate,
  screenRecords = [],
  appOptions = [],
  onUpdateRecord,
  onDeleteRecord,
  onAddRecord,
  onSaveAndReturn,
  developerPanel = null,
}) {
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
              isScreenSystemTotalRow(row) ? (
                <div
                  className="screenDetailRow screenDetailEditRow screenSystemTotalRow"
                  key={row.id || `screen-total-${selectedDate}`}
                >
                  <span>{row.date || selectedDate}</span>
                  <strong>屏幕时间小计</strong>
                  <span>手机系统屏幕时间</span>
                  <span>—</span>
                  <strong>{screenDurationText(screenMinutesForDetailRow(row))}</strong>
                  <span>—</span>
                  <span />
                </div>
              ) : (
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
