import './OffscreenTimeDataPanel.css'


export default function OffscreenTimeDataPanel({
  records = [],
  onBack,
}) {
  const sortedRecords = [...records].sort((a, b) =>
    String(b?.date || '').localeCompare(
      String(a?.date || '')
    )
  )

  return (
    <div className="dailyPage dailySubPage offscreenTimeDataPage">
      <div className="dailyTableCard offscreenTimeDataCard">
        <div className="offscreenTimeTitleLine">
          <h2>离机时间表</h2>
          <button
            type="button"
            className="dailyAddDateBtn"
            onClick={onBack}
          >
            返回
          </button>
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
                <span>{row.date || '—'}</span>
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
