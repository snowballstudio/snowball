import './Home.css'

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
  openTodayStatus,
  homeTraceStats,
  callActive,
  chatCardRef,
  startCall,
  endCall,
  brain,
  clearConversation,
  data,
  messagesRef,
  setData,
  sendMessage,
  isListening,
  speechRecognitionSupported,
  toggleSpeechRecognition,
  sayGoodNight,
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

      {callActive && (
      <section className="chatCard" ref={chatCardRef}>
        <div className="chatTop">
          <div className="chatActionLine">
            {!callActive ? (
              <button className="callBtn callStart" onClick={startCall}>🎙️ 开始通话</button>
            ) : (
              <button className="callBtn callEnd" onClick={endCall}>🔴 结束通话</button>
            )}
            <div className="brainCallStatus">
              <span>🧠 脑动 <strong>{brain.label}</strong></span>
              <span className={brain.active ? 'active' : ''}>🐾 {brain.active ? '它很活跃' : '它很安静'}</span>
            </div>
          </div>
          <button className="textBtn" onClick={clearConversation}>清空</button>
        </div>

        <div className="messages" ref={messagesRef}>
          {data.messages.map((m, i) => (
            <div key={i} className={`messageRow ${m.from}`}>
              {m.from === 'cat' && <img src={catImg} style={{ filter: imageFilter }} alt="雪粒头像" />}
              <div className={`bubble ${m.from}`}>{m.text}</div>
            </div>
          ))}
        </div>

        <div className="inputLine inputLineVoice">
          <button className="nightBtn" onClick={sayGoodNight}>道晚安</button>
          <input
            value={data.chatInput}
            onChange={e => setData({ ...data, chatInput: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder={isListening ? '正在听你说话...' : '可以说话，也可以打字...'}
          />
          <button
            className={`voiceBtn ${isListening ? 'listening' : ''}`}
            onClick={toggleSpeechRecognition}
            title={speechRecognitionSupported ? '语音输入' : '当前浏览器暂不支持语音输入'}
            type="button"
          >
            {isListening ? '●' : '🎙'}
          </button>
          <button className="sendBtn" onClick={sendMessage}>➤</button>
        </div>
      </section>
      )}

      <section className="statusCards homeDashboard">
        <div className="homeCausalStatus">
          <button type="button" className="homeCausalRow" onClick={() => openDailyDetail('steps')}>
            <span className="homeCausalIcon">👟</span>
            <span className="homeCausalLeft">你上次步数 <strong>{homeYesterdaySteps}</strong> </span>
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
            <span className="homeCausalIcon">🙂</span>
            <span className="homeCausalLeft">你今日心情 <strong>{mood.statusLabel}</strong></span>
            <span className="homeCausalArrow">→</span>
            <span className="homeCausalRight">它眼睛 <strong>{mood.eyes}</strong></span>
          </button>
        </div>

        <div className="homeTodayActionRow">
          <button type="button" className="homeTodayEditText homeTodayCallText" onClick={callActive ? endCall : startCall}>
            <span className="homeTodayCallIcon" aria-hidden="true">💬</span>
            <em>{callActive ? '挂断' : '通话'}</em>
          </button>
          <button type="button" className="homeTodayEditText" onClick={beginHomeTodayEdit}>
            <span className="homeTodayDataIcon" aria-hidden="true">✎</span>
            <em>今日数据</em>
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
