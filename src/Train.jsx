import { useEffect, useRef, useState } from 'react'
import './Train.css'
import {
  openIOSScreenTimeDashboard,
} from './components/ios-screen-time/iosScreenTimeService.js'


/* ======================================================
   APP 名称别名表
   key 是雪粒统一名称；数组里可随时增加手机系统返回的真实 APP 名称。
   Package Name 不参与当前匹配，只在 APP 详情原始数据中保存。
   ====================================================== */
export const APP_ALIAS_TABLE = {
  支付宝: ['支付宝', 'Alipay', 'AlipayHK', 'Alipay HK'],
  地图: ['地图', '高德地图', '高德', 'AMap', 'Amap', '百度地图', 'Google Maps', 'Google Map', 'Maps', 'Petal Maps', 'Petal Map', 'Apple Maps', '腾讯地图', 'Tencent Maps'],
  百度: ['百度', 'Baidu', '百度App', '百度 APP'],
  微信读书: ['微信读书', 'WeRead', 'Weread', 'WeChat Read', 'Wechat Read'],
  美团: ['美团', 'Meituan', '美团外卖', 'Meituan Waimai'],
  拼多多: ['拼多多', 'Pinduoduo', 'PDD', 'Temu'],
  京东: ['京东', '京东商城', 'JD', 'JD.com', 'Jingdong'],
  天猫: ['天猫', 'Tmall', 'Tmall Global'],
  浏览器: ['浏览器', 'Browser', 'Chrome', 'Google Chrome', 'Chrome Beta', 'Chrome Dev', 'Chromium', 'Microsoft Edge', 'Edge', 'Safari', 'Firefox', 'Mozilla Firefox', 'Opera', 'Opera Mini', 'Brave', 'Brave Browser', 'Samsung Internet', 'Samsung Browser', 'Huawei Browser', 'HUAWEI Browser', '华为浏览器', 'Mi Browser', '小米浏览器', 'QQ浏览器', 'QQ Browser', 'UC浏览器', 'UC Browser', '夸克', '夸克浏览器', 'Quark', 'Vivaldi'],
  淘宝: ['淘宝', '手机淘宝', 'Taobao'],

  微信: ['微信', 'WeChat', 'Wechat'],
  抖音: ['抖音', 'Douyin', 'TikTok', 'Tik Tok'],
  微博: ['微博', '新浪微博', 'Weibo', 'Sina Weibo'],
  小红书: ['小红书', 'RED', 'RedNote', 'Red Note', 'Xiaohongshu'],
  知乎: ['知乎', 'Zhihu'],
  QQ: ['QQ', '腾讯QQ', 'Tencent QQ'],
  Instagram: ['Instagram', 'Instagram Lite', 'IG'],
  FaceBook: ['Facebook', 'Facebook Lite', 'Meta Facebook', 'FB'],
  Soul: ['Soul', 'Soul App'],

  DeepSeek: ['DeepSeek', 'Deep Seek', '深度求索'],
  豆包: ['豆包', 'Doubao', 'Dou Bao'],
  GPT: ['GPT', 'ChatGPT', 'Chat GPT', 'OpenAI', 'OpenAI ChatGPT'],
  Gemini: ['Gemini', 'Google Gemini', 'Bard', 'Google Bard'],
  Claude: ['Claude', 'Anthropic Claude', 'Claude by Anthropic'],
  千问: ['千问', '通义千问', 'Qwen', 'Tongyi Qianwen'],
  元宝: ['元宝', '腾讯元宝', 'Tencent Yuanbao', 'Yuanbao'],

  哔哩哔哩: ['哔哩哔哩', '哔哩哔哩动画', 'Bilibili', 'B站'],
  腾讯视频: ['腾讯视频', 'Tencent Video', 'WeTV'],
  爱奇艺: ['爱奇艺', 'iQIYI', 'IQIYI'],
  优酷: ['优酷', 'Youku', 'YOUKU'],
  今日头条: ['今日头条', '头条', 'Toutiao', 'Jinri Toutiao'],
  YouTube: ['YouTube', 'Youtube', 'YouTube Kids'],
  快手: ['快手', 'Kuaishou', 'Kwai'],
}

