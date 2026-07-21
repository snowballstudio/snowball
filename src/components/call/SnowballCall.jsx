import './SnowballCall.css'

export default function SnowballCall({
  call,
  data,
  setData,
  brain,
  catImg,
  imageFilter,
}) {
  if (!call.callActive) return null

  return (
    <section className="chatCard" ref={call.chatCardRef}>
      <div className="chatTop">
        <div className="chatActionLine">
          <button className="callBtn callEnd" onClick={call.endCall}>🔴 结束通话</button>
          <div className="brainCallStatus">
            <span>🧠 脑动 <strong>{brain.label}</strong></span>
            <span className={brain.active ? 'active' : ''}>🐾 {brain.active ? '它很活跃' : '它很安静'}</span>
          </div>
        </div>
        <button className="textBtn" onClick={call.clearConversation}>清空</button>
      </div>

      <div className="messages" ref={call.messagesRef}>
        {data.messages.map((message, index) => (
          <div key={index} className={`messageRow ${message.from}`}>
            {message.from === 'cat' && (
              <img src={catImg} style={{ filter: imageFilter }} alt="雪粒头像" />
            )}
            <div className={`bubble ${message.from}`}>{message.text}</div>
          </div>
        ))}
      </div>

      <div className="inputLine inputLineVoice">
        <button className="nightBtn" onClick={call.sayGoodNight}>道晚安</button>
        <input
          value={data.chatInput}
          onChange={event => setData(prev => ({ ...prev, chatInput: event.target.value }))}
          onKeyDown={event => event.key === 'Enter' && call.sendMessage()}
          placeholder={call.isListening ? '正在听你说话...' : '可以说话，也可以打字...'}
        />
        <button
          className={`voiceBtn ${call.isListening ? 'listening' : ''}`}
          onClick={call.toggleSpeechRecognition}
          title={call.speechRecognitionSupported ? '语音输入' : '当前浏览器暂不支持语音输入'}
          type="button"
        >
          {call.isListening ? '●' : '🎙'}
        </button>
        <button className="sendBtn" onClick={call.sendMessage}>➤</button>
      </div>
    </section>
  )
}
