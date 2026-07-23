import { useState } from 'react'
import './Home.css'
import SnowballCall from './components/call/SnowballCall.jsx'

const HOME_MOOD_ICON_MAP = {
  blank: '/refine/moodicon_blank.png',
  best: '/refine/moodicon_best.png',
  good: '/refine/moodicon_good.png',
  bad: '/refine/moodicon_bad.png',
  worst: '/refine/moodicon_worst.png',
}

function homeMoodFlowerState(moodInfo = {}) {
  // moodInfo 由 App.jsx 的 dailyMoodInfo() 根据 Master Data 心情组计算。
  // Home 只使用正面/负面计数决定玫瑰，不再保存或识别任何具体词语。
  const positiveCount = Math.max(0, Number(moodInfo?.positive || 0))
  const negativeCount = Math.max(0, Number(moodInfo?.negative || 0))
  const countedTotal = positiveCount + negativeCount

  if (countedTotal === 0) {
    return {
      level: 'blank',
      src: HOME_MOOD_ICON_MAP.blank,
      alt: '今日心情尚未记录',
    }
  }

  const positiveRate = positiveCount / countedTotal

  if (positiveRate === 1) {
    return {
      level: 'best',
      src: HOME_MOOD_ICON_MAP.best,
      alt: '今日心情全部正面',
    }
  }

  if (positiveRate >= 0.5) {
    return {
      level: 'good',
      src: HOME_MOOD_ICON_MAP.good,
      alt: '今日心情整体正面',
    }
  }

  if (positiveRate > 0) {
    return {
      level: 'bad',
      src: HOME_MOOD_ICON_MAP.bad,
      alt: '今日心情整体负面',
    }
  }

  return {
    level: 'worst',
    src: HOME_MOOD_ICON_MAP.worst,
    alt: '今日心情全部负面',
  }
}

function formatHomeRestTime(value) {
  const text = String(value || '未记录').trim()
  const match = text.match(/^(\d{1,2})\s*[:：]\s*(\d{2})$/)

  if (!match) return text.replace(/：/g, ' : ')

  const rawHour = Number(match[1])
  const minute = match[2]
  const displayHour = rawHour >= 24 ? rawHour % 24 : rawHour

  return `${displayHour} : ${minute}`
}

