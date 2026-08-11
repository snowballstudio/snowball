import './StepAutoTable.css'
import { stepSourceLabel } from './stepDataService.js'

function valueText(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}


function dateText(value) {
  if (!value) return '—'
  const parts = String(value).trim().split(/[\/-]/)
  if (parts.length !== 3) return String(value)
  const [year, month, day] = parts
  return `${year.padStart(4, '0')}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`
}

function timeText(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch (_) {
    return '—'
  }
}

export default function StepAutoTable({ records = [], onBack }) {
  const rows = [...records].sort((a, b) => dateText(b.date).localeCompare(dateText(a.date)))
  return (
    <div className="stepAutoPage">
      <div className="stepAutoTop">
        <button type="button" className="stepAutoBack" onClick={onBack} aria-label="返回日常数据">‹</button>
        <div>
          <h2>步数自动获取表</h2>
          <p>只读诊断表。每日来源优先；无每日来源时按23:50累计与登录累计容错推算。</p>
        </div>
      </div>

      <div className="stepAutoScroll">
        <div className="stepAutoTable">
          <div className="stepAutoRow stepAutoHeader">
            <span>日期</span><span>当日步数</span><span>计算来源</span>
            <span>Health Connect</span><span>Huawei Health Kit</span><span>Apple Health Kit</span>
            <span>首次累计</span><span>末次累计</span><span>23:50自动累计</span><span>后台执行时间/状态</span><span>登录次数</span>
            <span>前次登录日</span><span>累计差值</span><span>说明</span><span>更新时间</span>
          </div>
          {rows.map((row, index) => (
            <div className="stepAutoRow" key={`${row.date}-${index}`}>
              <span>{dateText(row.date)}</span>
              <span className="stepAutoStrong">{valueText(row.calculatedSteps)}</span>
              <span>{stepSourceLabel(row.calculatedSource)}</span>
              <span>{valueText(row.healthConnectSteps)}</span>
              <span>{valueText(row.huaweiHealthKitSteps)}</span>
              <span>{valueText(row.appleHealthKitSteps)}</span>
              <span>{valueText(row.firstCumulativeSteps)}</span>
              <span>{valueText(row.lastCumulativeSteps)}</span>
              <span>{valueText(row.backgroundCumulativeSteps)}</span>
              <span className="stepAutoNote" title={row.backgroundCapturedAt
                  ? `${timeText(row.backgroundCapturedAt)}｜${row.backgroundStepTestStatus || '已执行'}`
                  : row.backgroundScheduledFor
                    ? `计划：${timeText(row.backgroundScheduledFor)}`
                    : row.backgroundStepTestStatus || '—'}>
                {row.backgroundCapturedAt
                  ? `${timeText(row.backgroundCapturedAt)}｜${row.backgroundStepTestStatus || '已执行'}`
                  : row.backgroundScheduledFor
                    ? `计划：${timeText(row.backgroundScheduledFor)}`
                    : row.backgroundStepTestStatus || '—'}
              </span>
              <span>{valueText(row.loginCount)}</span>
              <span>{row.previousLoginDate ? dateText(row.previousLoginDate) : '—'}</span>
              <span>{valueText(row.cumulativeDelta)}</span>
              <span className="stepAutoNote" title={row.calculationNote || '—'}>{row.calculationNote || '—'}</span>
              <span>{timeText(row.updatedAt)}</span>
            </div>
          ))}
          {!rows.length && <p className="stepAutoEmpty">还没有步数自动获取记录。安装到手机并打开雪粒后会自动建立。</p>}
        </div>
      </div>
    </div>
  )
}
