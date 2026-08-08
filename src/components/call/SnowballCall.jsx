import { useEffect, useLayoutEffect, useRef } from 'react'
import './SnowballCall.css'

export default function SnowballCall({
  call,
  data,
  setData,
  brain,
  catImg,
  imageFilter,
}) {
  const inputRef = useRef(null)
  const iosKeyboardOpenRef = useRef(false)
  const callViewportReadyRef = useRef(false)

  function isIOSWebKit() {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    const platform = navigator.platform || ''
    const touchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1
    return /iPad|iPhone|iPod/i.test(ua) || touchMac
  }

  function isAndroidWebView() {
    if (typeof navigator === 'undefined') return false
    return /Android/i.test(navigator.userAgent || '')
  }

  function keepMessagesAtBottom() {
    const messages = call.messagesRef.current
    if (!messages) return

    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight
    })
  }

  function syncIOSVisualViewport() {
    if (!isIOSWebKit() || !window.visualViewport) return

    const viewport = window.visualViewport
    document.documentElement.style.setProperty(
      '--snowball-call-visual-height',
      `${Math.round(viewport.height)}px`,
    )
    keepMessagesAtBottom()
  }

  function prepareIOSKeyboardLayout() {
    if (!isIOSWebKit()) return

    iosKeyboardOpenRef.current = true
    document.documentElement.classList.add('snowballCallKeyboardOpen')
    syncIOSVisualViewport()
  }

  function handleInputPointerDown(event) {
    if (!isIOSWebKit()) return

    const textarea = inputRef.current
    if (!textarea || document.activeElement === textarea) return

    /*
      只拦截一次原生聚焦。
      上一版同时绑定 pointerdown 和 touchstart，iPhone 第一次点击会触发两次，
      并且在键盘出现前就重算整个页面高度，所以首次会被推上去很远。
    */
    event.preventDefault()

    if (!callViewportReadyRef.current) {
      const phoneShell = textarea.closest('.phoneShell')
      const homePage = textarea.closest('.homePage')
      if (phoneShell) phoneShell.scrollTop = 0
      if (homePage) homePage.scrollTop = 0
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      callViewportReadyRef.current = true
    }

    try {
      textarea.focus({ preventScroll: true })
    } catch {
      textarea.focus()
    }

    prepareIOSKeyboardLayout()

    const end = textarea.value.length
    textarea.setSelectionRange(end, end)
  }

  function handleInputFocus() {
    prepareIOSKeyboardLayout()
  }

  function handleInputBlur() {
    if (!isIOSWebKit()) return
    iosKeyboardOpenRef.current = false

    window.setTimeout(() => {
      document.documentElement.classList.remove('snowballCallKeyboardOpen')
      document.documentElement.style.removeProperty('--snowball-call-visual-height')
    }, 120)
  }

  /*
    通话组件首次出现时，先在浏览器绘制前清零主页外层残留滚动位置。
    iPhone 第一次点输入框整体上冲，通常是因为 phoneShell 仍保留着
    进入通话前主页的 scrollTop；iOS 聚焦时会沿用这个旧偏移来定位 textarea。
    清零只执行一次，不在键盘打开期间反复抢滚动位置。
  */
  useLayoutEffect(() => {
    if (!call.callActive) return undefined

    const textarea = inputRef.current
    const phoneShell = textarea?.closest('.phoneShell')
    const homePage = textarea?.closest('.homePage')

    if (phoneShell) phoneShell.scrollTop = 0
    if (homePage) homePage.scrollTop = 0
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    window.scrollTo(0, 0)

    callViewportReadyRef.current = true

    return () => {
      callViewportReadyRef.current = false
    }
  }, [call.callActive])

  useEffect(() => {
    if (!isAndroidWebView()) return undefined

    document.documentElement.classList.add('snowballAndroidApp')

    return () => {
      document.documentElement.classList.remove('snowballAndroidApp')
    }
  }, [])

  useEffect(() => {
    if (!isIOSWebKit() || !window.visualViewport) return undefined

    const viewport = window.visualViewport
    const handleViewportChange = () => {
      if (!iosKeyboardOpenRef.current) return
      syncIOSVisualViewport()
    }

    viewport.addEventListener('resize', handleViewportChange)
    viewport.addEventListener('scroll', handleViewportChange)

    return () => {
      viewport.removeEventListener('resize', handleViewportChange)
      viewport.removeEventListener('scroll', handleViewportChange)
      document.documentElement.classList.remove('snowballCallKeyboardOpen')
      document.documentElement.style.removeProperty('--snowball-call-visual-height')
    }
  }, [])

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`
    keepMessagesAtBottom()
  }, [data.chatInput])

  function handleInputChange(event) {
    setData(prev => ({
      ...prev,
      chatInput: event.target.value,
    }))
  }

  function handleInputKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    call.sendMessage()
  }

  if (!call.callActive) return null

  return (
    <section className="chatCard snowballCallCard" ref={call.chatCardRef}>
      <div className="chatTop">
        <div className="chatActionLine">
          <button
            type="button"
            className="callBtn callEnd"
            onClick={call.endCall}
          >
            🔴 结束通话
          </button>

          <div className="brainCallStatus">
            <span>
              🧠 脑动 <strong>{brain.label}</strong>
            </span>
            <span className={brain.active ? 'active' : ''}>
              🐾 {brain.active ? '活泼' : '安静'}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="textBtn"
          onClick={call.clearConversation}
        >
          清空
        </button>
      </div>

      <div className="messages" ref={call.messagesRef}>
        {data.messages.map((message, index) => (
          <div
            key={message.id || `${message.from}-${index}`}
            className={`messageRow ${message.from}`}
          >
            {message.from === 'cat' && (
              <img
                src={catImg}
                style={{ filter: imageFilter }}
                alt="雪粒头像"
              />
            )}

            <div className="messageContent">
              <div className="messageTime">
                {message.dateTime || ''}
              </div>
              <div className={`bubble ${message.from}`}>
                {message.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="inputLine inputLineVoice">
        <textarea
          ref={inputRef}
          rows={1}
          value={data.chatInput}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onPointerDown={handleInputPointerDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={
            call.isListening
              ? '正在听你说话...'
              : '语音或打字，空格快进'
          }
          aria-label="通话文字输入"
        />

        <button
          type="button"
          className={`voiceBtn ${call.isListening ? 'listening' : ''}`}
          onClick={call.toggleSpeechRecognition}
          title={
            call.speechRecognitionSupported
              ? call.isListening
                ? '停止录音'
                : '开始录音'
              : '当前浏览器暂不支持语音输入'
          }
        >
          {call.isListening ? '●' : '🎙'}
        </button>

        <button
          type="button"
          className="sendBtn"
          onClick={call.sendMessage}
          title="发送或跳到下一轮"
        >
          ➤
        </button>
      </div>
    </section>
  )
}