export default function Home({
  MOTION,
  bgImg,
  adoptDays,
  gen,
  showDataPanel,
  showYearsPanel,
  showThingsPanel,
  showPeoplePanel,
  setUsageModal,
  canPlayMotionVideo,
  interactionFrameSrc,
  interactionPlaying,
  playHomeCatInteraction,
  PngSequence,
  MAX_MOTION_FRAMES,
  catImg,
  imageFilter,
  homeYesterdaySteps,
  body,
  openDailyDetail,
  homeYesterdaySleep,
  furDisplay,
  food,
  mood,
  beginHomeTodayEdit,
  saveHomeGoodNight,
  openTodayStatus,
  homeTraceStats,
  call,
  brain,
  data,
  setData,
  openNutritionPage,
  openTrainPage,
  openFootprintPage,
  openThingPage,
  openPeoplePage,
  setYearsMode,
  setShowYearsPanel,
  openThings,
}) {
  const avgScreenText = String(homeTraceStats?.avgScreen || '0小时')
  const avgScreenMatch = avgScreenText.match(/^([0-9.]+)\s*(.*)$/)
  const avgScreenNumber = avgScreenMatch ? avgScreenMatch[1] : avgScreenText
  const avgScreenUnit = avgScreenMatch && avgScreenMatch[2] ? avgScreenMatch[2] : ''
  const isHomeVisible = !showDataPanel && !showYearsPanel && !showThingsPanel && !showPeoplePanel
  const GOOD_NIGHT_DEVICE_KEY = 'snowball-good-night-device-v1'
  const [goodNightModal, setGoodNightModal] = useState(null)
  const [rememberGoodNightDevice, setRememberGoodNightDevice] = useState(false)
  const moodFlower = homeMoodFlowerState(mood)

  function goodNightTimeInfo(now = new Date()) {
    const hour = now.getHours()
    const minute = now.getMinutes()
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (hour < 5) target.setDate(target.getDate() - 1)

    const storedHour = hour < 5 ? hour + 24 : hour
    const time = `${String(storedHour).padStart(2, '0')}：${String(minute).padStart(2, '0')}`

    return {
      hour,
      time,
      targetDate: `${target.getFullYear()}/${target.getMonth() + 1}/${target.getDate()}`,
      isEarlyMorning: hour < 5,
      isDaytime: hour >= 5 && hour < 18,
    }
  }

  function finishGoodNight(info) {
    saveHomeGoodNight({
      targetDate: info.targetDate,
      time: info.time,
    })

    setGoodNightModal({
      type: 'saved',
      title: '晚安已记下',
      text: info.isEarlyMorning
        ? `已存入 ${info.time}，作为前一日开始休息时间。`
        : `已存入 ${info.time}，作为今日开始休息时间。`,
    })
  }

  function continueGoodNight() {
    const info = goodNightTimeInfo()

    if (info.isDaytime) {
      setGoodNightModal({
        type: 'confirm',
        title: '现在是白天',
        text: `当前时间为 ${info.time}，确认现在开始休息吗？`,
        info,
      })
      return
    }

    if (info.isEarlyMorning) {
      setGoodNightModal({
        type: 'confirm',
        title: '已进入次日凌晨',
        text: `雪粒将记录休息时间为 ${info.time}，并计入前一日数据，以方便统计。`,
        info,
      })
      return
    }

    finishGoodNight(info)
  }

  function chooseGoodNightDevice(device) {
    if (rememberGoodNightDevice) {
      try {
        localStorage.setItem(GOOD_NIGHT_DEVICE_KEY, device)
      } catch (error) {
        // 本机偏好保存失败不影响本次使用。
      }
    }

    setRememberGoodNightDevice(false)

    if (device === 'android') {
      setGoodNightModal(null)
      return
    }

    continueGoodNight()
  }

  function openGoodNight() {
    let savedDevice = ''

    try {
      savedDevice = localStorage.getItem(GOOD_NIGHT_DEVICE_KEY) || ''
    } catch (error) {
      savedDevice = ''
    }

    if (savedDevice === 'android') return
    if (savedDevice === 'iphone') {
      continueGoodNight()
      return
    }

    setRememberGoodNightDevice(false)
    setGoodNightModal({ type: 'device' })
  }

  const goodNightOverlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 16000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '22px',
    background: 'rgba(0, 0, 0, 0.68)',
    backdropFilter: 'blur(7px)',
  }

  const goodNightBoxStyle = {
    width: 'min(390px, 92vw)',
    border: '1px solid rgba(226, 231, 235, 0.18)',
    borderRadius: '22px',
    padding: '22px 20px 18px',
    background: 'linear-gradient(180deg, rgba(31, 40, 50, 0.98), rgba(12, 16, 22, 0.99))',
    color: '#f4f0e6',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.48)',
  }

  const goodNightButtonStyle = {
    width: '100%',
    minHeight: '42px',
    marginTop: '10px',
    border: '1px solid rgba(224, 230, 234, 0.18)',
    borderRadius: '999px',
    background: 'rgba(151, 169, 181, 0.16)',
    color: '#f4f0e6',
    fontSize: '14px',
  }

  return (
    <section className="phoneShell homePage">
      {isHomeVisible && (
        <div className="homeFixedTopBar">
          <div className="homeFixedBrand">
            <strong>雪粒</strong>
            <span>第 {adoptDays} 天 · {gen.label}</span>
          </div>
          <button type="button" onClick={() => setUsageModal(true)}>使用说明</button>
        </div>
      )}
      <section className="heroCard">
        <img className="sceneBg" src={bgImg} alt="雪粒的背景" />

        <div
          className={`catVisual homeCatButton ${interactionPlaying ? 'interacting' : ''} ${canPlayMotionVideo ? 'videoMode' : 'idle'}`}
          role="button"
          tabIndex={0}
          aria-label="拍拍雪粒"
          onClick={playHomeCatInteraction}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') playHomeCatInteraction() }}
        >
          {interactionFrameSrc ? (
            <span
              className="homeInteractionCrossfade"
              style={{ position: 'relative', display: 'block', width: '100%' }}
            >
              <img
                className="mainCat homeInteractionBase"
                src={catImg}
                style={{
                  filter: imageFilter,
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  opacity: 0,
                  transition: 'opacity 90ms linear',
                }}
                alt=""
                aria-hidden="true"
                draggable="false"
              />
              <img
                className="mainCat homeInteractionCat"
                src={interactionFrameSrc}
                style={{
                  filter: imageFilter,
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  top: 'auto',
                  width: '100%',
                  height: 'auto',
                  opacity: 1,
                  transition: 'opacity 90ms linear',
                  transform: `scale(${MOTION.interactionStageScale?.[gen.stage] || 1})`,
                  transformOrigin: 'center bottom',
                }}
                alt="雪粒正在回应"
                draggable="false"
              />
            </span>
          ) : canPlayMotionVideo ? (
            <PngSequence
              className="mainCat catMotionSequence"
              prefix={`/motion/${gen.stage}_move`}
              maxFrames={MAX_MOTION_FRAMES}
              frameMs={MOTION.frameMs.call}
              fallback={catImg}
              fallbackStyle={{
                filter: imageFilter,
              }}
              crossfade
              style={{
                filter: imageFilter,
                transform: `scale(${MOTION.stageScale[gen.stage] || 1})`,
                transformOrigin: 'center bottom',
              }}
              ariaLabel="雪粒正在通话中轻轻走动"
            />
          ) : (
            <img className="mainCat" src={catImg} style={{ filter: imageFilter }} alt="雪粒" />
          )}
        </div>
      </section>

      <SnowballCall
        call={call}
        data={data}
        setData={setData}
        brain={brain}
        catImg={catImg}
        imageFilter={imageFilter}
      />

      <section className="statusCards homeDashboard">
        <div className="homeCausalStatus">
          <button type="button" className="homeCausalRow" onClick={() => openDailyDetail('steps')}>
            <span className="homeCausalIcon">👟</span>
            <span className="homeCausalLeft">你最新步数 <strong>{homeYesterdaySteps}</strong> </span>
            <span className="homeCausalArrow">→</span>
            <span className="homeCausalRight">它体型 <strong>{body.label}</strong></span>
          </button>

          <button type="button" className="homeCausalRow" onClick={() => openDailyDetail('offscreen')}>
            <span className="homeCausalIcon">🌙</span>
            <span className="homeCausalLeft">你上次休息 <strong>
  {formatHomeRestTime(homeYesterdaySleep)}
</strong> </span>
            <span className="homeCausalArrow">→</span>
            <span className="homeCausalRight">它毛形 <strong>{furDisplay}</strong></span>
          </button>

          <div className="homeCausalRow homeCausalSplitRow">
            <span className="homeCausalIcon">🍽️</span>
            <button type="button" className="homeCausalTextButton homeCausalLeft" onClick={() => openDailyDetail('food')}>你今日饮食 <strong>{food.healthLabel}</strong></button>
            <span className="homeCausalArrow">→</span>
            <button type="button" className="homeCausalTextButton homeCausalRight" onClick={() => openDailyDetail('food')}>它毛色 <strong>{food.label}</strong></button>
          </div>

          <button type="button" className="homeCausalRow" onClick={() => openDailyDetail('mood')}>
            <span className="homeCausalIcon homeMoodFlowerShell">
              <img
                className={`homeMoodFlower homeMoodFlower-${moodFlower.level}`}
                src={moodFlower.src}
                alt={moodFlower.alt}
              />
            </span>
            <span className="homeCausalLeft">你今日心情 <strong>{mood.statusLabel}</strong></span>
            <span className="homeCausalArrow">→</span>
            <span className="homeCausalRight">它眼睛 <strong>{mood.eyes}</strong></span>
          </button>
        </div>

        <div className="homeTodayActionRow">
          <button type="button" className="homeTodayEditText homeTodayCallText" onClick={call.callActive ? call.endCall : call.startCall}>
            <span className="homeTodayCallIcon" aria-hidden="true">💬</span>
            <em>{call.callActive ? '挂断' : '通话'}</em>
          </button>
          <button type="button" className="homeTodayEditText" onClick={openGoodNight}>
            <span className="homeTodayDataIcon" aria-hidden="true">&#9998;</span>
            <em>今日晚安</em>
          </button>
          <button type="button" className="homeTodayEditText homeTodayStatusText" onClick={openTodayStatus}>
            <span className="homeTodayStatusIcon" aria-hidden="true">🗒️</span>
            <em>今日状态</em>
          </button>
        </div>

        <div className="homeSnowTrace">
          <img className="homeSnowBg" src="/refine/snow_background.png" alt="雪地留痕" />
          <div className="homeTraceText">
            <p>七日屏幕时间 <button type="button" className="homeTraceLink" onClick={() => openDailyDetail('screen')}><strong>{avgScreenNumber}</strong></button><span className="homeSnowUnit">{avgScreenUnit}</span></p>
            <p>去过 <button type="button" className="homeTraceLink" onClick={() => openFootprintPage('world', 'browseFull')}><strong>{homeTraceStats.worldCount}</strong></button> 个国家 ，<button type="button" className="homeTraceLink" onClick={() => openFootprintPage('china', 'browseFull')}><strong>{homeTraceStats.chinaCount}</strong></button> 个省市</p>
            <p>物馆收录 <button type="button" className="homeTraceLink" onClick={() => openThingPage('overview')}><strong>{homeTraceStats.thingsCount}</strong></button> 件物品</p>
            <p>在人间记着 <button type="button" className="homeTraceLink" onClick={openPeoplePage}><strong>{homeTraceStats.peopleCount}</strong></button> 人</p>
          </div>
          <div className="homeSnowFootprints" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <PngSequence
            className="homeSnowCat"
            prefix="/motion/walk"
            maxFrames={MAX_MOTION_FRAMES}
            frameMs={MOTION.frameMs.footprint}
            fallback="/refine/footprint_background_cat.png"
            ariaLabel="雪粒在雪地上走过"
          />
        </div>
      </section>

      {goodNightModal && (
        <div style={goodNightOverlayStyle} role="dialog" aria-modal="true" aria-label="今日晚安">
          <div style={goodNightBoxStyle}>
            {goodNightModal.type === 'device' && (
              <>
                <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 600 }}>今日晚安</h2>
                <p style={{ margin: 0, lineHeight: 1.75, color: 'rgba(238, 239, 236, 0.84)', fontSize: '14px' }}>
                  此按钮是为 iPhone 用户设计，在自动获取功能生效之前，点击产生当日离机时间。安卓用户可以忽略此功能。
                </p>
                <button type="button" style={goodNightButtonStyle} onClick={() => chooseGoodNightDevice('android')}>
                  我是安卓用户，忽略
                </button>
                <button type="button" style={{ ...goodNightButtonStyle, background: 'rgba(145, 166, 158, 0.28)' }} onClick={() => chooseGoodNightDevice('iphone')}>
                  我是 iPhone 用户，确认
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '15px', color: 'rgba(238, 239, 236, 0.72)', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={rememberGoodNightDevice}
                    onChange={event => setRememberGoodNightDevice(event.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#8fa99e' }}
                  />
                  下次不再问我
                </label>
                <button type="button" style={{ ...goodNightButtonStyle, border: 'none', background: 'transparent', color: 'rgba(238, 239, 236, 0.58)' }} onClick={() => setGoodNightModal(null)}>
                  取消
                </button>
              </>
            )}

            {goodNightModal.type === 'confirm' && (
              <>
                <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 600 }}>{goodNightModal.title}</h2>
                <p style={{ margin: 0, lineHeight: 1.75, color: 'rgba(238, 239, 236, 0.84)', fontSize: '14px' }}>
                  {goodNightModal.text}
                </p>
                <button type="button" style={{ ...goodNightButtonStyle, background: 'rgba(145, 166, 158, 0.28)' }} onClick={() => finishGoodNight(goodNightModal.info)}>
                  确认
                </button>
                <button type="button" style={{ ...goodNightButtonStyle, border: 'none', background: 'transparent', color: 'rgba(238, 239, 236, 0.58)' }} onClick={() => setGoodNightModal(null)}>
                  取消
                </button>
              </>
            )}

            {goodNightModal.type === 'saved' && (
              <>
                <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 600 }}>{goodNightModal.title}</h2>
                <p style={{ margin: 0, lineHeight: 1.75, color: 'rgba(238, 239, 236, 0.84)', fontSize: '14px' }}>
                  {goodNightModal.text}
                </p>
                <button type="button" style={{ ...goodNightButtonStyle, background: 'rgba(145, 166, 158, 0.28)' }} onClick={() => setGoodNightModal(null)}>
                  知道了
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {isHomeVisible && (
      <nav className="homeBottomNav" aria-label="雪粒主页功能">
        <button type="button" onClick={() => openNutritionPage('today')}>
          <span>🌈</span>
          <em>营养</em>
        </button>
        <button type="button" onClick={() => openTrainPage('yesterday')}>
          <span>🚆</span>
          <em>信息</em>
        </button>
        <button type="button" onClick={() => openFootprintPage('world', 'home')}>
          <span className="footprintNavIcon" aria-hidden="true"><i></i><i></i></span>
          <em>足迹</em>
        </button>
        <button type="button" onClick={() => openThingPage('overview')}>
          <span>🏛️</span>
          <em>物馆</em>
        </button>
        <button type="button" onClick={openPeoplePage}>
          <span className="peopleNavIcon" aria-hidden="true"><i></i></span>
          <em>人间</em>
        </button>
      </nav>
      )}
    </section>
  )
}