function compactAppName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s·•_\-—–:：()（）\[\]【】.。]/g, '')
}

/**
 * 把手机返回的真实 APP 名称转换为雪粒统一名称。
 * 未匹配时返回空字符串，原始名称仍保存在详情表中。
 */
export function snowballAppNameFor(realAppName) {
  const raw = String(realAppName || '').trim()
  if (!raw) return ''
  const normalized = compactAppName(raw)

  for (const [snowballName, aliases] of Object.entries(APP_ALIAS_TABLE)) {
    const candidates = [snowballName, ...(aliases || [])]
    if (candidates.some(alias => compactAppName(alias) === normalized)) return snowballName
  }

  // 对带有“极速版 / Lite / HD”等附加字样的常见系统名称做保守包含匹配。
  const safeSuffixes = ['极速版', 'lite', 'hd', '国际版', '安卓版', 'android']
  for (const [snowballName, aliases] of Object.entries(APP_ALIAS_TABLE)) {
    const candidates = [snowballName, ...(aliases || [])]
    for (const alias of candidates) {
      const key = compactAppName(alias)
      if (key.length < 3) continue
      if (normalized.includes(key)) {
        const remainder = normalized.replace(key, '')
        if (!remainder || safeSuffixes.some(suffix => remainder === compactAppName(suffix))) return snowballName
      }
    }
  }

  return ''
}

/* ======================================================
   信息列车｜火车参数
   只调火车本身：位置、间隔、长度、速度、行驶距离、透明度。
   CSS 里的表格、猫、标题等不要在这里改。
   ====================================================== */
const TRAIN_MOTION = {
  // 第一条火车的顶部位置，单位是屏幕高度百分比。数字越小越靠上。
  firstTopPercent: 9,

  // 每条火车之间的上下间隔，单位是屏幕高度百分比。数字越小越密。
  rowGapPercent: 7,

  // 火车长度倍率。1 是原始长度；0.8 变短；1.2 变长。
  widthScale: 0.35,

  // 速度倍率。1 是原始速度；0.8 更快；1.2 更慢。
  speedScale: 2,

  // 行驶距离额外增加/减少的像素。正数多跑一点，负数少跑一点。
  distanceExtraPx: 0,

  // 透明度倍率。1 是原始透明度；0.8 更淡；1.1 更亮，最高会自动限制为 1。
  opacityScale: 1,
}

function trainMotionTop(index) {
  return `${TRAIN_MOTION.firstTopPercent + index * TRAIN_MOTION.rowGapPercent}%`
}

function trainMotionWidth(baseWidth) {
  return `${Math.round(Number(baseWidth || 0) * TRAIN_MOTION.widthScale)}px`
}

function trainMotionDuration(baseDuration) {
  const duration = Number(baseDuration || 0) * TRAIN_MOTION.speedScale
  return `${Number(duration.toFixed(2))}s`
}

function trainMotionDistance(baseDistance) {
  const extra = Number(TRAIN_MOTION.distanceExtraPx || 0)
  if (!extra) return baseDistance
  return `calc(${baseDistance} + ${extra}px)`
}

function trainMotionOpacity(baseOpacity) {
  return Math.max(0, Math.min(1, Number(baseOpacity || 0) * TRAIN_MOTION.opacityScale))
}

