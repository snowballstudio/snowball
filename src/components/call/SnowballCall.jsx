import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`
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
    <section className="chatCard" ref={call.chatCardRef}>
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
              🐾 {brain.active ? '它很活跃' : '它很安静'}
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
          placeholder={
            call.isListening
              ? '正在听你说话...'
              : '点录音后说话，也可以直接打字...'
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
