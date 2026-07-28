import './OffscreenTimeDataPanel.css'

export default function OffscreenTimeDataPanel({
  records = [],
  onBack,
}) {
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
            <span>苹果最后长时活动结束时间</span>
            <span>苹果最后拿起手机时间</span>
            <span>苹果最后一小时活动时长</span>
            <span>苹果用户道晚安时间</span>
            <span>苹果计算离机时间</span>
          </div>

          <div className="offscreenTimeBody">
            {records.map((row, index) => (
              <div
                className="offscreenTimeRow"
                key={row.id || `${row.date}-${index}`}
              >
                <span>{row.date || '—'}</span>
                <span>{row.calculatedOffscreenTime || '—'}</span>
                <span>{row.dataSource || '—'}</span>
                <span>{row.androidOffscreenTime || '—'}</span>
                <span>{row.iosLastLongActivityEnd || '—'}</span>
                <span>{row.iosLastPickupTime || '—'}</span>
                <span>
                  {Number(row.iosLastHourActivityMinutes || 0)
                    ? `${Number(row.iosLastHourActivityMinutes)}分`
                    : '—'}
                </span>
                <span>{row.iosGoodNightTime || '—'}</span>
                <span>{row.iosCalculatedOffscreenTime || '—'}</span>
              </div>
            ))}

            {!records.length && (
              <p className="offscreenTimeEmpty">
                离机时间表目前为空。下一轮接入测试数据后，将按日期自动生成记录。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