export default function Train({
  PngSequence,
  dailyTrainRows,
  trainIsRunning,
  dailyStatRange,
  trainRunKey,
  dailyTrainMaxPickups,
  dailyTrainMaxDuration,
  trainTopApps,
  appIconMap,
  trainImageForCategory,
  trainWidthForStats,
  trainSpeedForStats,
  trainDistanceForStats,
  trainOpacityForStats,
  dailyRangeTabs,
  setDailyStatRange,
  dailyTopApps,
  dailyTopAppSummary,
  openDailyDetail,
  openScreenTimeSummary,
  onBackHome,
  useNativeIOSScreenTime = false,
}) {
  const [iosReportError, setIOSReportError] = useState('')
  const iosOpenedRef = useRef(false)
  const [showTrainInfo, setShowTrainInfo] = useState(false)

  useEffect(() => {
    if (!useNativeIOSScreenTime || iosOpenedRef.current) {
      return
    }

    iosOpenedRef.current = true

    // 先让网页层稳定回到主页，再打开原生汇总表。
    // 原生插件会在呈现汇总表前移除主页 Mini Report，
    // 避免两个 DeviceActivityReport 同时请求而一直转圈。
    onBackHome()

    const timer = window.setTimeout(() => {
      openIOSScreenTimeDashboard().then(() => {
        iosOpenedRef.current = false
      }).catch(error => {
        iosOpenedRef.current = false
        console.warn(
          '苹果屏幕时间报表没有打开。',
          error,
        )
      })
    }, 220)

    return () => {
      window.clearTimeout(timer)
    }
  }, [useNativeIOSScreenTime, onBackHome])

  if (showTrainInfo) {
    return (
      <section className="trainInfoPage" aria-label="信息说明">
        <header className="trainInfoHeader">
          <button
            type="button"
            className="trainInfoBack"
            onClick={() => setShowTrainInfo(false)}
            aria-label="返回信息列车"
          >
            ‹
          </button>
          <h2>信息说明</h2>
        </header>

        <div className="trainInfoBody">
          <p><strong>信息页面</strong>记录手机使用状态，用于帮助雪粒了解生活节奏，仅供个人参考，不作为医学、法律或行为判断依据。</p>

          <p>所有数据默认保存在你的设备中。雪粒不会读取聊天内容、网页内容、照片内容或应用内容，也不会用于广告或推荐。</p>

          <p><strong>屏幕时间</strong><br />安卓直接读取系统统计。苹果由于系统限制，需要等待系统生成报表，因此刚打开时可能暂时没有结果，稍后通常会自动补充。</p>

          <p><strong>昨日休息</strong><br />记录的是昨天主要使用手机结束的大约时间，而不是准确睡眠时间。安卓依据系统数据；苹果依据最后长时间活动和最后一小时活动推算，仅供参考。</p>

          <p><strong>苹果用户</strong><br />可以通过道晚安、通话告诉雪粒，或手动修改来记录昨天的休息时间。如果存在多个时间，雪粒会按照现有规则采用最终记录。</p>

          <p><strong>待记录</strong><br />如果昨天没有足够数据，雪粒不会自动猜测，而会保持待记录状态。用户也可以选择不记录，只是对应状态不会获得完整数据。</p>

          <p><strong>APP 分类</strong><br />系统返回的 APP 会按照雪粒现有词表归类。无法识别或未单独列出的应用会暂时归入“其它”，因此“其它”只能作为粗略参考。</p>

          <p><strong>苹果报表</strong><br />屏幕时间报表可能有一定滞后。昨天的数据通常比今天更完整；如果暂时没有看到最新统计，可以稍后再次打开，或参考昨天末次活动等补充信息。</p>

          <p><strong>数据参考</strong><br />屏幕时间和离机时间均来自系统数据或合理推算。苹果还可以结合用户主动记录进行补充，但所有结果都不代表绝对准确的事实。</p>

          <p><strong>隐私</strong><br />雪粒只使用系统提供的统计结果和用户主动填写的数据，不读取具体聊天、网页、照片或文件内容，相关数据不会主动外泄。</p>

          <p>雪粒更希望帮助你观察长期生活节奏，而不是追求某一天数字的绝对准确。</p>
        </div>
      </section>
    )
  }

  if (useNativeIOSScreenTime) return null

  return (
    <div className="dailyPage dailySubPage dailyTrainPage trainPage">
      <div className="dailySubTop trainSubTop">
        <h2 className="dailyPlainTitle trainTitle">信息列车</h2>
        <div className="dailySubActions trainSubActions">
          <button type="button" className="trainBackBtn" onClick={onBackHome}>返回主页</button>
        </div>
        <button
          type="button"
          className="trainInfoBtn"
          onClick={() => setShowTrainInfo(true)}
        >
          说明
        </button>
      </div>

      <div className="dailyInsightCard informationTrainCard trainInsightCard">
        <img className="dailyInsightBg trainInsightBg" src="/refine/information_platform.png" alt="信息列车背景" />
        <PngSequence
          className="dailyInsightCat trainInsightCat"
          prefix="/refine/watch"
          maxFrames={5}
          frameMs={280}
          fallback="/refine/watch01.png"
          ariaLabel="信息列车守望猫"
        />


        <div className="dailyInsightContent trainInsightContent">
          <div className={`informationTrainStage ${trainIsRunning ? 'isRunning' : 'isWaiting'}`} key={`train-${dailyStatRange}-${trainRunKey}`} aria-hidden="true">
            {dailyTrainRows.map((item, index) => {
              const topApps = trainTopApps(item)
              return (
                <div
                  className={`informationTrainLane informationTrainLane${index + 1}`}
                  key={item.key}
                  style={{
                    '--train-top': trainMotionTop(index),
                    '--train-width': trainMotionWidth(trainWidthForStats(item)),
                    '--train-duration': trainMotionDuration(trainSpeedForStats(item, dailyTrainMaxPickups)),
                    '--train-cycle': `${Math.round(3 + dailyTrainMaxDuration + 0.9)}s`,
                    '--train-delay': '0s',
                    '--train-distance': trainMotionDistance(trainDistanceForStats(item)),
                    '--train-opacity': trainMotionOpacity(trainOpacityForStats(item)),
                  }}
                >
                  <div className="informationTrainRunner">
                    <img className="informationTrainImage" src={trainImageForCategory(item.key)} alt="" />
                    <div className="informationTrainIcons">
                      {topApps.map(app => (
                        appIconMap[app] ? (
                          <img key={app} src={appIconMap[app]} alt={app} title={app} />
                        ) : (
                          <span key={app} title={app}>{app.slice(0, 2)}</span>
                        )
                      ))}
                    </div>
                    <div className="informationTrainMeta">
                      <strong>{item.label}</strong>
                      <span>{item.timeText} · {item.pickupText}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="dailyCornerTable dailyCornerTableLeft trainCornerTable">
            <div className="trainRangeToolbar">
              <div className="dailyRangeTabs trainRangeTabs">
                {dailyRangeTabs.map(tab => (
                  <button key={tab.key} className={dailyStatRange === tab.key ? 'active' : ''} onClick={() => setDailyStatRange(tab.key)}>{tab.label}</button>
                ))}
              </div>
              <button type="button" className="trainInlineDetailLink" onClick={openScreenTimeSummary}>详情</button>
            </div>
            <div className="dailyMiniTable appMiniTable trainLedTable">
              <div className="trainLedHeader">
                <span>APP</span>
                <strong>时间</strong>
                <em>打开次数</em>
              </div>
              {dailyTopApps.length ? (
                <>
                  {dailyTopApps.map((item, index) => (
                    <div className="dailyMiniRow trainLedRow" key={item.app}>
                      <span><b>{index + 1}</b>{item.app}</span>
                      <strong>{item.hoursText}</strong>
                      <em>{item.pickupText}</em>
                    </div>
                  ))}
                  <div className="dailyMiniRow trainLedRow trainLedTotalRow">
                    <span>小计</span>
                    <strong>{`${(dailyTopAppSummary.minutes / 60).toFixed(1)} h`}</strong>
                    <em>{`${Math.round(dailyTopAppSummary.pickups)}次`}</em>
                  </div>
                </>
              ) : (
                <div className="trainLedEmpty">暂无 APP 详情数据</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
