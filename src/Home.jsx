import { useEffect, useRef, useState } from 'react'
import './Home.css'
import SnowballCall from './components/call/SnowballCall.jsx'
import {
  hideIOSHomeMiniReport,
  showIOSHomeMiniReport,
} from './components/ios-screen-time/iosScreenTimeService.js'

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

function formatHomeRawActivityTime(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2})\s*[:：]\s*(\d{2})$/)
  if (!match) return text || '—'

  const rawHour = Number(match[1])
  const minute = match[2]
  const displayHour = rawHour >= 24 ? rawHour % 24 : rawHour
  return `${String(displayHour).padStart(2, '0')}：${minute}`
}

function homeRestTimeReachedGoal(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2})\s*[:：]\s*(\d{2})$/)
  if (!match) return false

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false

  // 与雪粒现有离机达标逻辑一致：05:00 至 23:30（含）。
  const totalMinutes = hour * 60 + minute
  return totalMinutes >= 5 * 60 && totalMinutes <= 23 * 60 + 30
}

function homeStatusValueClass(isGood) {
  return isGood ? 'homeStatusValue homeStatusValue-good' : 'homeStatusValue'
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
  openScreenTimeSummary,
  openOffscreenTable,
  useNativeIOSScreenTime = false,
  homeYesterdaySleep,
  homeAndroidLastActivity = '—',
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
  const avgScreenPending = avgScreenText.trim() === '待记录'
  const avgScreenMatch = avgScreenText.match(/^([0-9.]+)\s*(.*)$/)
  const avgScreenNumber = avgScreenMatch ? avgScreenMatch[1] : avgScreenText
  const isHomeVisible = !showDataPanel && !showYearsPanel && !showThingsPanel && !showPeoplePanel
  const GOOD_NIGHT_INTRO_KEY = 'snowball-good-night-intro-dismissed-v1'
  const GOOD_NIGHT_SOUND_KEY = 'snowball-good-night-sound-v1'
  const [goodNightModal, setGoodNightModal] = useState(null)
  const [rememberGoodNightIntro, setRememberGoodNightIntro] = useState(false)
  const [goodNightSoundEnabled, setGoodNightSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem(GOOD_NIGHT_SOUND_KEY) !== 'off'
    } catch (error) {
      return true
    }
  })
  const moodFlower = homeMoodFlowerState(mood)
  const iosMiniReportRef = useRef(null)
  const homeSnowTraceRef = useRef(null)

  useEffect(() => {
    if (!useNativeIOSScreenTime || !isHomeVisible) {
      hideIOSHomeMiniReport().catch(() => {})
      return undefined
    }

    let cancelled = false
    const timers = []

    const placeReport = () => {
      const snow = homeSnowTraceRef.current
      const slot = iosMiniReportRef.current
      if (!snow || !slot || cancelled) return

      const slotRect = slot.getBoundingClientRect()

      /*
       透明槽位已经由 Home.css 放在雪地图左 6%、上 6%。
       直接读取槽位最终真实坐标，避免再次用雪地图尺寸推算时，
       受到父级布局、百分比高度或 iOS viewport 差异影响。
      */
      showIOSHomeMiniReport({
        x: slotRect.left,
        y: slotRect.top,
        width: Math.max(220, slotRect.width),
        height: Math.max(30, slotRect.height),
      }).catch(error => {
        console.warn('主页苹果迷你报表没有显示。', error)
      })
    }

    const schedulePlacement = delay => {
      timers.push(window.setTimeout(placeReport, delay))
    }

    // 首次渲染、原生安全区完成、字体及五区布局稳定后分别校准。
    schedulePlacement(80)
    schedulePlacement(260)
    schedulePlacement(700)

    const resizeObserver = new ResizeObserver(placeReport)
    if (homeSnowTraceRef.current) {
      resizeObserver.observe(homeSnowTraceRef.current)
    }

    window.addEventListener('resize', placeReport)
    window.visualViewport?.addEventListener('resize', placeReport)

    return () => {
      cancelled = true
      timers.forEach(timer => window.clearTimeout(timer))
      resizeObserver.disconnect()
      window.removeEventListener('resize', placeReport)
      window.visualViewport?.removeEventListener('resize', placeReport)
      hideIOSHomeMiniReport().catch(() => {})
    }
  }, [useNativeIOSScreenTime, isHomeVisible])


  const homeStatusGoals = {
    steps:
      String(homeYesterdaySteps ?? '').trim() !== '' &&
      Number(homeYesterdaySteps) >= 5000,
    body: ['正好', '胖嘟'].includes(String(body?.label || '').trim()),
    rest: homeRestTimeReachedGoal(homeYesterdaySleep),
    fur: String(furDisplay || '').includes('浓密'),
    foodHealth: String(food?.healthLabel || '').trim() === '合理',
    furColor: String(food?.label || '').trim() === '雪白',
    mood: String(mood?.statusLabel || '').trim() === '正面',
    eyes: String(mood?.eyes || '').trim() === '圆亮',
  }

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

  function saveGoodNightIntroPreference() {
    if (!rememberGoodNightIntro) return

    try {
      localStorage.setItem(GOOD_NIGHT_INTRO_KEY, 'yes')
    } catch (error) {
      // 偏好保存失败不影响本次继续。
    }
  }

  function continueFromGoodNightIntro() {
    saveGoodNightIntroPreference()
    setRememberGoodNightIntro(false)
    continueGoodNight()
  }

  function openGoodNight() {
    let introDismissed = false

    try {
      introDismissed = localStorage.getItem(GOOD_NIGHT_INTRO_KEY) === 'yes'
    } catch (error) {
      introDismissed = false
    }

    if (introDismissed) {
      continueGoodNight()
      return
    }

    setRememberGoodNightIntro(false)
    setGoodNightModal({ type: 'intro' })
  }

  function toggleGoodNightSound() {
    setGoodNightSoundEnabled(current => {
      const next = !current

      try {
        localStorage.setItem(GOOD_NIGHT_SOUND_KEY, next ? 'on' : 'off')
      } catch (error) {
        // 音效偏好保存失败不影响当前开关。
      }

      return next
    })
  }

  function playGoodNightWindSound() {
  if (!goodNightSoundEnabled) return

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext

    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const now = context.currentTime

    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.025)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.25)
    master.connect(context.destination)

    function addPianoTone({
      frequency,
      start,
      duration,
      volume,
    }) {
      const oscillator = context.createOscillator()
      const overtone = context.createOscillator()
      const toneGain = context.createGain()
      const filter = context.createBiquadFilter()

      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now + start)

      overtone.type = 'sine'
      overtone.frequency.setValueAtTime(
        frequency * 2.01,
        now + start,
      )

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(6200, now + start)
      filter.Q.setValueAtTime(0.7, now + start)

      toneGain.gain.setValueAtTime(
        0.0001,
        now + start,
      )

      toneGain.gain.exponentialRampToValueAtTime(
        volume,
        now + start + 0.012,
      )

      toneGain.gain.exponentialRampToValueAtTime(
        volume * 0.24,
        now + start + 0.16,
      )

      toneGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + start + duration + 0.55,
      )

      oscillator.connect(filter)
      overtone.connect(filter)
      filter.connect(toneGain)
      toneGain.connect(master)

      oscillator.start(now + start)
      overtone.start(now + start)

      oscillator.stop(now + start + duration)
      overtone.stop(now + start + duration)
    }

    // 三个音依次上行，形成清脆、渐变的“晚安”提示。
    addPianoTone({
      frequency: 659.25, // E5
      start: 0,
      duration: 0.9,
      volume: 0.42,
    })

    addPianoTone({
      frequency: 783.99, // G5
      start: 0.12,
      duration: 0.9,
      volume: 0.34,
    })

    addPianoTone({
      frequency: 1046.5, // B5
      start: 0.24,
      duration: 1.0,
      volume: 0.28,
    })

    window.setTimeout(() => {
      context.close().catch(() => {})
    }, 1500)
  } catch (error) {
    // 音效失败不影响弹窗关闭。
  }
}

  function closeSavedGoodNight() {
    playGoodNightWindSound()
    setGoodNightModal(null)
  }




  return (
    <section className={`phoneShell homePage ${call.callActive ? 'callMode' : ''}`}>
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
            <span className="homeCausalLeft">你最近步数 <strong className={homeStatusValueClass(homeStatusGoals.steps)}>{homeYesterdaySteps}</strong> </span>
            <span
              className={`homeCausalArrow${homeStatusGoals.steps && homeStatusGoals.body ? ' homeCausalArrow-good' : ''}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 15 14" focusable="false">
                <path d="M2 4 L15.0 7 L2.3 11.6 Z" />
              </svg>
            </span>
            <span className="homeCausalRight">它体型 <strong className={homeStatusValueClass(homeStatusGoals.body)}>{body.label}</strong></span>
          </button>

          <button type="button" className="homeCausalRow" onClick={() => openDailyDetail('offscreen')}>
            <span className="homeCausalIcon">🌙</span>
            <span className="homeCausalLeft">你上次休息 <strong className={homeStatusValueClass(homeStatusGoals.rest)}>
  {formatHomeRestTime(homeYesterdaySleep)}
</strong> </span>
            <span
              className={`homeCausalArrow${homeStatusGoals.rest && homeStatusGoals.fur ? ' homeCausalArrow-good' : ''}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 15 14" focusable="false">
                <path d="M2 4 L15.0 7 L2.3 11.6 Z" />
              </svg>
            </span>
            <span className="homeCausalRight">它毛形 <strong className={homeStatusValueClass(homeStatusGoals.fur)}>{furDisplay}</strong></span>
          </button>

          <div className="homeCausalRow homeCausalSplitRow">
            <span className="homeCausalIcon">🍽️</span>
            <button type="button" className="homeCausalTextButton homeCausalLeft" onClick={() => openDailyDetail('food')}>你今日饮食 <strong className={homeStatusValueClass(homeStatusGoals.foodHealth)}>{food.healthLabel}</strong></button>
            <span
              className={`homeCausalArrow${homeStatusGoals.foodHealth && homeStatusGoals.furColor ? ' homeCausalArrow-good' : ''}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 15 14" focusable="false">
                <path d="M2 4 L15.0 7 L2.3 11.6 Z" />
              </svg>
            </span>
            <button type="button" className="homeCausalTextButton homeCausalRight" onClick={() => openDailyDetail('food')}>它毛色 <strong className={homeStatusValueClass(homeStatusGoals.furColor)}>{food.label}</strong></button>
          </div>

          <button type="button" className="homeCausalRow" onClick={() => openDailyDetail('mood')}>
            <span className="homeCausalIcon homeMoodFlowerShell">
              <img
                className={`homeMoodFlower homeMoodFlower-${moodFlower.level}`}
                src={moodFlower.src}
                alt={moodFlower.alt}
              />
            </span>
            <span className="homeCausalLeft">你今日心情 <strong className={homeStatusValueClass(homeStatusGoals.mood)}>{mood.statusLabel}</strong></span>
            <span
              className={`homeCausalArrow${homeStatusGoals.mood && homeStatusGoals.eyes ? ' homeCausalArrow-good' : ''}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 15 14" focusable="false">
                <path d="M2 4 L15.0 7 L2.3 11.6 Z" />
              </svg>
            </span>
            <span className="homeCausalRight">它眼睛 <strong className={homeStatusValueClass(homeStatusGoals.eyes)}>{mood.eyes}</strong></span>
          </button>
        </div>

        <div className="homeTodayActionRow">
          <button type="button" className="homeTodayEditText homeTodayCallText" onClick={call.callActive ? call.endCall : call.startCall}>
            <span className="homeTodayCallIcon" aria-hidden="true">💬</span>
            <em>{call.callActive ? '挂断' : '通话'}</em>
          </button>
          <button type="button" className="homeTodayEditText" onClick={openGoodNight}>
            <span className="homeTodayDataIcon" aria-hidden="true">
              <img
                className="homeTodayGoodNightIcon"
                src="/refine/home_goodnight_icon.png"
                alt=""
                draggable="false"
              />
            </span>
            <em>道晚安</em>
          </button>
          <button type="button" className="homeTodayEditText homeTodayStatusText" onClick={openTodayStatus}>
            <span className="homeTodayStatusIcon" aria-hidden="true">🗒️</span>
            <em>今日状态</em>
          </button>
        </div>

        <div ref={homeSnowTraceRef} className="homeSnowTrace">
          <img className="homeSnowBg" src="/refine/snow_background.png" alt="雪地留痕" />
          <p className="homeDeviceSummaryLine">
            {useNativeIOSScreenTime ? (
              <span className="homeIOSMiniReportButton">
                <span
                  ref={iosMiniReportRef}
                  className="homeIOSMiniReportSlot"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="homeIOSMiniValueLink homeIOSMiniAverageLink"
                  onClick={openScreenTimeSummary}
                  aria-label="打开苹果每日屏幕时间表"
                />
                <button
                  type="button"
                  className="homeIOSMiniValueLink homeIOSMiniLastLink"
                  onClick={openOffscreenTable}
                  aria-label="打开离机时间表"
                />
              </span>
            ) : (
              <span className="homeNonIOSDeviceSummary">
                <img
                  className="homeNonIOSDeviceIcon"
                  src="/refine/main_icon_screen.png"
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                />
                <button
                  type="button"
                  className="homeDeviceMetricButton"
                  onClick={openScreenTimeSummary}
                  aria-label="打开每日屏幕时间表"
                >
                  <span className="homeDeviceMetricLabel">日均</span>
                  <strong className="homeDeviceMetricValue">
                    {avgScreenPending ? '—' : avgScreenNumber}
                  </strong>
                </button>
                <span className="homeDeviceMetricDot" aria-hidden="true">·</span>
                <button
                  type="button"
                  className="homeDeviceMetricButton"
                  onClick={openOffscreenTable}
                  aria-label="打开离机时间表"
                >
                  <span className="homeDeviceMetricLabel">末次</span>
                  <strong className="homeDeviceMetricValue">
                    {formatHomeRawActivityTime(homeAndroidLastActivity)}
                  </strong>
                </button>
              </span>
            )}
          </p>
          <div className="homeTraceText">
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
        <div className="goodNightOverlay" role="dialog" aria-modal="true" aria-label="道晚安">
          <div className="goodNightBox">
            {goodNightModal.type === 'intro' && (
              <>
                <h2>道晚安</h2>
                <p>
                  “道晚安”会把你此刻准备停止使用手机的时间记入离机时间表，
                  作为当天休息时间的一个可靠来源。它对所有手机用户开放；
                  系统自动数据不准确时，也可以用这条记录帮助雪粒判断作息。
                </p>

                <label className="goodNightRememberLine">
                  <input
                    type="checkbox"
                    checked={rememberGoodNightIntro}
                    onChange={event =>
                      setRememberGoodNightIntro(event.target.checked)
                    }
                  />
                  下次不再提示
                </label>

                <button
                  type="button"
                  className="goodNightPrimaryButton"
                  onClick={continueFromGoodNightIntro}
                >
                  确定继续
                </button>

                <button
                  type="button"
                  className="goodNightQuietButton"
                  onClick={() => {
                    setRememberGoodNightIntro(false)
                    setGoodNightModal(null)
                  }}
                >
                  取消
                </button>
              </>
            )}

            {goodNightModal.type === 'confirm' && (
              <>
                <h2>{goodNightModal.title}</h2>
                <p>{goodNightModal.text}</p>

                <button
                  type="button"
                  className="goodNightPrimaryButton"
                  onClick={() => finishGoodNight(goodNightModal.info)}
                >
                  确认
                </button>

                <button
                  type="button"
                  className="goodNightQuietButton"
                  onClick={() => setGoodNightModal(null)}
                >
                  取消
                </button>
              </>
            )}

            {goodNightModal.type === 'saved' && (
              <>
                <div className="goodNightSavedTools">
                  <button
                    type="button"
                    className="goodNightHelpButton"
                    onClick={() =>
                      setGoodNightModal(previous => ({
                        type: 'help',
                        returnTo: previous,
                      }))
                    }
                  >
                    说明
                  </button>

                  <button
                    type="button"
                    className={`goodNightSoundSwitch${
                      goodNightSoundEnabled ? ' isOn' : ''
                    }`}
                    onClick={toggleGoodNightSound}
                    role="switch"
                    aria-checked={goodNightSoundEnabled}
                    aria-label={
                      goodNightSoundEnabled
                        ? '关闭晚安音效'
                        : '开启晚安音效'
                    }
                  >
                    <span className="goodNightSoundIcon" aria-hidden="true">
                      {goodNightSoundEnabled ? '♪' : '♪'}
                    </span>
                    <span className="goodNightSwitchTrack" aria-hidden="true">
                      <i />
                    </span>
                  </button>
                </div>

                <h2>{goodNightModal.title}</h2>
                <p>{goodNightModal.text}</p>

                <button
                  type="button"
                  className="goodNightPrimaryButton"
                  onClick={closeSavedGoodNight}
                >
                  知道了
                </button>
              </>
            )}

            {goodNightModal.type === 'help' && (
              <>
                <button
                  type="button"
                  className="goodNightHelpClose"
                  onClick={() =>
                    setGoodNightModal(
                      goodNightModal.returnTo || null
                    )
                  }
                  aria-label="关闭说明"
                >
                  ×
                </button>

                <h2>道晚安说明</h2>
                <p>
                  点击“道晚安”后，雪粒会记录当前时间。晚上记录计入当天；
                  凌晨 5 点以前记录为 24 点以后的时间，并计入前一日。
                </p>
                <p>
                  离机时间表会同时保留系统数据、通话识别和用户道晚安记录，
                  再按照现有优先逻辑计算最终休息时间。
                </p>
                <p>
                  音效开关只控制点击“知道了”时的一秒轻风声，
                  不影响任何数据记录。
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {isHomeVisible && (
      <nav className="homeBottomNav" aria-label="雪粒主页功能">
        <button type="button" onClick={() => openNutritionPage('today')}>
          <span className="homeNutritionNavIcon" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
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
