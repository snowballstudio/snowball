import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import './Onboarding.css'
import {
  hasAcceptedAgreement,
  hasCompletedPermissionIntro,
  markAgreementAccepted,
  markLegacyUsagePromptHandled,
  markPermissionIntroCompleted,
} from './onboardingStorage'

const TERMS_URL = 'https://snowballstudio.github.io/snowball/terms.html'
const PRIVACY_URL = 'https://snowballstudio.github.io/snowball/privacy.html'

function openDocument(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export default function Onboarding({ data, setData, deviceData }) {
  const [agreementAccepted, setAgreementAccepted] = useState(() => hasAcceptedAgreement())
  const [permissionCompleted, setPermissionCompleted] = useState(() => hasCompletedPermissionIntro())
  const [declined, setDeclined] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  // 兼容旧数据：以前已关闭“欢迎安装雪粒”的用户，也仍需完成本版协议确认。
  useEffect(() => {
    if (!agreementAccepted || !permissionCompleted) return
    if (data?.hasSeenWelcome) return
    setData?.(prev => ({ ...prev, hasSeenWelcome: true }))
  }, [agreementAccepted, permissionCompleted, data?.hasSeenWelcome, setData])

  if (agreementAccepted && permissionCompleted) return null

  function acceptAgreement() {
    markAgreementAccepted()
    setAgreementAccepted(true)
    setDeclined(false)
    setMessage('')
  }

  function declineAgreement() {
    setDeclined(true)
    setMessage('')
  }

  async function startPermissionFlow() {
    if (busy) return
    setBusy(true)
    setMessage('')

    try {
      if (!Capacitor.isNativePlatform()) {
        markPermissionIntroCompleted()
        setPermissionCompleted(true)
        return
      }

      const platform = Capacitor.getPlatform()
      let status = await deviceData?.getStatus?.()

      // iPhone，或支持 Health Connect / 健康服务的 Android：请求步数授权。
      if (
        deviceData?.requestHealthPermissions &&
        (platform === 'ios' || status?.healthAvailable) &&
        !status?.healthPermissionGranted
      ) {
        try {
          await deviceData.requestHealthPermissions()
        } catch (error) {
          console.warn('步数授权未完成。', error)
        }
      }

      // Android 屏幕时间需要进入系统设置页。
      if (platform === 'android') {
        status = await deviceData?.getStatus?.()
        if (!status?.usageAccessGranted && deviceData?.openUsageAccessSettings) {
          markLegacyUsagePromptHandled()
          markPermissionIntroCompleted()
          setPermissionCompleted(true)
          await deviceData.openUsageAccessSettings()
          return
        }
      }

      markPermissionIntroCompleted()
      setPermissionCompleted(true)
    } catch (error) {
      console.warn('首次授权流程未完成。', error)
      setMessage('系统授权页面未能打开。您可以稍后在手机设置中完成授权。')
      markPermissionIntroCompleted()
      setPermissionCompleted(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboardingOverlay" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
      <section className="onboardingCard">
        {!agreementAccepted ? (
          declined ? (
            <>
              <h2 id="onboardingTitle">需要您的同意</h2>
              <p>
                不同意《用户协议》和《隐私政策》将无法继续使用雪粒。
                您可以关闭应用，或返回重新阅读。
              </p>
              <button
                type="button"
                className="onboardingPrimaryButton onboardingSingleButton"
                onClick={() => setDeclined(false)}
              >
                重新阅读
              </button>
            </>
          ) : (
            <>
              <h2 id="onboardingTitle">开始之前</h2>
              <p>
                雪粒通过生活数据的整理与可视化，帮助您回顾日常、规划生活，并获得及时反馈。
                请在继续使用前阅读并同意以下文件：
              </p>

              <div className="onboardingDocumentLinks">
                <button type="button" onClick={() => openDocument(TERMS_URL)}>
                  《用户协议》
                </button>
                <button type="button" onClick={() => openDocument(PRIVACY_URL)}>
                  《隐私政策》
                </button>
              </div>

              <p className="onboardingSmallText">
                点击“同意并继续”，即表示您已阅读并接受上述内容。
              </p>

              <div className="onboardingActions">
                <button type="button" className="onboardingSecondaryButton" onClick={declineAgreement}>
                  不同意
                </button>
                <button type="button" className="onboardingPrimaryButton" onClick={acceptAgreement}>
                  同意并继续
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <h2 id="onboardingTitle">允许自动获取数据</h2>
            <p>
              为减少手动填写，并帮助您更准确地回顾和规划生活，雪粒需要读取以下数据：
            </p>

            <div className="onboardingPermissionList">
              <div><span>✓</span><strong>步数</strong></div>
              <div><span>✓</span><strong>屏幕时间</strong></div>
            </div>

            <p>
              点击“开始授权”后，系统可能显示健康数据授权窗口，或带您前往“使用情况访问权限”页面。
              数据默认仅保存在您的设备中，您可以随时在系统设置中关闭权限。
            </p>

            {message && <p className="onboardingMessage">{message}</p>}

            <button
              type="button"
              className="onboardingPrimaryButton onboardingSingleButton"
              onClick={startPermissionFlow}
              disabled={busy}
            >
              {busy ? '正在打开授权…' : '开始授权'}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
