import './Train.css'


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
  onBackHome,
}) {
  return (
    <div className="dailyPage dailySubPage dailyTrainPage trainPage">
      <div className="dailySubTop trainSubTop">
        <h2 className="dailyPlainTitle trainTitle">信息列车</h2>
        <div className="dailySubActions trainSubActions">
          <button type="button" className="trainBackBtn" onClick={onBackHome}>返回主页</button>
        </div>
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
              <button type="button" className="trainInlineDetailLink" onClick={() => openDailyDetail('screen')}>详情</button>
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
